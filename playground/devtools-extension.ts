/**
 * A stand-in for a third-party integration extending the dock. It only uses
 * what an external package could use — the `astro-devtools/kit` group id and
 * a Vite plugin's `devtools` hook — so the e2e suite exercises the documented
 * extension recipe end to end. The panel is `json-render`: the spec below is
 * the whole UI, with no client bundle to build or host.
 */
import type { AstroIntegration } from "astro";
import type { PluginWithDevTools } from "astro-devtools/kit";

import { ASTRO_DOCK_GROUP_ID } from "astro-devtools/kit";

export const EXTENSION_DOCK_ENTRY_ID = "playground-extension:hello";
/** Rendered by the panel; the e2e test searches the page for this text. */
export const EXTENSION_PANEL_MARKER = "Hello from playground-extension";

function extensionVitePlugin(): PluginWithDevTools {
  return {
    name: "playground-extension",
    devtools: {
      setup(context) {
        const renderer = context.createJsonRenderer({
          root: "root",
          elements: {
            root: {
              type: "Stack",
              props: { direction: "column", gap: 12, padding: 16 },
              children: ["heading", "details"],
            },
            heading: {
              type: "Text",
              props: { text: EXTENSION_PANEL_MARKER, variant: "heading" },
            },
            details: {
              type: "KeyValueTable",
              props: {
                data: {
                  "Registered via": "devtools.setup",
                  Group: ASTRO_DOCK_GROUP_ID,
                },
              },
            },
          },
        });
        context.docks.register({
          id: EXTENSION_DOCK_ENTRY_ID,
          title: "Hello",
          icon: "ph:puzzle-piece-duotone",
          type: "json-render",
          view: renderer.view,
          // Joining the Astro group is the only Astro-specific line; drop it
          // to appear as a standalone top-level dock entry instead.
          groupId: ASTRO_DOCK_GROUP_ID,
        });
      },
    },
  };
}

export default function playgroundExtension(): AstroIntegration {
  return {
    name: "playground-extension",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [extensionVitePlugin()] } });
      },
    },
  };
}
