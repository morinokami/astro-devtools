import type { AstroDevtoolsStore } from "./store.ts";
import type { AstroDevtoolsRpcFunctions } from "./types.ts";

import { listActions, loadActionsModule, shouldAppendForwardSlash } from "./panels/actions.ts";
import { buildRoutesInfo, countRoutes } from "./panels/routes.ts";

/** A typed RPC definition accepted by both DevTools and devframe. */
interface AstroDevtoolsRpcDefinition<
  Name extends keyof AstroDevtoolsRpcFunctions = keyof AstroDevtoolsRpcFunctions,
> {
  name: Name;
  type: "query";
  /**
   * Keep responses compatible with plain JSON: values such as Map, Date, and
   * BigInt are rejected instead of being changed during serialization. MCP
   * tools require the same JSON-only response contract.
   */
  jsonSerializable: true;
  /**
   * Optional MCP tool metadata. Only definitions that set this field are
   * registered with the devframe bridge and become MCP tools; the rest stay
   * panel-only. `type: "query"` marks them as read-only.
   */
  agent?: { description: string };
  setup: () => { handler: () => Promise<AstroDevtoolsRpcFunctions[Name]> };
}

/** Create the read-only RPC definitions shared by DevTools and MCP. */
export function createRpcDefinitions(store: AstroDevtoolsStore): AstroDevtoolsRpcDefinition[] {
  return [
    defineQuery(
      "astro-devtools:overview:get",
      async () => ({
        ...store.project,
        counts: {
          ...countRoutes(store.routes),
          actions: listActions(await loadActionsModule(store))?.length,
        },
      }),
      {
        description:
          "Get Astro, Vite, and Node.js versions; resolved output, adapter, base, and i18n " +
          "settings; detected actions and middleware files; and counts of the project's own " +
          "pages, endpoints, redirects, and actions (integration-injected and Astro internal " +
          "routes are not counted). This query is read-only.",
      },
    ),
    // Used by the Islands panel for project-relative editor links.
    defineQuery("astro-devtools:project:context", async () => ({ root: store.project.root })),
    defineQuery("astro-devtools:routes:list", async () => buildRoutesInfo(store), {
      description:
        "List project, integration-injected, and Astro internal routes with URL patterns, " +
        "source files, i18n variants, production delivery modes, output settings, adapter, " +
        "and middleware. This query is read-only.",
    }),
    defineQuery(
      "astro-devtools:actions:list",
      async () => ({
        actionsFile: store.project.actionsFile,
        root: store.project.root,
        actions: listActions(await loadActionsModule(store)),
        base: store.project.base,
        appendTrailingSlash: shouldAppendForwardSlash(
          store.project.trailingSlash,
          store.project.buildFormat,
        ),
      }),
      {
        description:
          "List Astro Actions by qualified name and export segments, including the actions " +
          "file, accept mode, input JSON Schema when available, and URL settings for the " +
          "actions endpoint. This query is read-only.",
      },
    ),
    // Display-ready values used only by the Config panel.
    defineQuery("astro-devtools:config:get", async () => ({
      configFile: store.project.configFile,
      root: store.project.root,
      entries: store.configSummary,
    })),
  ];
}

function defineQuery<Name extends keyof AstroDevtoolsRpcFunctions>(
  name: Name,
  handler: () => Promise<AstroDevtoolsRpcFunctions[Name]>,
  toolMetadata?: { description: string },
): AstroDevtoolsRpcDefinition<Name> {
  return {
    name,
    type: "query",
    jsonSerializable: true,
    agent: toolMetadata,
    setup: () => ({ handler }),
  };
}
