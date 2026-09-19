import type { ViteDevServer } from "vite";

import type { ConfigEntry, ProjectInfo, RouteInfo } from "./types.ts";

/**
 * Shared state between the Astro integration hooks (which produce data) and
 * the Vite plugin's `devtools.setup` hook (which serves it). Astro hooks may
 * fire before or after the DevTools context is created, which is fine: every
 * consumer reads the store lazily, per request.
 */
export interface AstroDevtoolsStore {
  readonly routes: RouteInfo[];
  /** The display summary of the Astro config, not the config itself. */
  readonly configSummary: ConfigEntry[];
  readonly project: ProjectInfo;
  /** Absolute path of the actions file, for loading it via the dev server. */
  readonly actionsModulePath: string | undefined;
  /** The running Vite dev server, once `configureServer` has fired. */
  readonly viteServer: ViteDevServer | undefined;
  setRoutes: (routes: RouteInfo[]) => void;
  setConfigSummary: (summary: ConfigEntry[]) => void;
  setProject: (project: ProjectInfo) => void;
  setActionsModulePath: (modulePath: string | undefined) => void;
  setViteServer: (server: ViteDevServer) => void;
}

export function createStore(): AstroDevtoolsStore {
  let routes: RouteInfo[] = [];
  let configSummary: ConfigEntry[] = [];
  let project: ProjectInfo = {};
  let actionsModulePath: string | undefined;
  let viteServer: ViteDevServer | undefined;

  return {
    get routes() {
      return routes;
    },
    get configSummary() {
      return configSummary;
    },
    get project() {
      return project;
    },
    get actionsModulePath() {
      return actionsModulePath;
    },
    get viteServer() {
      return viteServer;
    },
    setRoutes(next) {
      routes = next;
    },
    setConfigSummary(next) {
      configSummary = next;
    },
    setProject(next) {
      project = next;
    },
    setActionsModulePath(modulePath) {
      actionsModulePath = modulePath;
    },
    setViteServer(server) {
      viteServer = server;
    },
  };
}
