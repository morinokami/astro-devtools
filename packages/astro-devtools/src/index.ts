import type { AstroIntegration } from "astro";

import type { AstroDevtoolsOptions } from "./types.ts";

import { createAstroDevframe } from "./devframe.ts";
import { detectPackageVersion, detectVitePackage } from "./package-info.ts";
import { summarizeConfig } from "./panels/config.ts";
import { recordProjectInfo } from "./panels/overview.ts";
import { toRouteInfos } from "./panels/routes.ts";
import { injectDevtoolsDock, registerVitePlugins } from "./setup.ts";
import { createStore } from "./store.ts";

export type { AstroDevtoolsOptions } from "./types.ts";

export default function astroDevtools(options: AstroDevtoolsOptions = {}): AstroIntegration {
  const store = createStore();
  // Vite DevTools is a dev-server feature; every hook bails out early
  // outside `astro dev`, so builds do no project analysis or file scans.
  let isDevCommand = false;

  return {
    name: "astro-devtools",
    hooks: {
      "astro:config:setup": async ({ command, config, updateConfig, injectScript, logger }) => {
        isDevCommand = command === "dev";
        if (!isDevCommand) return;
        const devframeDefinition = createAstroDevframe(
          store,
          detectPackageVersion("astro-devtools", config.root),
        );
        const devtoolsActive = await registerVitePlugins(store, options, devframeDefinition, {
          config,
          updateConfig,
          logger,
          vitePackage: detectVitePackage(config.root),
        });
        // Without a DevTools server the dock would only fail to connect.
        if (devtoolsActive && options.inject !== false) injectDevtoolsDock(injectScript);
      },
      "astro:config:done": ({ config }) => {
        if (!isDevCommand) return;
        store.setConfigSummary(summarizeConfig(config));
        recordProjectInfo(store, config);
      },
      "astro:routes:resolved": ({ routes }) => {
        if (!isDevCommand) return;
        store.setRoutes(toRouteInfos(routes));
      },
    },
  };
}
