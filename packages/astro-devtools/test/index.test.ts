import type { AstroConfig, HookParameters } from "astro";

import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import astroDevtools from "../src/index.ts";

type ConfigSetupParams = HookParameters<"astro:config:setup">;
type ConfigDoneParams = HookParameters<"astro:config:done">;
type RoutesResolvedParams = HookParameters<"astro:routes:resolved">;

/** A resolved-config stand-in rooted in a directory that never exists. */
function createConfig(): AstroConfig {
  const root = pathToFileURL(path.join(tmpdir(), "astro-devtools-lifecycle") + path.sep);
  return {
    root,
    srcDir: new URL("src/", root),
    publicDir: new URL("public/", root),
    outDir: new URL("dist/", root),
    base: "/",
    trailingSlash: "ignore",
    build: { format: "directory" },
    output: "static",
    integrations: [],
    devToolbar: { enabled: true },
    server: { host: false },
    vite: { plugins: [] },
  } as unknown as AstroConfig;
}

/** Run the integration's config hooks the way Astro would for `command`. */
async function runLifecycle(command: ConfigSetupParams["command"]) {
  const config = createConfig();
  const injectedScripts: string[] = [];
  const updateConfigCalls: { vite?: { devtools?: unknown } }[] = [];
  const integration = astroDevtools({ mcp: false });

  await integration.hooks["astro:config:setup"]?.({
    command,
    config,
    updateConfig: ((next: { vite?: { devtools?: unknown } }) => {
      updateConfigCalls.push(next);
      return next;
    }) as ConfigSetupParams["updateConfig"],
    injectScript: ((stage: string, content: string) =>
      void injectedScripts.push(`${stage}:${content}`)) as ConfigSetupParams["injectScript"],
    logger: {
      warn: () => {},
      info: () => {},
      debug: () => {},
      error: () => {},
    } as unknown as ConfigSetupParams["logger"],
  } as ConfigSetupParams);
  await integration.hooks["astro:config:done"]?.({ config } as unknown as ConfigDoneParams);

  return { injectedScripts, updateConfigCalls, integration };
}

describe("astroDevtools lifecycle", () => {
  it("configures DevTools, injects the dock, and analyzes the project in dev", async () => {
    const { injectedScripts, updateConfigCalls } = await runLifecycle("dev");

    expect(updateConfigCalls).toHaveLength(1);
    // The workspace's Vite passes the version gate, so the integration's
    // defaults land in `vite.devtools` and the dock is injected.
    expect(updateConfigCalls[0]?.vite?.devtools).toMatchObject({ apply: "serve", mcp: false });
    expect(injectedScripts).toEqual(['page:import "astro-devtools/inject";']);
  });

  it.each(["build", "sync", "preview"] as const)(
    "does nothing during `astro %s`",
    async (command) => {
      const { injectedScripts, updateConfigCalls, integration } = await runLifecycle(command);

      expect(updateConfigCalls).toEqual([]);
      expect(injectedScripts).toEqual([]);
      // The guard must return before reading the routes; this malformed
      // route would throw otherwise.
      expect(() =>
        integration.hooks["astro:routes:resolved"]?.({
          routes: [{} as never],
        } as unknown as RoutesResolvedParams),
      ).not.toThrow();
    },
  );
});
