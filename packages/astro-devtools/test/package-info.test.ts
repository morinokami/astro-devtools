import { describe, expect, it } from "vite-plus/test";

import { detectPackageVersion, detectVitePackage } from "../src/package-info.ts";
import { useTempRoots } from "./support/temp-root.ts";

const tempRoot = useTempRoots();

describe("detectPackageVersion", () => {
  it("resolves an installed package's version", () => {
    expect(detectPackageVersion("astro")).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prefers the project's own copy over the one next to this package", () => {
    const root = tempRoot({
      "package.json": JSON.stringify({ name: "fake", private: true }),
      "node_modules/astro/package.json": JSON.stringify({ name: "astro", version: "0.0.0-fake" }),
    });

    expect(detectPackageVersion("astro", root)).toBe("0.0.0-fake");
  });

  it("returns undefined for unresolvable packages", () => {
    expect(detectPackageVersion("surely-not-installed-package")).toBeUndefined();
  });
});

describe("detectVitePackage", () => {
  it("prefers the vite nested under the project's astro over any nearer copy", () => {
    // pnpm-style strict layout: the project resolves astro but not vite,
    // and Astro includes its own copy. The fake versions identify which copy
    // was resolved. Using this package's node_modules as the fallback base
    // would return a real Vite version instead.
    const root = tempRoot({
      "package.json": JSON.stringify({ name: "fake", private: true }),
      "node_modules/astro/package.json": JSON.stringify({ name: "astro", version: "0.0.0-fake" }),
      "node_modules/astro/node_modules/vite/package.json": JSON.stringify({
        name: "vite",
        version: "9.9.9-astro",
      }),
    });

    expect(detectVitePackage(root)).toEqual({ name: "vite", version: "9.9.9-astro" });
  });

  it("reports the aliasing package's name, as Vite+ projects have", () => {
    const root = tempRoot({
      "package.json": JSON.stringify({ name: "fake", private: true }),
      "node_modules/astro/package.json": JSON.stringify({ name: "astro", version: "0.0.0-fake" }),
      "node_modules/astro/node_modules/vite/package.json": JSON.stringify({
        name: "@voidzero-dev/vite-plus-core",
        version: "0.3.2",
      }),
    });

    expect(detectVitePackage(root)).toEqual({
      name: "@voidzero-dev/vite-plus-core",
      version: "0.3.2",
    });
  });

  it("counts a nameless vite manifest as vite", () => {
    const root = tempRoot({
      "package.json": JSON.stringify({ name: "fake", private: true }),
      "node_modules/astro/package.json": JSON.stringify({ name: "astro", version: "0.0.0-fake" }),
      "node_modules/astro/node_modules/vite/package.json": JSON.stringify({ version: "9.9.9" }),
    });

    expect(detectVitePackage(root)).toEqual({ name: "vite", version: "9.9.9" });
  });

  it("resolves the vite this package runs on when the project resolves none", () => {
    expect(detectVitePackage()?.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
