import type { DevToolsConfig } from "@vitejs/devtools/config";
import type { HookParameters } from "astro";
import type { DevframeDefinition } from "devframe";
import type { Plugin } from "vite";

import { devframeViteBridge } from "@devframes/vite/single";

import type { VitePackage } from "./package-info.ts";
import type { AstroDevtoolsStore } from "./store.ts";
import type { AstroDevtoolsOptions } from "./types.ts";

import { actionsMetadataPlugin } from "./actions-metadata.ts";
import { resolveBranding } from "./branding.ts";
import { astroDevtoolsVitePlugin } from "./vite-plugin.ts";

type ConfigSetupParams = HookParameters<"astro:config:setup">;
type Logger = ConfigSetupParams["logger"];

/**
 * Vite's `devtools` option as the user may have written it in the Astro
 * config's `vite` block: `true`, a config object, `false`, or nothing. Vite
 * 8.3 treats an object as enabled unless it says `enabled: false`. `null` is
 * off the declared type but an `astro.config.mjs` is not type-checked, and
 * Vite reads it as disabled (`isDevToolsOptionEnabled` guards `config != null`),
 * so it is a spelling this has to survive rather than throw on.
 */
type UserDevToolsConfig = boolean | DevToolsConfig | null | undefined;

/** The plugin `DevTools()` registers; finding it means a manual registration. */
const DEVTOOLS_SERVER_PLUGIN_NAME = "vite:devtools:server";

/**
 * The oldest release of each known Vite distribution whose `devtools` option
 * registers Vite DevTools in the dev server (Vite 8.3, vitejs/vite#23333).
 * Vite+ aliases `vite` to its own core package, whose 0.3.2 is the first
 * release based on Vite 8.3.
 */
const MINIMUM_VITE_VERSIONS: Record<string, string> = {
  vite: "8.3.0",
  "@voidzero-dev/vite-plus-core": "0.3.2",
};

/**
 * Wire the integration into the dev server: its own Vite plugins, the MCP
 * bridge, and its own defaults beneath the user's `vite.devtools`. Vite
 * DevTools itself is registered by Vite from that option (Vite 8.3+), never
 * by this integration, so the user's settings and the integration's defaults
 * meet in one place. Returns whether a DevTools server will serve this
 * session, which decides whether the embedded dock gets injected. The MCP
 * bridge is skipped on non-loopback hosts unless `mcp: true` asks for it
 * explicitly — see `shouldServeMcp`.
 */
export async function registerVitePlugins(
  store: AstroDevtoolsStore,
  options: AstroDevtoolsOptions,
  devframeDefinition: DevframeDefinition,
  {
    config,
    logger,
    updateConfig,
    vitePackage,
  }: Pick<ConfigSetupParams, "config" | "logger" | "updateConfig"> & {
    /** The `vite` package the project runs on, for the version gate. */
    vitePackage: VitePackage | undefined;
  },
): Promise<boolean> {
  const vitePlugins: unknown[] = [astroDevtoolsVitePlugin(store), actionsMetadataPlugin()];
  if (options.mcp !== false) {
    vitePlugins.push(mcpBridgePlugin(devframeDefinition, options.mcp, logger));
  }
  const devtools = resolveDevToolsPatch(config.vite.devtools, {
    hasManualPlugin: await hasDevToolsPlugin(config.vite.plugins),
    vitePackage,
    logger,
  });
  const injectsDock = devtools.active && options.inject !== false;
  updateConfig({
    vite: {
      ...(devtools.patch === undefined ? {} : { devtools: devtools.patch }),
      plugins: vitePlugins as NonNullable<typeof config.vite.plugins>,
      // `injectScript` is invisible to Vite's dependency scanner. Prebundle
      // the injected browser entry before the first page load to avoid a
      // mid-request dependency rebuild.
      optimizeDeps: {
        include: injectsDock ? ["astro-devtools/inject"] : [],
      },
    },
  });
  return devtools.active;
}

/** What the integration decided about the DevTools host for this dev run. */
interface DevToolsDecision {
  /**
   * Fields to merge beneath the user's `vite.devtools` through
   * `updateConfig`, or `undefined` to leave the option untouched.
   */
  patch: DevToolsConfig | undefined;
  /** Whether a DevTools server will run, so the embedded dock is worth injecting. */
  active: boolean;
}

/**
 * Decide how the DevTools host is configured. Every field the user set in
 * `vite.devtools` wins; the integration only fills in what they left unset:
 * `apply: "serve"`, the hub's own aggregate MCP route off, Astro branding,
 * and the one-time access code announced through Astro's logger. Astro
 * merges the patch into the user's value with Vite's own `mergeConfig`, so
 * a plain `devtools: true` becomes the patch and an object gains only the
 * missing fields.
 */
