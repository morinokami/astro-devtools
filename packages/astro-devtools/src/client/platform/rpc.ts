import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import type { AstroDevtoolsRpcFunctions } from "../../types.ts";

/**
 * Call an Astro RPC function with its response type inferred from the name.
 * The cast stays here because the DevTools client does not know this
 * package's RPC map.
 */
export function callRpc<Name extends keyof AstroDevtoolsRpcFunctions>(
  context: DockClientScriptContext,
  name: Name,
): Promise<AstroDevtoolsRpcFunctions[Name]> {
  const call = context.rpc.call as unknown as (name: string) => Promise<unknown>;
  return call(name) as Promise<AstroDevtoolsRpcFunctions[Name]>;
}
