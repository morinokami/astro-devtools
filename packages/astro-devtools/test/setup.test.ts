import type { DevToolsConfig } from "@vitejs/devtools/config";
import type { HookParameters } from "astro";
import type { Plugin, ViteDevServer } from "vite";

import { describe, expect, it, vi } from "vite-plus/test";

import type { VitePackage } from "../src/package-info.ts";
import type { AstroDevtoolsOptions } from "../src/types.ts";

import { createAstroDevframe } from "../src/devframe.ts";
import { registerVitePlugins } from "../src/setup.ts";
import { createStore } from "../src/store.ts";

const { startBridge, builtBridges } = vi.hoisted(() => ({
  startBridge: vi.fn(),
  /** Every bridge the factory handed out, to count them per mount. */
  builtBridges: [] as unknown[],
}));
vi.mock("@devframes/vite/single", () => ({
  devframeViteBridge: () => {
    // A real bridge keeps its devframe instance in a closure and closes it
    // from both of these hooks, so each call has to be its own object.
    const bridge = {
      name: "devframe:astro-devtools",
      apply: "serve",
      configureServer: startBridge,
      closeBundle: () => undefined,
    };
    builtBridges.push(bridge);
    return bridge;
  },
}));

type ConfigSetupParams = HookParameters<"astro:config:setup">;

/** A stand-in for the server plugin a manual `DevTools()` registers. */
const DEVTOOLS_SERVER_PLUGIN = { name: "vite:devtools:server" } as const;
/** The first Vite that registers DevTools from its `devtools` option. */
const VITE_8_3: VitePackage = { name: "vite", version: "8.3.0" };

interface RegistrationInput {
  options?: AstroDevtoolsOptions;
  /** The user's `vite.devtools`, as written in the Astro config. */
  devtools?: boolean | DevToolsConfig;
  vitePlugins?: unknown[];
  /** `null` stands for a Vite whose package could not be resolved. */
  vitePackage?: VitePackage | null;
  host?: string | boolean;
  resolvedHost?: string | boolean;
}

/** Run plugin registration with a minimal Astro hook context. */
async function runRegistration({
  options = {},
  devtools,
  vitePlugins = [],
  vitePackage = VITE_8_3,
  host = false,
  resolvedHost = host,
}: RegistrationInput = {}) {
  const logs = {
    warn: [] as string[],
    info: [] as string[],
    debug: [] as string[],
    error: [] as string[],
  };
  let update: {
    vite?: { plugins?: unknown[]; optimizeDeps?: unknown; devtools?: DevToolsConfig };
  } = {};
  const store = createStore();
  const active = await registerVitePlugins(store, options, createAstroDevframe(store, "0.0.0"), {
    config: {
      vite: { plugins: vitePlugins, devtools },
      server: { host },
    } as unknown as ConfigSetupParams["config"],
    updateConfig: ((config: typeof update) => {
      update = config;
      return config;
    }) as unknown as ConfigSetupParams["updateConfig"],
    logger: {
      warn: (message: string) => void logs.warn.push(message),
      info: (message: string) => void logs.info.push(message),
      debug: (message: string) => void logs.debug.push(message),
      error: (message: string) => void logs.error.push(message),
    } as unknown as ConfigSetupParams["logger"],
    vitePackage: vitePackage ?? undefined,
  });
  const registeredPlugins = update.vite?.plugins ?? [];
  const bridge = registeredPlugins.find(
    (plugin) => (plugin as Plugin).name === "devframe:astro-devtools",
  ) as Plugin | undefined;
  startBridge.mockClear();
  const hook = bridge?.configureServer;
  if (typeof hook === "function") {
    await hook.call(
      {} as never,
      {
        config: { server: { host: resolvedHost } },
      } as ViteDevServer,
    );
  }
  return {
    active,
    logs,
    registeredPlugins,
    optimizeDeps: update.vite?.optimizeDeps,
    patch: update.vite?.devtools,
    bridgeStarted: startBridge.mock.calls.length > 0,
  };
}

/** Flattened plugin names, the way Vite sees the registered array. */
function pluginNames(registeredPlugins: unknown[]): (string | undefined)[] {
  return registeredPlugins.flat().map((plugin) => (plugin as { name?: string }).name);
}

