import { describe, expect, it } from "vite-plus/test";

import { toRouteHref, toRoutePathname } from "../../../src/client/platform/route-url.ts";

describe("toRoutePathname", () => {
  it("returns the pathname unchanged for the root base", () => {
    expect(toRoutePathname("/about", undefined)).toBe("/about");
    expect(toRoutePathname("/about", "/")).toBe("/about");
  });

  it("strips the configured base like the dev server does", () => {
    expect(toRoutePathname("/docs/about", "/docs")).toBe("/about");
    expect(toRoutePathname("/docs/about/", "/docs")).toBe("/about/");
    expect(toRoutePathname("/docs", "/docs")).toBe("/");
    expect(toRoutePathname("/docs/", "/docs")).toBe("/");
  });

  it("accepts a base resolved with a trailing slash", () => {
    expect(toRoutePathname("/docs/about", "/docs/")).toBe("/about");
    expect(toRoutePathname("/docs", "/docs/")).toBe("/");
  });

  it("leaves pathnames outside the base alone", () => {
    expect(toRoutePathname("/docsify/about", "/docs")).toBe("/docsify/about");
    expect(toRoutePathname("/other", "/docs")).toBe("/other");
  });

  it("decodes escapes so encoded URLs match their route", () => {
    expect(toRoutePathname("/caf%C3%A9", undefined)).toBe("/café");
  });

  it("keeps an undecodable pathname raw instead of throwing", () => {
    expect(toRoutePathname("/%C0%AF", undefined)).toBe("/%C0%AF");
  });
});

describe("toRouteHref", () => {
  it("returns the route pathname for a default config", () => {
    expect(toRouteHref("/about", "page", {})).toBe("/about");
    expect(toRouteHref("/", "page", {})).toBe("/");
  });

  it("prefixes the configured base", () => {
    expect(toRouteHref("/about", "page", { base: "/docs" })).toBe("/docs/about");
    expect(toRouteHref("/about", "page", { base: "/docs/" })).toBe("/docs/about");
    expect(toRouteHref("/", "page", { base: "/docs" })).toBe("/docs");
  });

  it("keeps the trailing slash of the resolved base for the site root", () => {
    // Under `trailingSlash: "ignore"` the dev server requires the base
    // verbatim: with `base: "/docs/"` the root lives at `/docs/`, not `/docs`.
    expect(toRouteHref("/", "page", { base: "/docs/", trailingSlash: "ignore" })).toBe("/docs/");
    expect(toRouteHref("/", "page", { base: "/docs", trailingSlash: "ignore" })).toBe("/docs");
    expect(toRouteHref("/", "page", { base: "/docs/", trailingSlash: "always" })).toBe("/docs/");
    expect(toRouteHref("/", "page", { base: "/docs", trailingSlash: "never" })).toBe("/docs");
  });

  it("appends a slash when trailingSlash is always", () => {
    expect(toRouteHref("/about", "page", { trailingSlash: "always" })).toBe("/about/");
    expect(toRouteHref("/about", "page", { base: "/docs", trailingSlash: "always" })).toBe(
      "/docs/about/",
    );
    expect(toRouteHref("/", "page", { base: "/docs", trailingSlash: "always" })).toBe("/docs/");
    expect(toRouteHref("/", "page", { trailingSlash: "always" })).toBe("/");
  });

  it("exempts only file-extension endpoints from the always rule", () => {
    // Astro builds these endpoint patterns with `trailingSlash: "never"`.
    expect(toRouteHref("/api/data.json", "endpoint", { trailingSlash: "always" })).toBe(
      "/api/data.json",
    );
    // A page URL that looks like a file (`feed.xml.astro`) still takes the slash.
    expect(toRouteHref("/feed.xml", "page", { trailingSlash: "always" })).toBe("/feed.xml/");
    // An extension-less endpoint follows the configured rule.
    expect(toRouteHref("/api/health", "endpoint", { trailingSlash: "always" })).toBe(
      "/api/health/",
    );
  });

  it("leaves URLs unchanged for never and ignore", () => {
    expect(toRouteHref("/about", "page", { trailingSlash: "never" })).toBe("/about");
    expect(toRouteHref("/about", "page", { trailingSlash: "ignore" })).toBe("/about");
  });
});
