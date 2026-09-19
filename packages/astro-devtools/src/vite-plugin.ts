import type { PluginWithDevTools } from "@vitejs/devtools-kit";

import type { AstroDevtoolsStore } from "./store.ts";

import { ACCENT_COLOR, ASTRO_LOGO_ICON } from "./branding.ts";
import { ASTRO_DOCK_ENTRY_IDS, ASTRO_DOCK_GROUP_ID } from "./dock-ids.ts";
import { createRpcDefinitions } from "./rpc.ts";

const CATEGORY = "framework";

const ASTRO_DOCS_URL = "https://docs.astro.build/";

const PANEL_ENTRIES = [
  {
    id: ASTRO_DOCK_ENTRY_IDS.overview,
    title: "Overview",
    icon: "ph:info-duotone",
    importName: undefined,
  },
  {
    id: ASTRO_DOCK_ENTRY_IDS.islands,
    title: "Islands",
    icon: "ph:island-duotone",
    importName: "islands",
  },
  {
    id: ASTRO_DOCK_ENTRY_IDS.routes,
    title: "Routes",
    icon: "ph:tree-structure-duotone",
    importName: "routes",
  },
  {
    id: ASTRO_DOCK_ENTRY_IDS.actions,
    title: "Actions",
    icon: "ph:function-duotone",
    importName: "actions",
  },
  {
    id: ASTRO_DOCK_ENTRY_IDS.config,
    title: "Config",
    icon: "ph:gear-six-duotone",
    importName: "config",
  },
] as const;

/** Register Astro's dock entries and RPC functions with Vite DevTools. */
export function astroDevtoolsVitePlugin(store: AstroDevtoolsStore): PluginWithDevTools {
  return {
    name: "astro-devtools",
    configureServer(server) {
      store.setViteServer(server);
    },
    devtools: {
      setup(context) {
        // The docks below point their renderer at the bare specifier
        // "astro-devtools/client", which Vite resolves through `/@id/` — but it
        // only says so in `initHub()`, after this hook, so each registration
        // warns DF8111 ("the script will fail to load") about scripts that load
        // fine. Writing Vite's own value first silences that; `initHub()` then
        // rewrites it identically. Drop it once DevTools (0.7.5 today)
        // advertises it earlier.
        if (context.viteServer && !context.staticConfig.dock?.clientModuleResolution) {
          context.staticConfig.dock = {
            ...context.staticConfig.dock,
            clientModuleResolution: "/@id/{specifier}",
          };
        }

        for (const [defaultOrder, entry] of PANEL_ENTRIES.entries()) {
          context.docks.register({
            id: entry.id,
            title: entry.title,
            icon: entry.icon,
            type: "custom-render",
            renderer: {
              importFrom: "astro-devtools/client",
              ...(entry.importName ? { importName: entry.importName } : {}),
            },
            category: CATEGORY,
            groupId: ASTRO_DOCK_GROUP_ID,
            defaultOrder,
          });
        }

        context.docks.register({
          id: ASTRO_DOCK_ENTRY_IDS.docs,
          title: "Docs",
          icon: "ph:book-open-duotone",
          type: "iframe",
          url: ASTRO_DOCS_URL,
          category: CATEGORY,
          groupId: ASTRO_DOCK_GROUP_ID,
          defaultOrder: PANEL_ENTRIES.length,
        });

        context.docks.register({
          id: ASTRO_DOCK_GROUP_ID,
          title: "Astro",
          icon: ASTRO_LOGO_ICON,
          type: "group",
          category: CATEGORY,
          accentColor: ACCENT_COLOR,
          // Keep the framework's own group before the built-in Vite+ group.
          defaultOrder: -2000,
          defaultChildId: ASTRO_DOCK_ENTRY_IDS.overview,
        });

        // Every definition, not just the agent-tagged subset the devframe
        // bridge takes: the panels above call them through `context.rpc.call`
        // on the OTP-gated hub.
        for (const definition of createRpcDefinitions(store)) {
          context.rpc.register(definition);
        }
      },
    },
  };
}
