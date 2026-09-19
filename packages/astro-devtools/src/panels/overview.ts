import type { AstroConfig } from "astro";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroDevtoolsStore } from "../store.ts";

import { detectPackageVersion, detectVitePackage } from "../package-info.ts";
import { detectConfigFile } from "./config.ts";
import { toI18nInfo } from "./routes.ts";

/**
 * Store the project details resolved from the Astro config. This is the only
 * writer of the store's `ProjectInfo`: the overview query returns all of it,
 * and the other queries pick the fields they need (`root` for the editor
 * links of the Islands, Routes, Actions and Config panels, `i18n` for
 * grouping routes, `configFile` for the Config panel's editor link).
 */
export function recordProjectInfo(store: AstroDevtoolsStore, config: AstroConfig): void {
  // Presence is detected once at startup; adding or removing these
  // files restarts the dev server anyway (astro watches them).
  const actionsFile = detectProjectFile(config.root, config.srcDir, "actions");
  const middlewareFile = detectProjectFile(config.root, config.srcDir, "middleware");
  store.setActionsModulePath(actionsFile ? fileURLToPath(actionsFile.url) : undefined);
  store.setProject({
    astroVersion: detectPackageVersion("astro", config.root),
    viteVersion: detectVitePackage(config.root)?.version,
    astroDevtoolsVersion: detectPackageVersion("astro-devtools", config.root),
    nodeVersion: process.version,
    output: config.output,
    adapterName: config.adapter?.name,
    root: fileURLToPath(config.root),
    base: config.base,
    trailingSlash: config.trailingSlash,
    buildFormat: config.build.format,
    i18n: toI18nInfo(config.i18n),
    actionsFile: actionsFile?.relative,
    middlewareFile: middlewareFile?.relative,
    configFile: detectConfigFile(config.root),
  });
}

/** Find an Actions or middleware file using Astro's supported file names. */
export function detectProjectFile(
  root: URL,
  srcDir: URL,
  name: "actions" | "middleware",
): { relative: string; url: URL } | undefined {
  const candidates = [
    `${name}.mjs`,
    `${name}.js`,
    `${name}.mts`,
    `${name}.ts`,
    `${name}/index.mjs`,
    `${name}/index.js`,
    `${name}/index.mts`,
    `${name}/index.ts`,
  ];
  const url = candidates.map((candidate) => new URL(candidate, srcDir)).find(existsSync);
  return url && { relative: path.relative(fileURLToPath(root), fileURLToPath(url)), url };
}
