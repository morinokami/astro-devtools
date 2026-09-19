import type { Plugin, RunnableDevEnvironment, ViteDevServer } from "vite";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import type { ActionsInfo } from "../src/types.ts";

import { actionsMetadataPlugin, rewriteActionsImports } from "../src/actions-metadata.ts";
import { createRpcDefinitions } from "../src/rpc.ts";
import { createStore } from "../src/store.ts";

const WRAPPER_ID = "astro-devtools:actions-metadata-module";

describe("rewriteActionsImports", () => {
  it("redirects static imports, re-exports, and dynamic imports", async () => {
    const rewritten = await rewriteActionsImports(
      [
        `import { defineAction } from "astro:actions";`,
        `export * from 'astro:actions';`,
        `const mod = await import("astro:actions");`,
      ].join("\n"),
    );

    expect(rewritten?.code).toBe(
      [
        `import { defineAction } from "${WRAPPER_ID}";`,
        `export * from '${WRAPPER_ID}';`,
        `const mod = await import("${WRAPPER_ID}");`,
      ].join("\n"),
    );
  });

  it("returns a sourcemap for the rewrite", async () => {
    const rewritten = await rewriteActionsImports(
      `import { defineAction } from "astro:actions";\nexport const answer = 42;`,
    );

    expect(rewritten?.map.mappings.length).toBeGreaterThan(0);
  });

  it("rewrites real imports only, not look-alike text around them", async () => {
    const rewritten = await rewriteActionsImports(
      [
        `import { defineAction } from "astro:actions";`,
        `const label = 'from "astro:actions"';`,
        `// import { defineAction } from "astro:actions";`,
        `const pattern = /from "astro:actions"/;`,
      ].join("\n"),
    );

    expect(rewritten?.code).toBe(
      [
        `import { defineAction } from "${WRAPPER_ID}";`,
        `const label = 'from "astro:actions"';`,
        `// import { defineAction } from "astro:actions";`,
        `const pattern = /from "astro:actions"/;`,
      ].join("\n"),
    );
  });

  it("leaves modules without a real astro:actions import untouched", async () => {
    expect(await rewriteActionsImports(`import { z } from "astro:schema";`)).toBeUndefined();
    expect(await rewriteActionsImports(`const label = "astro:actions";`)).toBeUndefined();
  });

  it("leaves sources the lexer cannot parse untouched", async () => {
    expect(await rewriteActionsImports(`<template>astro:actions</template>`)).toBeUndefined();
  });
});

/**
 * The scenarios only a module graph can show: metadata reaching actions
 * defined in imported files, the app and the panel sharing one module
 * instance, and the client graph staying untouched.
 */
