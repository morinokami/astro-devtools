import type { AstroConfig } from "astro";

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { detectProjectFile, recordProjectInfo } from "../../src/panels/overview.ts";
import { createStore } from "../../src/store.ts";
import { useTempRoots } from "../support/temp-root.ts";

const tempRoot = useTempRoots();

describe("recordProjectInfo", () => {
  it("records detected project details", () => {
    const root = tempRoot({
      "package.json": JSON.stringify({ name: "fake", private: true }),
      "astro.config.mjs": "",
      "src/actions.ts": "",
      "src/middleware/index.mjs": "",
      "node_modules/astro/package.json": JSON.stringify({ name: "astro", version: "7.1.2" }),
      "node_modules/astro/node_modules/vite/package.json": JSON.stringify({
        name: "vite",
        version: "9.9.9-astro",
      }),
    });
    const config = {
      root,
      srcDir: new URL("src/", root),
      output: "server",
      adapter: { name: "@astrojs/node" },
      base: "/docs",
      trailingSlash: "always",
      build: { format: "file" },
      i18n: { locales: ["en", "ja"], defaultLocale: "en" },
    } as AstroConfig;
    const store = createStore();

    recordProjectInfo(store, config);

    expect(store.actionsModulePath).toBe(fileURLToPath(new URL("src/actions.ts", root)));
    expect(store.project).toMatchObject({
      astroVersion: "7.1.2",
      viteVersion: "9.9.9-astro",
      nodeVersion: process.version,
      output: "server",
      adapterName: "@astrojs/node",
      root: fileURLToPath(root),
      base: "/docs",
      trailingSlash: "always",
      buildFormat: "file",
      i18n: { locales: ["en", "ja"], defaultLocale: "en", manualRouting: false },
      actionsFile: "src/actions.ts",
      middlewareFile: "src/middleware/index.mjs",
      configFile: "astro.config.mjs",
    });
  });
});

describe("detectProjectFile", () => {
  const srcOf = (root: URL) => new URL("src/", root);

  it("finds a direct file and a nested index file, root-relative", () => {
    const root = tempRoot({ "src/middleware.ts": "", "src/actions/index.ts": "" });

    expect(detectProjectFile(root, srcOf(root), "middleware")?.relative).toBe("src/middleware.ts");
    expect(detectProjectFile(root, srcOf(root), "actions")?.relative).toBe("src/actions/index.ts");
  });

  it("prefers the candidate astro itself would resolve first", () => {
    // Astro's lookup order puts `.mjs` before `.ts`, and a direct file
    // before its `index/` variant.
    const extensions = tempRoot({ "src/middleware.mjs": "", "src/middleware.ts": "" });

    expect(detectProjectFile(extensions, srcOf(extensions), "middleware")?.relative).toBe(
      "src/middleware.mjs",
    );

    const actionFiles = tempRoot({ "src/actions.ts": "", "src/actions/index.ts": "" });

    expect(detectProjectFile(actionFiles, srcOf(actionFiles), "actions")?.relative).toBe(
      "src/actions.ts",
    );
  });

  it("returns undefined when the file does not exist", () => {
    const root = tempRoot({});

    expect(detectProjectFile(root, srcOf(root), "middleware")).toBeUndefined();
  });
});
