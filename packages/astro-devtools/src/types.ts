import type { AstroConfig, IntegrationResolvedRoute, ValidRedirectStatus } from "astro";

/** Serializable data for a resolved Astro route. */
export interface RouteInfo {
  pattern: string;
  /** Source of the route-matching regex, for matching URLs client-side. */
  patternSource: string;
  entrypoint: string;
  type: IntegrationResolvedRoute["type"];
  prerendered: boolean;
  origin: IntegrationResolvedRoute["origin"];
  /** The concrete URL this route serves; unset for dynamic (`[param]`) routes. */
  pathname?: string;
  /** Names of the route's dynamic params (e.g. `slug`, `...path`). */
  params: string[];
  /** Redirect target; set when `type` is `redirect`. */
  redirect?: RedirectInfo;
  /**
   * The i18n fallback variants that this route also serves. Astro attaches
   * them to their target route instead of listing them as routes of their
   * own, and tests their patterns while matching the target.
   */
  fallbackRoutes: RouteFallbackInfo[];
}

/** Serializable data for an i18n fallback variant of a route. */
export interface RouteFallbackInfo {
  pattern: string;
  /** Source of the fallback's own matching regex, for matching URLs client-side. */
  patternSource: string;
}

/** Where a redirect route sends the browser. */
export interface RedirectInfo {
  destination: string;
  /** Configured HTTP status; Astro responds with 301 when unset. */
  status?: ValidRedirectStatus;
}

/** Serializable summary of the resolved `i18n` Astro config. */
export interface I18nInfo {
  /** Locale path segments in config order, e.g. `["en", "ja"]`. */
  locales: string[];
  defaultLocale: string;
  /**
   * `true` when `i18n.routing` is `"manual"` (Astro injects no i18n
   * middleware; the project supplies its own).
   */
  manualRouting: boolean;
  prefixDefaultLocale: boolean;
  redirectToDefaultLocale: boolean;
  /** How fallback routes respond: `redirect` or `rewrite`. */
  fallbackType: "redirect" | "rewrite";
  /** Mapping from a locale to its fallback locale, when configured. */
  fallback?: Record<string, string>;
}

/** Section of the Routes panel a route is grouped under. */
export type RouteSection = "pages" | "endpoints" | "redirects" | "integrations" | "internal";

/**
 * How a route is delivered after `astro build`: `static` routes are emitted
 * as files at build time, `server` routes are rendered on demand by the
 * adapter, `dev-only` marks an internal or integration-injected route that
 * the build leaves out (any of them without an adapter; Astro's default
 * error pages always; the image endpoint unless some route renders on
 * demand), and `needs-adapter` marks a project route that cannot be built
 * until an adapter is installed.
 */
export type RouteDelivery = "static" | "server" | "dev-only" | "needs-adapter";

/** A display-ready Routes panel row, ordered for rendering. */
export interface RouteDisplay extends RouteInfo {
  section: RouteSection;
  delivery: RouteDelivery;
  /**
   * Position in Astro's matching order. The display order regroups routes,
   * so URL matching must first re-sort rows by this value. A synthesized
   * fallback row shares the position of the route that serves it and is
   * listed right after it: Astro tests a route's fallback patterns while
   * matching that route.
   */
  matchOrder: number;
  /** Pattern of the primary route that this localized or fallback row is grouped under. */
  variantOf?: string;
  /** Set on synthesized fallback rows: the pattern of the route that serves them. */
  fallbackOf?: string;
  /** Human-friendly source of the route (file path or package label). */
  sourceLabel: string;
  /** `true` when `sourceLabel` is a project file that an editor can open. */
  sourceIsFile: boolean;
}

/** Project-wide context for the Routes panel rows. */
export interface RoutesContext {
  output?: AstroConfig["output"];
  adapterName?: string;
  middlewareFile?: string;
  /** Absolute project root, for resolving editor links client-side. */
  root?: string;
  /** Resolved `base` of the site; route patterns and pathnames never include it. */
  base?: string;
  /** Resolved `trailingSlash` mode, for building route links client-side. */
  trailingSlash?: AstroConfig["trailingSlash"];
  i18n?: I18nInfo;
}

/** Response from the `astro-devtools:routes:list` RPC. */
export interface RoutesInfo {
  context: RoutesContext;
  routes: RouteDisplay[];
}

/** Server-side data needed by the Islands panel, which otherwise inspects the current page. */
export interface ProjectContext {
  /** Absolute project root, for resolving editor links client-side. */
  root?: string;
}

/** One exported action, as the `astro-devtools:actions:list` RPC describes it. */
export interface ActionDescriptor {
  /** The property names leading from the root `server` object to this action. */
  segments: string[];
  /** Human-readable dot-separated name (`greet`, `feedback.submit`). */
  qualifiedName: string;
  /**
   * The input encoding this action accepts, read from the dev-only
   * metadata wrapper. Unset when the metadata could not be read.
   */
  accept?: "json" | "form";
  /**
   * JSON Schema for the action's `input`, produced by zod's own
   * `z.toJSONSchema` with `io: "input"` and used to generate the
   * input-editor fields. Unset when the action has no input schema or the
   * metadata is unavailable.
   */
  input?: unknown;
}

