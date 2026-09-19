import { describe, expect, it } from "vite-plus/test";

import { createRpcDefinitions } from "../src/rpc.ts";
import { createStore } from "../src/store.ts";

describe("createRpcDefinitions", () => {
  const definitions = createRpcDefinitions(createStore());
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));

  it("registers every RPC name declared by AstroDevtoolsRpcFunctions", () => {
    expect([...byName.keys()].sort()).toEqual([
      "astro-devtools:actions:info",
      "astro-devtools:config:info",
      "astro-devtools:overview:info",
      "astro-devtools:project:context",
      "astro-devtools:routes:info",
    ]);
  });

  it("declares every function as a JSON-serializable query", () => {
    for (const definition of definitions) {
      expect(definition.type).toBe("query");
      expect(definition.jsonSerializable).toBe(true);
    }
  });

  it("returns JSON-serializable responses on an empty store", async () => {
    for (const definition of definitions) {
      const response = await definition.setup().handler();

      // A stringify round trip removes or changes values JSON cannot represent.
      expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    }
  });
});
