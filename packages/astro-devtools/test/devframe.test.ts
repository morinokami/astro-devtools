import type { DevframeNodeContext } from "devframe";

import { describe, expect, it } from "vite-plus/test";

import { createAstroDevframe } from "../src/devframe.ts";
import { createStore } from "../src/store.ts";

/** Run the definition's setup against a context that only records calls. */
function runSetup() {
  const rpcNames: string[] = [];
  const context = {
    rpc: { register: (definition: { name: string }) => void rpcNames.push(definition.name) },
  } as unknown as DevframeNodeContext;
  // The definition's setup is synchronous; `void` satisfies the lint rule
  // for its `void | Promise<void>` signature.
  void createAstroDevframe(createStore(), "1.2.3").setup(context);
  return rpcNames;
}

describe("createAstroDevframe", () => {
  it("registers only the agent-tagged RPC definitions", () => {
    // The bridge's transports are unauthenticated, so panel-only queries
    // (project:context, config:get) must stay off it.
    expect(runSetup()).toEqual([
      "astro-devtools:overview:get",
      "astro-devtools:routes:list",
      "astro-devtools:actions:list",
    ]);
  });
});
