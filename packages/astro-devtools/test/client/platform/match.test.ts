import { describe, expect, it } from "vite-plus/test";

import { matchRoute } from "../../../src/client/platform/match.ts";

const route = (patternSource: string) => ({ patternSource });

describe("matchRoute", () => {
  it("returns the first matching route in the given order", () => {
    // The list arrives in Astro's route-matching order, so when two
    // patterns both match, taking the first is what the server would do.
    const staticRoute = route("^\\/blog\\/hello\\/?$");
    const dynamicRoute = route("^\\/blog\\/([^/]+?)\\/?$");
    expect(matchRoute([staticRoute, dynamicRoute], "/blog/hello")).toBe(staticRoute);
    expect(matchRoute([staticRoute, dynamicRoute], "/blog/other")).toBe(dynamicRoute);
  });

  it("returns undefined when no route matches", () => {
    expect(matchRoute([route("^\\/about\\/?$")], "/missing")).toBeUndefined();
    expect(matchRoute([], "/")).toBeUndefined();
  });

  it("never matches a route without a pattern source", () => {
    // A stale dev server (started before a package update) can serve
    // routes without the field; `new RegExp(undefined)` is `/(?:)/` and
    // would match every URL.
    const stale = { patternSource: undefined } as unknown as { patternSource: string };
    const about = route("^\\/about\\/?$");
    expect(matchRoute([stale, about], "/about")).toBe(about);
    expect(matchRoute([route("")], "/anything")).toBeUndefined();
  });

  it("skips an unparsable pattern instead of failing the whole match", () => {
    const about = route("^\\/about\\/?$");
    expect(matchRoute([route("(unclosed"), about], "/about")).toBe(about);
  });
});
