/**
 * Versions of the packages installed for the project. Every lookup prefers
 * the project's own copy, resolved from its root, over the copy next to this
 * package, so a workspace or pnpm layout reports what `astro dev` really
 * runs on; Vite is resolved through Astro, which pins it.
 */
import { createRequire } from "node:module";

/**
 * Resolve the version of an installed package. The package must export its
 * `package.json` (astro, vite, and this package all do).
 */
export function detectPackageVersion(packageName: string, root?: URL): string | undefined {
  for (const base of resolutionBases(root)) {
    try {
      const packageJson = createRequire(base)(`${packageName}/package.json`) as {
        version?: unknown;
      };
      if (typeof packageJson.version === "string") return packageJson.version;
    } catch {
      // Try the next resolution location.
    }
  }
  return undefined;
}

/** The `vite` package a project runs on: `vite` itself, or a distribution that aliases it. */
export interface VitePackage {
  name: string;
  version: string;
}

/**
 * Resolve the Vite package used by the project's Astro installation, falling
 * back to a direct Vite dependency. Vite+ projects alias `vite` to
 * `@voidzero-dev/vite-plus-core`, so the name is reported along with the
 * version.
 */
export function detectVitePackage(root?: URL): VitePackage | undefined {
  const bases = resolutionBases(root);
  const throughAstro = (base: string | URL): NodeJS.Require =>
    createRequire(createRequire(base).resolve("astro/package.json"));
  // Every base is tried through Astro before any of them is tried directly.
  for (const requireFrom of [throughAstro, createRequire]) {
    for (const base of bases) {
      try {
        const vitePackage = readVitePackage(requireFrom(base));
        if (vitePackage) return vitePackage;
      } catch {
        // Try the next resolution location.
      }
    }
  }
  return undefined;
}

/** Read `vite/package.json` through `require`; a nameless manifest still counts as `vite`. */
function readVitePackage(require: NodeJS.Require): VitePackage | undefined {
  const packageJson = require("vite/package.json") as { name?: unknown; version?: unknown };
  if (typeof packageJson.version !== "string") return undefined;
  return {
    name: typeof packageJson.name === "string" ? packageJson.name : "vite",
    version: packageJson.version,
  };
}

/** Where a lookup starts: the project root first, then this package's own location. */
function resolutionBases(root?: URL): (string | URL)[] {
  return root ? [new URL("package.json", root), import.meta.url] : [import.meta.url];
}