function resolveDevToolsPatch(
  userConfig: UserDevToolsConfig,
  {
    hasManualPlugin,
    vitePackage,
    logger,
  }: { hasManualPlugin: boolean; vitePackage: VitePackage | undefined; logger: Logger },
): DevToolsDecision {
  // `typeof null === "object"`, so null is ruled out before the property test.
  if (
    userConfig === false ||
    userConfig === null ||
    (typeof userConfig === "object" && userConfig.enabled === false)
  ) {
    logger.debug("Vite DevTools is disabled through `vite.devtools`; skipping the dock.");
    return { patch: undefined, active: false };
  }
  if (hasManualPlugin) {
    // Vite would throw DTK0034 for a second `vite:devtools` registration,
    // so the option must stay untouched next to a manual `DevTools()`.
    logger.warn(
      "`DevTools()` from @vitejs/devtools is registered in `vite.plugins`. astro-devtools " +
        "configures Vite's `devtools` option instead and leaves it untouched here to avoid a " +
        "duplicate registration (DTK0034): remove that plugin to get the Astro branding, the " +
        "access code in this log, and the DevTools hub's own MCP route kept off.",
    );
    return { patch: undefined, active: true };
  }
  const unsupported = unsupportedViteMessage(vitePackage);
  if (unsupported !== undefined) {
    logger.error(unsupported);
    return { patch: undefined, active: false };
  }
  const user = typeof userConfig === "object" ? userConfig : {};
  if (user.apply === "build") {
    logger.debug("`vite.devtools.apply` limits Vite DevTools to builds; skipping the dock.");
    return { patch: undefined, active: false };
  }
  const patch: DevToolsConfig = { branding: resolveBranding(user.branding) };
  // The integration only runs in `astro dev`; the patch says so itself, so
  // the option stays dev-only even if it ever reached a build.
  if (user.apply === undefined) patch.apply = "serve";
  // The DevTools hub mounts its own aggregate MCP route at `/__devtools/__mcp`
  // as soon as any agent-tagged RPC function exists (devframe's `'auto'`
  // default) — by default always: its built-in terminals plugin tags its own
  // functions, before this integration adds its agent-tagged ones to the hub.
  // That route would expose the hub's whole tool registry (terminals
  // included) without authentication to any loopback-origin page, or local
  // process sending such an Origin header, and neither `options.mcp` nor the
  // bind-address gate reaches it — keep the bridge the only MCP surface
  // unless the user turns the route on knowingly.
  if (user.mcp === undefined) patch.mcp = false;
  if (user.banner === undefined) patch.banner = createAuthBanner(logger);
  return { patch, active: true };
}

/**
 * Route the interactive-auth banner — the one-time access code and its
 * magic-link URL — through Astro's logger, so it lands in `astro dev` output
 * as a regular timestamped `[astro-devtools]` line instead of devframe's
 * boxed `console.log`. Vite DevTools calls it only when a browser asks for a
 * code (the dock's auth notice mounting, or its re-issue button), never on a
 * plain page load.
 */
function createAuthBanner(logger: Logger): NonNullable<DevToolsConfig["banner"]> {
  return ({ code, url }) => {
    logger.info(`DevTools access code: ${code} (or open ${url})`);
  };
}

/**
 * The error to log when the detected Vite cannot register Vite DevTools
 * from its `devtools` option, or `undefined` when it can — or when the
 * package is unknown, which is left to Vite to report.
 */
function unsupportedViteMessage(vitePackage: VitePackage | undefined): string | undefined {
  if (vitePackage === undefined) return undefined;
  const minimum = MINIMUM_VITE_VERSIONS[vitePackage.name];
  if (minimum === undefined || compareVersions(vitePackage.version, minimum) >= 0) {
    return undefined;
  }
  return (
    `${vitePackage.name}@${vitePackage.version} does not register Vite DevTools from its ` +
    `\`devtools\` option; astro-devtools needs ${vitePackage.name} ${minimum} or newer ` +
    "(Vite 8.3). The Astro dock and panels stay off; the MCP endpoint is unaffected."
  );
}

/**
 * Compare two dotted version strings numerically. A prerelease tag ranks
 * below the release it precedes; anything else after the numbers is ignored.
 */
function compareVersions(left: string, right: string): number {
  const parse = (version: string) => {
    // Build metadata says nothing about precedence, and dropping it before
    // the split also keeps a `-` inside it from reading as a prerelease tag.
    const [numbers = "", prerelease] = version.replace(/\+.*$/, "").split("-", 2);
    // `parseInt` keeps each part's leading digits, so a version that still
    // carries something else after its numbers compares by those numbers
    // instead of turning the whole comparison into `NaN` — which would rank
    // it below every minimum and disable the dock on a supported Vite.
    return {
      parts: numbers.split(".").map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prerelease !== undefined,
    };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);
  const length = Math.max(leftVersion.parts.length, rightVersion.parts.length);
  for (let index = 0; index < length; index++) {
    const order = (leftVersion.parts[index] ?? 0) - (rightVersion.parts[index] ?? 0);
    if (order !== 0) return order;
  }
  return Number(rightVersion.prerelease) - Number(leftVersion.prerelease);
}

