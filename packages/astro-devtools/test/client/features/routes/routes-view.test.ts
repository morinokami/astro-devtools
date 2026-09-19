import { describe, expect, it } from "vite-plus/test";

import type { RouteDisplay } from "../../../../src/types.ts";

import { currentRowKey, rowKey } from "../../../../src/client/features/routes/routes-view.ts";

function row(pattern: string, overrides: Partial<RouteDisplay> = {}): RouteDisplay {
  return {
    pattern,
    patternSource: `^${pattern.replaceAll("/", "\\/")}\\/?$`,
    entrypoint: `src/pages${pattern}.astro`,
    type: "page",
    prerendered: true,
    origin: "project",
    pathname: pattern,
    params: [],
    fallbackRoutes: [],
    section: "pages",
    delivery: "static",
    matchOrder: 0,
    sourceLabel: pattern,
    sourceIsFile: true,
    ...overrides,
  };
}

/** A synthesized fallback row: it shares its target's `matchOrder` and follows it. */
function fallbackRow(pattern: string, target: RouteDisplay, patternSource?: string): RouteDisplay {
  return row(pattern, {
    ...(patternSource === undefined ? {} : { patternSource }),
    type: "fallback",
    pathname: undefined,
    matchOrder: target.matchOrder,
    variantOf: target.pattern,
    fallbackOf: target.pattern,
    sourceLabel: "",
    sourceIsFile: false,
  });
}

describe("currentRowKey", () => {
  it("picks the fallback row when a rewrite fallback keeps the browser on its URL", () => {
    // Display order lists `/about` and its fallback after `/[lang]/about`;
    // Astro matches `/about` first (`matchOrder`) and tests its fallback
    // patterns as part of that candidate.
    const about = row("/about", { matchOrder: 1 });
    const fallback = fallbackRow("/fr/about", about);
    const routes = [
      row("/[lang]/about", { patternSource: "^/([^/]+?)/about/?$", matchOrder: 2 }),
      about,
      fallback,
    ];

    expect(currentRowKey({ context: {}, routes }, "/fr/about")).toBe(rowKey(fallback));
    expect(currentRowKey({ context: {}, routes }, "/about")).toBe(rowKey(about));
  });

  it("lets the serving route win over its fallback row when both match", () => {
    // Astro tests a route's own pattern before its fallback patterns.
    const catchAll = row("/[...all]", { patternSource: "^/(.*?)/?$" });
    const fallback = fallbackRow("/fr/[...all]", catchAll, "^/fr/(.*?)/?$");

    expect(currentRowKey({ context: {}, routes: [catchAll, fallback] }, "/fr/x")).toBe(
      rowKey(catchAll),
    );
  });
});

describe("rowKey", () => {
  it("separates rows that repeat a pattern, as Astro's own fallback routes do", () => {
    // With `prefixDefaultLocale` and `redirectToDefaultLocale`, Astro resolves
    // a second `/` route of its own (`type: "fallback"`, no `fallbackOf`)
    // beside the index route, and each gets a synthesized fallback row. All
    // four rows render in one list, so all four need their own key.
    const index = row("/", { matchOrder: 0 });
    const astroFallback = row("/", { matchOrder: 1, type: "fallback", variantOf: "/" });
    const rows = [index, fallbackRow("/", index), astroFallback, fallbackRow("/", astroFallback)];

    expect(new Set(rows.map(rowKey)).size).toBe(rows.length);
  });
});