describe("registerVitePlugins", () => {
  it("registers only its own plugins; Vite adds DevTools from `vite.devtools`", async () => {
    const { active, logs, registeredPlugins } = await runRegistration();

    expect(active).toBe(true);
    expect(logs.warn).toEqual([]);
    expect(logs.error).toEqual([]);
    expect(pluginNames(registeredPlugins)).toEqual([
      "astro-devtools",
      "astro-devtools:actions-metadata",
      "devframe:astro-devtools",
    ]);
  });

  it("fills the integration's defaults into `vite.devtools`", async () => {
    const { patch } = await runRegistration();

    expect(patch).toEqual({
      apply: "serve",
      // The hub would mount `/__devtools/__mcp` for the agent-tagged Astro
      // functions on its own.
      mcp: false,
      banner: expect.any(Function),
      branding: expect.objectContaining({ productName: "Astro DevTools" }),
    });
  });

  it("routes the access code through Astro's logger", async () => {
    const { patch, logs } = await runRegistration();

    patch?.banner?.({ code: "286088", url: "http://localhost:4321/#devframe_otp=286088" });

    expect(logs.info).toEqual([
      "DevTools access code: 286088 (or open http://localhost:4321/#devframe_otp=286088)",
    ]);
  });

  it("treats a bare `vite.devtools: true` like an empty object", async () => {
    const { active, patch } = await runRegistration({ devtools: true });

    expect(active).toBe(true);
    expect(patch).toMatchObject({ apply: "serve", mcp: false });
  });

  it("keeps every field the user set in `vite.devtools`", async () => {
    const banner = () => {};
    const { active, patch } = await runRegistration({
      devtools: {
        apply: "all",
        mcp: true,
        banner,
        branding: { productName: "My DevTools" },
        embeddedVisibility: "passive",
      },
    });

    expect(active).toBe(true);
    // Astro merges the patch over the user's object, so only fields the
    // user left unset may appear in it.
    expect(Object.keys(patch ?? {})).toEqual(["branding"]);
    expect(patch?.branding).toMatchObject({
      productName: "My DevTools",
      windowTitle: "Astro DevTools",
    });
  });

  it("reads a null `vite.devtools` as disabled, the way Vite does", async () => {
    // `null` is outside the option's declared type, but an `astro.config.mjs`
    // is not type-checked and can spell it, and Vite's own
    // `isDevToolsOptionEnabled` reads it as off. `typeof null === "object"`,
    // so it has to be ruled out before the `enabled` property test.
    const { active, patch, logs } = await runRegistration({
      devtools: null as unknown as DevToolsConfig,
    });

    expect(active).toBe(false);
    expect(patch).toBeUndefined();
    expect(logs.error).toEqual([]);
    expect(logs.debug).toHaveLength(1);
  });

  it.each([false, { enabled: false }])(
    "leaves the option alone when the user disabled Vite DevTools with %j",
    async (devtools) => {
      const { active, patch, optimizeDeps, logs } = await runRegistration({ devtools });

      expect(active).toBe(false);
      expect(patch).toBeUndefined();
      expect(optimizeDeps).toEqual({ include: [] });
      expect(logs.warn).toEqual([]);
      expect(logs.debug).toHaveLength(1);
    },
  );

  it("skips the dock when the user limits Vite DevTools to builds", async () => {
    const { active, patch } = await runRegistration({ devtools: { apply: "build" } });

    expect(active).toBe(false);
    expect(patch).toBeUndefined();
  });

  it("leaves the option alone next to a manual `DevTools()` registration", async () => {
    const { active, patch, optimizeDeps, logs } = await runRegistration({
      vitePlugins: [DEVTOOLS_SERVER_PLUGIN],
    });

    // Vite would throw DTK0034 for a second `vite:devtools` plugin.
    expect(patch).toBeUndefined();
    expect(logs.warn).toHaveLength(1);
    expect(logs.warn[0]).toContain("DTK0034");
    // The manual plugin serves the dock, so it is still injected.
    expect(active).toBe(true);
    expect(optimizeDeps).toEqual({ include: ["astro-devtools/inject"] });
  });

  it("finds a manual `DevTools()` in a promised plugin", async () => {
    const { patch, logs } = await runRegistration({
      vitePlugins: [Promise.resolve(DEVTOOLS_SERVER_PLUGIN)],
    });

    expect(patch).toBeUndefined();
    expect(logs.warn).toHaveLength(1);
  });

  it("finds a manual `DevTools()` in a nested plugin array", async () => {
    const { patch, logs } = await runRegistration({ vitePlugins: [[DEVTOOLS_SERVER_PLUGIN]] });

    expect(patch).toBeUndefined();
    expect(logs.warn).toHaveLength(1);
  });

  it.each([
    { name: "vite", version: "8.2.2" },
    { name: "vite", version: "8.3.0-beta.1" },
    { name: "@voidzero-dev/vite-plus-core", version: "0.3.1" },
  ])("refuses a Vite that cannot register DevTools itself: %j", async (vitePackage) => {
    const { active, patch, optimizeDeps, logs } = await runRegistration({ vitePackage });

    expect(active).toBe(false);
    expect(patch).toBeUndefined();
    expect(optimizeDeps).toEqual({ include: [] });
    expect(logs.error).toHaveLength(1);
    expect(logs.error[0]).toContain(`${vitePackage.name}@${vitePackage.version}`);
    expect(logs.error[0]).toContain("8.3");
  });

  it.each([
    { name: "vite", version: "8.3.0" },
    { name: "vite", version: "8.10.1" },
    { name: "vite", version: "9.0.0-beta.2" },
    { name: "@voidzero-dev/vite-plus-core", version: "0.3.2" },
    { name: "@voidzero-dev/vite-plus-core", version: "1.0.0" },
    { name: "some-vite-fork", version: "1.0.0" },
    // Build metadata says nothing about precedence, so it must not make the
    // comparison unorderable and refuse a supported Vite — including the `-`
    // inside it, which must not read as a prerelease tag.
    { name: "vite", version: "8.3.0+build-1" },
    null,
  ])(
    "accepts a Vite that registers DevTools itself, or an unknown one: %j",
    async (vitePackage) => {
      const { active, patch, logs } = await runRegistration({ vitePackage });

      expect(active).toBe(true);
      expect(patch).toBeDefined();
      expect(logs.error).toEqual([]);
    },
  );

  it("prebundles the injected browser entry", async () => {
    // Prebundling avoids a dependency rebuild during the first page request.
    const { optimizeDeps } = await runRegistration();

    expect(optimizeDeps).toEqual({
      include: ["astro-devtools/inject"],
    });
  });

  it("prebundles no client entry when `inject: false` never loads it", async () => {
    const { optimizeDeps } = await runRegistration({ options: { inject: false } });

    expect(optimizeDeps).toEqual({ include: [] });
  });

  it("skips the MCP bridge when `mcp: false`", async () => {
    const { registeredPlugins } = await runRegistration({
      options: { inject: false, mcp: false },
    });

    expect(pluginNames(registeredPlugins)).not.toContain("devframe:astro-devtools");
  });

  it("gives every Vite server its own bridge and forwards no `closeBundle`", async () => {
    // Vite restarts on the same plugin objects and mounts the new server
    // before closing the old one, so one shared bridge — or a `closeBundle`
    // that reaches whichever instance is current — would take the running
    // server's MCP endpoint down with the previous server.
    const { registeredPlugins } = await runRegistration({ options: { inject: false } });
    const plugin = registeredPlugins.find(
      (registered) => (registered as Plugin).name === "devframe:astro-devtools",
    ) as Plugin;
    const built = builtBridges.length;

    const mount = plugin.configureServer;
    if (typeof mount !== "function") throw new Error("the bridge plugin mounts on configureServer");
    await mount.call(
      {} as never,
      {
        config: { server: { host: false } },
      } as ViteDevServer,
    );

    expect(builtBridges.length).toBe(built + 1);
    expect(plugin.closeBundle).toBeUndefined();
  });

  it.each(["localhost", "127.0.0.1", "::1"])(
    "serves the MCP bridge on loopback host %j without logging",
    async (host) => {
      const { bridgeStarted, logs } = await runRegistration({
        options: { inject: false },
        host,
      });

      expect(bridgeStarted).toBe(true);
      expect(logs.warn).toEqual([]);
      expect(logs.info).toEqual([]);
    },
  );

  it.each([true, "0.0.0.0", "192.168.1.5"])(
    "disables MCP by default on non-loopback host %j, pointing at `mcp: true`",
    async (host) => {
      const { bridgeStarted, logs } = await runRegistration({
        options: { inject: false },
        host,
      });

      expect(bridgeStarted).toBe(false);
      expect(logs.warn).toEqual([]);
      expect(logs.info).toHaveLength(1);
      expect(logs.info[0]).toContain("`mcp: true`");
    },
  );

  it("keeps MCP up on a non-loopback host when `mcp: true`, warning instead", async () => {
    const { bridgeStarted, logs } = await runRegistration({
      options: { inject: false, mcp: true },
      host: true,
    });

    expect(bridgeStarted).toBe(true);
    expect(logs.info).toEqual([]);
    expect(logs.warn).toHaveLength(1);
    expect(logs.warn[0]).toContain("without authentication");
  });

  it.each([
    { initial: false, resolved: true, enabled: false },
    { initial: true, resolved: "127.0.0.1", enabled: true },
  ])(
    "uses the resolved host after a later configuration change: %j",
    async ({ initial, resolved, enabled }) => {
      const { bridgeStarted } = await runRegistration({
        options: { inject: false },
        host: initial,
        resolvedHost: resolved,
      });
      expect(bridgeStarted).toBe(enabled);
    },
  );

  it("stays silent about MCP on a non-loopback host when `mcp: false`", async () => {
    const { logs } = await runRegistration({
      options: { inject: false, mcp: false },
      host: true,
    });

    expect(logs.warn).toEqual([]);
    expect(logs.info).toEqual([]);
  });
});