describe("actionsMetadataPlugin on a dev server", () => {
  const SIDE_EFFECTS_KEY = "__astroDevtoolsActionsSideEffects";
  let root: string;
  let server: ViteDevServer;

  /**
   * Stand-in for astro's virtual modules. Like astro's real plugin it
   * resolves `astro:actions` with `enforce: "pre"` — before anything this
   * package registers — and like astro 7 its `defineAction` exposes nothing
   * about its config on the returned handler. `astro:schema` and `astro/zod`
   * both resolve to the real zod so the wrapper's `z.toJSONSchema` call is
   * the production one.
   */
  function stubAstroPlugin(): Plugin {
    const zodModulePath = createRequire(import.meta.url).resolve("astro/zod");
    return {
      name: "stub:astro-virtual-modules",
      enforce: "pre",
      resolveId(id) {
        if (id === "astro:actions" || id === "astro:schema") return `\0${id}`;
        // The test root is a tmpdir without node_modules, so the wrapper's
        // bare `astro/zod` import needs resolving here.
        if (id === "astro/zod") return zodModulePath;
        return undefined;
      },
      load(id) {
        if (id === "\0astro:actions") {
          return `export function defineAction({ handler }) { return async (input) => handler(input); }`;
        }
        if (id === "\0astro:schema") {
          return `export { z } from ${JSON.stringify(zodModulePath)};`;
        }
        return undefined;
      },
    };
  }

  function sideEffectCount(): unknown {
    return (globalThis as Record<string, unknown>)[SIDE_EFFECTS_KEY];
  }

  /**
   * Evaluate a module the way the astro dev server does: through the ssr
   * environment's module runner. `server.ssrLoadModule` evaluates the same
   * module graph on a separate compat runner, so it would not share the
   * app's module instances.
   */
  function appImport(url: string): Promise<Record<string, unknown>> {
    return (server.environments.ssr as RunnableDevEnvironment).runner.import(url);
  }

  /** List actions the way the panel does: through the real RPC handler. */
  async function actionsInfoFromRpc(viteServer: ViteDevServer = server): Promise<ActionsInfo> {
    const store = createStore();
    store.setViteServer(viteServer);
    store.setActionsModulePath(join(root, "src/actions/index.ts"));
    const definition = createRpcDefinitions(store).find(
      ({ name }) => name === "astro-devtools:actions:info",
    );
    if (!definition) throw new Error("actions:info RPC definition not found");
    return (await definition.setup().handler()) as ActionsInfo;
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "astro-devtools-actions-"));
    await mkdir(join(root, "src/actions"), { recursive: true });
    // The split-file layout that Astro's actions guide recommends: helper
    // modules define actions and the entry composes them.
    await writeFile(
      join(root, "src/actions/user.ts"),
      `import { defineAction } from "astro:actions";
import { z } from "astro:schema";

export const user = {
  update: defineAction({
    accept: "form",
    input: z.object({ id: z.string() }),
    handler: async (input: unknown) => input,
  }),
};
`,
    );
    await writeFile(
      join(root, "src/actions/index.ts"),
      `import { defineAction } from "astro:actions";
import { z } from "astro:schema";

import { user } from "./user.ts";

const counters = globalThis as Record<string, number | undefined>;
counters.${SIDE_EFFECTS_KEY} = (counters.${SIDE_EFFECTS_KEY} ?? 0) + 1;

export const label = 'from "astro:actions"';

export const server = {
  greet: defineAction({
    input: z.object({ name: z.string() }),
    handler: async ({ name }: { name: string }) => name,
  }),
  user,
};
`,
    );
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false },
      plugins: [stubAstroPlugin(), actionsMetadataPlugin()],
    });
  }, 30_000);

  afterAll(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
    delete (globalThis as Record<string, unknown>)[SIDE_EFFECTS_KEY];
  });

  it("attaches metadata to actions from the entry and from imported files", async () => {
    const info = await actionsInfoFromRpc();
    const byName = new Map(info.actions?.map((action) => [action.qualifiedName, action]));

    expect([...byName.keys()]).toEqual(["greet", "user.update"]);
    expect(byName.get("greet")?.segments).toEqual(["greet"]);
    expect(byName.get("user.update")?.segments).toEqual(["user", "update"]);
    expect(byName.get("greet")?.accept).toBe("json");
    expect(byName.get("greet")?.input).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
    });
    // This action is defined in user.ts, not the entry, so the helper
    // module's own `astro:actions` import must have been redirected too.
    expect(byName.get("user.update")?.accept).toBe("form");
    expect(byName.get("user.update")?.input).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
  });

  it("runs the entry's top-level code once across app and panel loads", async () => {
    // The app's own load of the actions module…
    await appImport("/src/actions/index.ts");
    // …and two panel refreshes through the real RPC loader.
    await actionsInfoFromRpc();
    await actionsInfoFromRpc();

    expect(sideEffectCount()).toBe(1);
  });

  it("keeps look-alike text in evaluated modules intact", async () => {
    const mod = await appImport("/src/actions/index.ts");

    expect(mod.label).toBe('from "astro:actions"');
  });

  it("leaves the client module graph untouched", async () => {
    const result = await server.transformRequest("/src/actions/index.ts", { ssr: false });

    expect(result?.code).toContain("astro:actions");
    expect(result?.code).not.toContain(WRAPPER_ID);
  });

  it("degrades to no data when the ssr environment is not runnable", async () => {
    // With the app's instance out of reach (adapter-provided runtime), any
    // other runner would evaluate the module's top-level code a second time.
    // The loader must not fall back to the prerender environment or to
    // `ssrLoadModule`'s compat runner.
    let foreignEvaluations = 0;
    const evaluate = () => {
      foreignEvaluations += 1;
      return Promise.resolve({ server: {} });
    };
    const nonRunnableServer = {
      environments: { ssr: {}, prerender: { runner: { import: evaluate } } },
      ssrLoadModule: evaluate,
    } as unknown as ViteDevServer;

    const info = await actionsInfoFromRpc(nonRunnableServer);

    expect(info.actions).toBeUndefined();
    expect(foreignEvaluations).toBe(0);
  });
});
