import { defineDevframe, type DevframeDefinition, type DevframeNodeContext } from "devframe";

import type { AstroDevtoolsStore } from "./store.ts";

import { createRpcDefinitions } from "./rpc.ts";

/** Register the agent-tagged Astro RPC functions with devframe for MCP access. */
export function createAstroDevframe(
  store: AstroDevtoolsStore,
  version: string | undefined,
): DevframeDefinition {
  return defineDevframe({
    id: "astro-devtools",
    name: "Astro",
    version: version ?? "0.0.0",
    packageName: "astro-devtools",
    homepage: "https://github.com/morinokami/astro-devtools#readme",
    description: "Astro routes, actions, and project details from the running dev server.",
    setup(context: DevframeNodeContext) {
      // The bridge mounts unauthenticated WS/SSE RPC transports alongside
      // MCP, and nothing in this package uses them (panels ride the
      // OTP-gated DevTools hub) — registering only the agent-tagged
      // definitions keeps those transports down to the advertised MCP
      // surface.
      for (const definition of createRpcDefinitions(store)) {
        if (definition.agent) context.rpc.register(definition);
      }
    },
  });
}