/** Response from the `astro-devtools:actions:list` RPC. */
export interface ActionsInfo {
  /** Root-relative path of the actions file; unset when the project has none. */
  actionsFile?: string;
  /** Absolute project root, for resolving editor links client-side. */
  root?: string;
  /**
   * The exported actions (`greet`, `feedback.submit`), in definition order.
   * `undefined` when the project has an actions file that could not be
   * loaded (the file's presence is still reported via `actionsFile`); an
   * empty array means the file exports no actions at all.
   */
  actions?: ActionDescriptor[];
  /** Resolved `base` of the site, for building `/_actions/` call URLs. */
  base?: string;
  /**
   * Whether call URLs should end with a trailing slash. This follows the
   * same rule (derived from `trailingSlash` and `build.format`) that
   * Astro's own actions client is configured with, via its
   * `virtual:astro:actions/options` module.
   */
  appendTrailingSlash?: boolean;
}

/** A single key/value row of the resolved Astro config summary. */
export interface ConfigEntry {
  key: string;
  value: string;
}

/** Response from the `astro-devtools:config:get` RPC. */
export interface ConfigInfo {
  /**
   * Root-relative path of the project's astro.config file. Unset when no
   * config file exists at a standard location — either the project has no
   * config file, or it lives elsewhere and is passed via `--config`, which
   * integrations cannot see.
   */
  configFile?: string;
  /** Absolute project root, for resolving editor links client-side. */
  root?: string;
  /** The resolved-config summary rows, in display order. */
  entries: ConfigEntry[];
}

/**
 * Project and toolchain details collected when Astro resolves its config.
 * `recordProjectInfo` (panels/overview.ts) is their only writer; the
 * overview query returns them all, and the other queries pick the fields
 * they need.
 */
export interface ProjectInfo {
  /** Version of the astro package the dev server runs on, e.g. `7.1.2`. */
  astroVersion?: string;
  /** Version of the vite package the dev server runs on. */
  viteVersion?: string;
  /** Version of this integration (astro-devtools). */
  astroDevtoolsVersion?: string;
  /** Node.js version of the dev server process. */
  nodeVersion?: string;
  /** Resolved `output` mode of the project (`static`, `server`, …). */
  output?: AstroConfig["output"];
  /** Name of the configured adapter, if any. */
  adapterName?: string;
  /** Absolute path of the project root. */
  root?: string;
  /** Resolved `base` of the site, e.g. `/` or `/docs`. */
  base?: string;
  /** Resolved `trailingSlash` mode (`always`, `never`, `ignore`). */
  trailingSlash?: AstroConfig["trailingSlash"];
  /** Resolved `build.format` (`directory`, `file`, `preserve`). */
  buildFormat?: AstroConfig["build"]["format"];
  /** Summary of the resolved `i18n` config, if the project uses i18n. */
  i18n?: I18nInfo;
  /** Root-relative path of the Astro Actions file, if the project has one. */
  actionsFile?: string;
  /** Root-relative path of the middleware file, if the project has one. */
  middlewareFile?: string;
  /**
   * Root-relative path of the astro.config file, if one sits at a standard
   * location (see `detectConfigFile`).
   */
  configFile?: string;
}

/**
 * Project route and action counts returned by the overview query. The
 * Overview panel displays only `pages` and `actions`; `endpoints` and
 * `redirects` are reported for the MCP tool and other RPC callers. The
 * route counts cover the project's own routes (internal and
 * integration-injected ones excluded), sectioned as the Routes panel
 * groups them.
 */
export interface OverviewCounts {
  pages: number;
  endpoints: number;
  redirects: number;
  /**
   * Number of Astro Actions exported by the actions file, counted by
   * loading it through the dev server. `undefined` when the project has an
   * actions file that could not be loaded (the file's presence is still
   * reported via `actionsFile`).
   */
  actions?: number;
}

/** Response from the `astro-devtools:overview:get` RPC. */
export interface OverviewInfo extends ProjectInfo {
  counts: OverviewCounts;
}

/** Response type for every RPC function registered by this integration. */
export interface AstroDevtoolsRpcFunctions {
  "astro-devtools:overview:get": OverviewInfo;
  "astro-devtools:project:context": ProjectContext;
  "astro-devtools:routes:list": RoutesInfo;
  "astro-devtools:actions:list": ActionsInfo;
  "astro-devtools:config:get": ConfigInfo;
}

export interface AstroDevtoolsOptions {
  /**
   * Inject the embedded DevTools dock into every page during `astro dev`.
   * Set to `false` if you only want the standalone UI at `/__devtools/`.
   *
   * Vite DevTools itself is configured through Vite's own `devtools` option
   * (`vite.devtools` in the Astro config, Vite 8.3+): the integration fills
   * in its own defaults beneath whatever is set there — `apply: "serve"`,
   * the DevTools hub's own aggregate MCP route (`/__devtools/__mcp`) kept
   * off so that `mcp` below is the only MCP switch, Astro DevTools branding
   * (name, logo, accent color), and the one-time access code announced
   * through Astro's logger — and every field set there wins, field by field
   * for `branding`. `vite.devtools: false` (or `enabled: false`) turns the
   * DevTools host off, dock included; the MCP endpoint keeps working.
   * @default true
   */
  inject?: boolean;
  /**
   * Mount an MCP endpoint on the dev server's own origin that exposes
   * read-only Astro project queries while `astro dev` runs. Connection
   * details are available at `/__astro-devtools/__connection.json`. The
   * endpoint has no authentication or origin checks (native MCP clients
   * send neither), so anyone who can reach the dev server's address can
   * query it; when the server binds to a non-loopback address (e.g. `--host`),
   * the endpoint is therefore disabled unless this option is an explicit
   * `true`. Set to `false` to disable it everywhere. The DevTools hub's own
   * aggregate MCP route stays off unless `vite.devtools.mcp` turns it on.
   * @default true on loopback hosts, false otherwise
   */
  mcp?: boolean;
}