/**
 * Gate the whole bridge when Vite starts the server, after every Astro
 * integration and Vite config hook has settled the bind address. Deciding
 * in astro:config:setup would miss a later integration's host changes.
 * Keep the bridge's other hooks, including its shutdown cleanup.
 *
 * Vite restarts its dev server on the same plugin objects — Astro asks for a
 * restart as soon as the actions file appears — and it mounts the new server
 * before closing the old one, then runs `closeBundle` for the old one. A
 * bridge keeps its devframe instance in a closure, so the two hooks it offers
 * for shutdown do not agree once a restart has happened: `closeBundle` closes
 * whatever instance the closure holds, which by then is the new server's, and
 * the MCP endpoint answers 500 ("This MCP handler has been closed") for the
 * rest of the run while `__connection.json` keeps advertising it. The bridge's
 * other cleanup — the `close` listener it puts on the server it mounted on —
 * pairs each instance with its own server, so that is the one to keep: every
 * server gets its own bridge, and `closeBundle` is not forwarded.
 */
function mcpBridgePlugin(
  definition: DevframeDefinition,
  mcp: AstroDevtoolsOptions["mcp"],
  logger: Logger,
): Plugin {
  // Native MCP clients cannot complete browser OTP. The final bind-address
  // gate protects all of the bridge's unauthenticated transports, including
  // discovery and WS/SSE, before any middleware or listeners are installed.
  const createBridge = (): Plugin =>
    devframeViteBridge(definition, { auth: false, mcp: { allowedOrigins: false } });
  // Only for the plugin's static fields; a bridge that never mounts holds no
  // instance to clean up, and every served server builds its own.
  const { configureServer: _mount, closeBundle: _close, ...pluginFields } = createBridge();
  return {
    ...pluginFields,
    configureServer(server) {
      if (!shouldServeMcp(mcp, server.config.server.host, logger)) return;
      const hook = createBridge().configureServer;
      return typeof hook === "function"
        ? hook.call(this, server)
        : hook?.handler.call(this, server);
    },
  };
}

/**
 * The MCP endpoint answers without authentication or origin checks (native
 * MCP clients provide neither), so its gate is the bind address: always
 * served while the dev server stays on loopback, but on a network-reachable
 * host only an explicit `mcp: true` keeps it up — a plain default stays off
 * with a log note, so `--host` never silently exposes the endpoint.
 */
function shouldServeMcp(
  mcp: AstroDevtoolsOptions["mcp"],
  host: string | boolean | undefined,
  logger: Logger,
): boolean {
  if (mcp === false) return false;
  if (isLoopbackHost(host)) return true;
  const hostLabel = `\`server.host: ${JSON.stringify(host)}\``;
  if (mcp === undefined) {
    logger.info(
      `MCP endpoint disabled: ${hostLabel} makes the dev server reachable from the network, ` +
        "and the endpoint answers without authentication. Set `mcp: true` to serve it anyway, " +
        "or `mcp: false` to silence this message.",
    );
    return false;
  }
  logger.warn(
    `\`mcp: true\` serves the MCP endpoint on the network-reachable ${hostLabel}: anyone who ` +
      "can reach the dev server can query project metadata (read-only) without authentication.",
  );
  return true;
}

/** `false` (Astro's default) binds to localhost; `true` binds to every address. */
function isLoopbackHost(host: string | boolean | undefined): boolean {
  if (typeof host !== "string") return host !== true;
  const name = host.toLowerCase();
  return (
    name === "localhost" || name === "::1" || name === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(name)
  );
}

/** Whether a plugin value — a nested array or a promise of one included — registers Vite DevTools. */
async function hasDevToolsPlugin(plugins: unknown): Promise<boolean> {
  const resolved: unknown = await plugins;
  if (Array.isArray(resolved)) {
    for (const plugin of resolved) {
      if (await hasDevToolsPlugin(plugin)) return true;
    }
    return false;
  }
  return (
    typeof resolved === "object" &&
    resolved !== null &&
    "name" in resolved &&
    resolved.name === DEVTOOLS_SERVER_PLUGIN_NAME
  );
}

/**
 * `transformIndexHtml`, which Vite DevTools uses to load the hub's embedded
 * client, never runs in Astro (there is no index.html). Load this package's
 * equivalent runtime injector on every page instead.
 */
export function injectDevtoolsDock(injectScript: ConfigSetupParams["injectScript"]): void {
  injectScript("page", `import "astro-devtools/inject";`);
}
