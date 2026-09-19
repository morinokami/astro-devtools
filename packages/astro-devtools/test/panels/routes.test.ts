import type { AstroConfig, IntegrationResolvedRoute } from "astro";

import { describe, expect, it } from "vite-plus/test";

import type { I18nInfo, RouteFallbackInfo, RouteInfo } from "../../src/types.ts";

import {
  buildRoutesInfo,
  comparePatterns,
  countRoutes,
  getRouteDelivery,
  hasOnDemandRoutes,
  toDisplayRoutes,
  toI18nInfo,
  toRouteInfo,
  toRouteInfos,
} from "../../src/panels/routes.ts";
import { createStore } from "../../src/store.ts";

function resolvedRoute(overrides: Partial<IntegrationResolvedRoute>): IntegrationResolvedRoute {
  return {
    pattern: "/",
    patternRegex: /^\/$/,
    entrypoint: "src/pages/index.astro",
    type: "page",
    isPrerendered: true,
    origin: "project",
    params: [],
    pathname: "/",
    segments: [],
    fallbackRoutes: [],
    generate: () => "/",
    ...overrides,
  } as IntegrationResolvedRoute;
}

/** The regex source Astro builds for a pattern without dynamic segments. */
const patternSource = (pattern: string) => `^${pattern.replaceAll("/", "\\/")}\\/?$`;

function route(overrides: Partial<RouteInfo> & Pick<RouteInfo, "pattern">): RouteInfo {
  return {
    patternSource: patternSource(overrides.pattern),
    entrypoint: `src/pages${overrides.pattern === "/" ? "/index" : overrides.pattern}.astro`,
    type: "page",
    prerendered: true,
    origin: "project",
    params: [],
    fallbackRoutes: [],
    ...overrides,
  };
}

/** An i18n fallback variant as `toRouteInfo` records it on its target route. */
function fallback(pattern: string): RouteFallbackInfo {
  return { pattern, patternSource: patternSource(pattern) };
}

describe("toRouteInfo", () => {
  it("serializes the fields the panel shows", () => {
    const routeInfo = toRouteInfo(
      resolvedRoute({
        pattern: "/blog/[slug]",
        patternRegex: /^\/blog\/([^/]+?)\/?$/,
        entrypoint: "src/pages/blog/[slug].astro",
        params: ["slug"],
        pathname: undefined,
      }),
    );

    expect(routeInfo).toMatchObject({
      pattern: "/blog/[slug]",
      entrypoint: "src/pages/blog/[slug].astro",
      type: "page",
      prerendered: true,
      origin: "project",
      params: ["slug"],
      pathname: undefined,
      redirect: undefined,
      fallbackRoutes: [],
    });
    expect(routeInfo.patternSource).toBe("^\\/blog\\/([^/]+?)\\/?$");
  });

  it("copies `params`, which Astro shares between a route and its i18n fallback", () => {
    // Astro builds the fallback by spreading the route it falls back to, so
    // both resolved routes hold the same array. devframe's MCP serializer
    // prints a re-encountered object reference as "[Circular]", so the two
    // rows must not share one.
    const sharedParams: string[] = [];
    const [routeInfo, fallbackInfo] = [
      toRouteInfo(resolvedRoute({ pattern: "/", params: sharedParams })),
      toRouteInfo(resolvedRoute({ pattern: "/en", params: sharedParams, type: "fallback" })),
    ];

    expect(routeInfo?.params).not.toBe(sharedParams);
    expect(routeInfo?.params).not.toBe(fallbackInfo?.params);
    expect(routeInfo?.params).toEqual([]);
  });

  it("normalizes string and object redirect configs", () => {
    const plain = toRouteInfo(resolvedRoute({ type: "redirect", redirect: "/new" }));

    expect(plain.redirect).toEqual({ destination: "/new" });

    const withStatus = toRouteInfo(
      resolvedRoute({ type: "redirect", redirect: { status: 302, destination: "/new" } }),
    );

    expect(withStatus.redirect).toEqual({ destination: "/new", status: 302 });
  });

  it("keeps the pattern and regex of attached i18n fallback routes", () => {
    const routeInfo = toRouteInfo(
      resolvedRoute({
        pattern: "/about",
        fallbackRoutes: [
          resolvedRoute({
            pattern: "/ja/about",
            patternRegex: /^\/ja\/about\/?$/,
            type: "fallback",
          }),
        ],
      }),
    );

    expect(routeInfo.fallbackRoutes).toEqual([
      { pattern: "/ja/about", patternSource: "^\\/ja\\/about\\/?$" },
    ]);
  });
});

describe("toRouteInfos", () => {
  /** Parse a route pattern into the segments Astro resolves it to. */
  const segmentsFor = (pattern: string): IntegrationResolvedRoute["segments"] =>
    pattern
      .split("/")
      .filter((segment) => segment !== "")
      .map((segment) => {
        const dynamic = /^\[.+\]$/.test(segment);
        const spread = segment.startsWith("[...");
        const content = dynamic ? segment.replace(/^\[\.{0,3}/, "").replace(/\]$/, "") : segment;
        return [{ content, dynamic, spread }];
      });

  const sortable = (pattern: string, overrides: Partial<IntegrationResolvedRoute> = {}) =>
    resolvedRoute({ pattern, segments: segmentsFor(pattern), ...overrides });

  it("ranks the default 404 route, which Astro appends after its own sort", () => {
    // `ensure404Route` pushes Astro's own `/404` onto the end of an already
    // sorted list, so the hook's array order is not the matching order: the
    // running Router sorts the static `/404` ahead of a root catch-all.
    const ordered = toRouteInfos([
      sortable("/about"),
      sortable("/blog/[slug]"),
      sortable("/[...slug]"),
      sortable("/404", { origin: "internal", entrypoint: "astro-default-404.astro" }),
    ]);

    expect(ordered.map((routeInfo) => routeInfo.pattern)).toEqual([
      "/404",
      "/about",
      "/blog/[slug]",
      "/[...slug]",
    ]);
  });

  it("keeps a list that Astro already sorted in place", () => {
    const patterns = ["/404", "/about", "/blog/[slug]", "/[...slug]"];

    expect(
      toRouteInfos(patterns.map((pattern) => sortable(pattern))).map((r) => r.pattern),
    ).toEqual(patterns);
  });

  it("puts endpoints before pages of the same shape, as Astro does", () => {
    const ordered = toRouteInfos([sortable("/[slug]"), sortable("/[slug]", { type: "endpoint" })]);

    expect(ordered.map((routeInfo) => routeInfo.type)).toEqual(["endpoint", "page"]);
  });
});

describe("hasOnDemandRoutes", () => {
  const internal = (overrides: Partial<RouteInfo> & Pick<RouteInfo, "pattern">) =>
    route({ origin: "internal", prerendered: false, ...overrides });

  it("is set by `output: server` alone", () => {
    expect(hasOnDemandRoutes([route({ pattern: "/" })], "server")).toBe(true);
    expect(hasOnDemandRoutes([route({ pattern: "/" })], "static")).toBe(false);
  });

  it("counts project and integration routes that opt out of prerendering", () => {
    expect(hasOnDemandRoutes([route({ pattern: "/app", prerendered: false })], "static")).toBe(
      true,
    );
    expect(
      hasOnDemandRoutes(
        [route({ pattern: "/injected", origin: "external", prerendered: false })],
        "static",
      ),
    ).toBe(true);
  });

  it("counts the actions endpoint, which Astro injects before its prerender scan", () => {
    // `astro build` for an all-prerendered project with actions ships
    // `/_image` next to `/_actions/[...path]`.
    expect(
      hasOnDemandRoutes(
        [route({ pattern: "/" }), internal({ pattern: "/_actions/[...path]", type: "endpoint" })],
        "static",
      ),
    ).toBe(true);
  });

  it("ignores the routes Astro injects after the scan", () => {
    // The same build without actions ships `/_server-islands/[name]` but no
    // `/_image`, even though the Node adapter makes it a server build: the
    // adapter only speaks up in `astro:config:done`, after the image
    // endpoint decision.
    expect(
      hasOnDemandRoutes(
        [
          route({ pattern: "/" }),
          internal({ pattern: "/_image", type: "endpoint" }),
          internal({ pattern: "/_server-islands/[name]" }),
          internal({ pattern: "/404", entrypoint: "astro-default-404.astro" }),
        ],
        "static",
      ),
    ).toBe(false);
  });
});

describe("getRouteDelivery", () => {
  const none = { hasAdapter: false, hasOnDemandRoutes: false };
  const adapterOnly = { hasAdapter: true, hasOnDemandRoutes: false };
  const withOnDemandRoutes = { hasAdapter: true, hasOnDemandRoutes: true };
  const onDemand = (
    overrides: Partial<RouteInfo>,
  ): Pick<RouteInfo, "prerendered" | "origin" | "pattern" | "entrypoint"> => ({
    prerendered: false,
    origin: "project",
    pattern: "/x",
    entrypoint: "src/pages/x.astro",
    ...overrides,
  });

  it("marks prerendered routes static regardless of adapter", () => {
    expect(getRouteDelivery(onDemand({ prerendered: true }), none)).toBe("static");
    expect(
      getRouteDelivery(onDemand({ prerendered: true, origin: "internal" }), withOnDemandRoutes),
    ).toBe("static");
  });

  it("splits a project's on-demand routes by adapter presence", () => {
    expect(getRouteDelivery(onDemand({}), withOnDemandRoutes)).toBe("server");
    expect(getRouteDelivery(onDemand({}), none)).toBe("needs-adapter");
  });

  it("marks the default error page dev-only even with an adapter", () => {
    const route = onDemand({
      origin: "internal",
      pattern: "/404",
      entrypoint: "astro-default-404.astro",
    });

    expect(getRouteDelivery(route, withOnDemandRoutes)).toBe("dev-only");
  });

  it("ships the server-islands route exactly when an adapter is set", () => {
    const route = onDemand({ origin: "internal", pattern: "/_server-islands/[name]" });

    expect(getRouteDelivery(route, adapterOnly)).toBe("server");
    expect(getRouteDelivery(route, none)).toBe("dev-only");
  });

  it("ships the actions endpoint exactly when an adapter is set", () => {
    // Astro injects it only when the project uses actions, and a build with
    // it needs an adapter — so an adapter always ships it.
    const route = onDemand({ origin: "internal", pattern: "/_actions/[...path]" });

    expect(getRouteDelivery(route, adapterOnly)).toBe("server");
    expect(getRouteDelivery(route, none)).toBe("dev-only");
  });

  it("ships the image endpoint only when some route renders on demand", () => {
    const route = onDemand({ origin: "internal", pattern: "/_image" });

    expect(getRouteDelivery(route, withOnDemandRoutes)).toBe("server");
    // An adapter is set but every route is prerendered: the build leaves
    // the endpoint out even when the adapter demands a server bundle.
    expect(getRouteDelivery(route, adapterOnly)).toBe("dev-only");
    expect(getRouteDelivery(route, none)).toBe("dev-only");
  });

  it("ties integration-injected routes to the adapter", () => {
    const route = onDemand({ origin: "external", pattern: "/injected" });

    expect(getRouteDelivery(route, withOnDemandRoutes)).toBe("server");
    expect(getRouteDelivery(route, none)).toBe("dev-only");
  });
});

describe("toI18nInfo", () => {
  it("returns undefined without i18n config", () => {
    expect(toI18nInfo(undefined)).toBeUndefined();
  });

  it("summarizes locales, routing options, and fallback", () => {
    const i18nInfo = toI18nInfo({
      locales: ["en", { path: "pt", codes: ["pt-BR", "pt-PT"] }],
      defaultLocale: "en",
      fallback: { pt: "en" },
      routing: {
        prefixDefaultLocale: true,
        redirectToDefaultLocale: true,
        fallbackType: "rewrite",
      },
    } as AstroConfig["i18n"]);

    expect(i18nInfo).toEqual({
      locales: ["en", "pt"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
      fallbackType: "rewrite",
      fallback: { pt: "en" },
    });
  });

  it("flags manual routing", () => {
    const i18nInfo = toI18nInfo({
      locales: ["en", "ja"],
      defaultLocale: "en",
      routing: "manual",
    } as AstroConfig["i18n"]);

    // Manual routing has no `fallbackType` option, and Astro's own
    // `toFallbackType` resolves it to `rewrite`.
    expect(i18nInfo).toMatchObject({ manualRouting: true, fallbackType: "rewrite" });
  });
});

describe("comparePatterns", () => {
  const sorted = (patterns: string[]) => patterns.toSorted(comparePatterns);

  it("puts a prefix before its deeper routes, so `/` comes first", () => {
    expect(sorted(["/about", "/blog/[slug]", "/dashboard", "/"])).toEqual([
      "/",
      "/about",
      "/blog/[slug]",
      "/dashboard",
    ]);
    expect(sorted(["/blog/[...rest]", "/blog"])).toEqual(["/blog", "/blog/[...rest]"]);
  });

  it("keeps Astro's segment ranking: static, mixed, dynamic, spread", () => {
    expect(sorted(["/x/[...rest]", "/x/[param]", "/x/page-[num]", "/x/static"])).toEqual([
      "/x/static",
      "/x/page-[num]",
      "/x/[param]",
      "/x/[...rest]",
    ]);
  });

  it("breaks dynamic-segment ties by later segments, not param names", () => {
    // Both match `/x/foo/c`; `/x/[z]/c` wins on the static third segment.
    expect(sorted(["/x/[a]/[d]", "/x/[z]/c"])).toEqual(["/x/[z]/c", "/x/[a]/[d]"]);
  });
});

describe("toDisplayRoutes", () => {
  it("orders each section in tree order regardless of matching order", () => {
    const display = toDisplayRoutes(
      [
        route({ pattern: "/about" }),
        route({ pattern: "/blog/[slug]" }),
        route({ pattern: "/dashboard" }),
        route({ pattern: "/" }),
        route({ pattern: "/api/status", type: "endpoint" }),
        route({ pattern: "/api/hello", type: "endpoint" }),
      ],
      {},
    );

    expect(display.map((row) => row.pattern)).toEqual([
      "/",
      "/about",
      "/blog/[slug]",
      "/dashboard",
      "/api/hello",
      "/api/status",
    ]);
  });

  it("assigns distinct sections to project, integration, and internal routes", () => {
    const display = toDisplayRoutes(
      [
        route({ pattern: "/_image", type: "endpoint", origin: "internal", prerendered: false }),
        route({ pattern: "/api/hello", type: "endpoint" }),
        route({ pattern: "/old", type: "redirect", redirect: { destination: "/new" } }),
        route({ pattern: "/injected", origin: "external" }),
        route({ pattern: "/" }),
      ],
      { adapterName: "@astrojs/node" },
    );

    expect(display.map((row) => [row.pattern, row.section])).toEqual([
      ["/", "pages"],
      ["/api/hello", "endpoints"],
      ["/old", "redirects"],
      ["/injected", "integrations"],
      ["/_image", "internal"],
    ]);
  });

  it("keeps Astro's route-matching order in `matchOrder`", () => {
    const display = toDisplayRoutes(
      [route({ pattern: "/api/hello", type: "endpoint" }), route({ pattern: "/" })],
      {},
    );

    expect(display.map((row) => [row.pattern, row.matchOrder])).toEqual([
      ["/", 1],
      ["/api/hello", 0],
    ]);
  });

  it("labels Astro's built-in routes by pattern", () => {
    const display = toDisplayRoutes(
      [
        route({
          pattern: "/_image",
          type: "endpoint",
          origin: "internal",
          prerendered: false,
          entrypoint: "../node_modules/astro/dist/assets/endpoint/node.js",
        }),
        route({
          pattern: "/_actions/[...path]",
          type: "endpoint",
          origin: "internal",
          prerendered: false,
        }),
        route({
          pattern: "/_server-islands/[name]",
          origin: "internal",
          prerendered: false,
        }),
        route({
          pattern: "/404",
          origin: "internal",
          prerendered: false,
          entrypoint: "astro-default-404.astro",
        }),
      ],
      {},
    );

    expect(Object.fromEntries(display.map((row) => [row.pattern, row.sourceLabel]))).toEqual({
      "/_image": "astro (image endpoint)",
      "/_actions/[...path]": "astro (actions endpoint)",
      "/_server-islands/[name]": "astro (server islands)",
      "/404": "astro (default 404)",
    });
    expect(display.every((row) => row.sourceIsFile === false)).toBe(true);
  });

  it("labels integration-injected routes with their package name", () => {
    const [pnpm, scoped] = toDisplayRoutes(
      [
        route({
          pattern: "/injected",
          origin: "external",
          entrypoint:
            "../node_modules/.pnpm/some-tool@1.0.0/node_modules/some-tool/dist/page.astro",
        }),
        route({
          pattern: "/scoped",
          origin: "external",
          entrypoint: "node_modules/@scope/tool/dist/page.astro",
        }),
      ],
      {},
    );

    expect(pnpm?.sourceLabel).toBe("some-tool (integration)");
    expect(scoped?.sourceLabel).toBe("@scope/tool (integration)");
    expect(pnpm?.section).toBe("integrations");
    expect(scoped?.section).toBe("integrations");
  });

  it("hides the redirect pseudo-entrypoint and keeps the destination", () => {
    const [redirect] = toDisplayRoutes(
      [
        route({
          pattern: "/old",
          type: "redirect",
          entrypoint: "/old",
          redirect: { destination: "/new", status: 302 },
        }),
      ],
      {},
    );

    expect(redirect).toMatchObject({
      section: "redirects",
      sourceLabel: "",
      sourceIsFile: false,
      redirect: { destination: "/new", status: 302 },
    });
  });

  it("groups locale variants under their base route", () => {
    const i18n: I18nInfo = {
      locales: ["en", "ja"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: "redirect",
    };
    const display = toDisplayRoutes(
      [route({ pattern: "/about" }), route({ pattern: "/blog" }), route({ pattern: "/ja/about" })],
      { i18n },
    );

    expect(display.map((row) => [row.pattern, row.variantOf])).toEqual([
      ["/about", undefined],
      ["/ja/about", "/about"],
      ["/blog", undefined],
    ]);
  });

  it("places a group at its base route's tree position", () => {
    const i18n: I18nInfo = {
      locales: ["en", "ja"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: "redirect",
    };
    // `/ja/zebra` sorts before `/zebra`; grouping must still list it under
    // `/zebra`, not ahead of it.
    const display = toDisplayRoutes(
      [route({ pattern: "/ja/zebra" }), route({ pattern: "/apple" }), route({ pattern: "/zebra" })],
      { i18n },
    );

    expect(display.map((row) => [row.pattern, row.variantOf])).toEqual([
      ["/apple", undefined],
      ["/zebra", undefined],
      ["/ja/zebra", "/zebra"],
    ]);
  });

  it("matches locales in any URL segment, as astro's own routing does", () => {
    const i18n: I18nInfo = {
      locales: ["en", "ja"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: "redirect",
    };
    // Locale folders may sit anywhere below src/pages/, so to Astro
    // `/products/ja` is the `ja` variant of `/products` just as `/ja` is
    // of `/`; the panel must group both the same way.
    const display = toDisplayRoutes(
      [
        route({ pattern: "/" }),
        route({ pattern: "/ja" }),
        route({ pattern: "/products" }),
        route({ pattern: "/products/ja" }),
      ],
      { i18n },
    );

    expect(display.map((row) => [row.pattern, row.variantOf])).toEqual([
      ["/", undefined],
      ["/ja", "/"],
      ["/products", undefined],
      ["/products/ja", "/products"],
    ]);
  });

  it("groups every locale under the default-locale route with prefixDefaultLocale", () => {
    const i18n: I18nInfo = {
      locales: ["en", "ja"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
      fallbackType: "redirect",
    };
    const display = toDisplayRoutes(
      [
        route({ pattern: "/en" }),
        route({ pattern: "/ja" }),
        route({ pattern: "/en/about" }),
        route({ pattern: "/ja/about" }),
      ],
      { i18n },
    );

    expect(display.map((row) => [row.pattern, row.variantOf])).toEqual([
      ["/en", undefined],
      ["/ja", "/en"],
      ["/en/about", undefined],
      ["/ja/about", "/en/about"],
    ]);
  });

  it("synthesizes a grouped row per i18n fallback variant", () => {
    const i18n: I18nInfo = {
      locales: ["en", "fr"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: "rewrite",
    };
    const display = toDisplayRoutes(
      [route({ pattern: "/about", fallbackRoutes: [fallback("/fr/about")] })],
      { i18n },
    );

    expect(display).toHaveLength(2);
    expect(display[1]).toMatchObject({
      pattern: "/fr/about",
      type: "fallback",
      variantOf: "/about",
      fallbackOf: "/about",
      // The fallback's own regex: a rewrite fallback keeps the browser on
      // its URL, and this row must then match as the current page.
      patternSource: "^\\/fr\\/about\\/?$",
      pathname: undefined,
      sourceLabel: "",
    });
    // The synthesized row inherits the primary route's delivery and
    // matching position.
    expect(display[1]?.delivery).toBe(display[0]?.delivery);
    expect(display[1]?.matchOrder).toBe(display[0]?.matchOrder);
  });

  it("adds one row per fallback URL when several locales fall back alike", () => {
    // `fallback: { ja: "en", fr: "en" }` with `prefixDefaultLocale` leaves
    // every page with two fallback routes that are both the page's own
    // pattern, and the rows for them would be identical in every field.
    const i18n: I18nInfo = {
      locales: ["en", "ja", "fr"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
      fallbackType: "redirect",
    };
    const display = toDisplayRoutes(
      [route({ pattern: "/about", fallbackRoutes: [fallback("/about"), fallback("/about")] })],
      { i18n },
    );

    expect(display.map((row) => [row.pattern, row.fallbackOf])).toEqual([
      ["/about", undefined],
      ["/about", "/about"],
    ]);
  });

  it("gives fallback rows their own params instead of the primary's array", () => {
    const i18n: I18nInfo = {
      locales: ["en", "ja"],
      defaultLocale: "en",
      manualRouting: false,
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
      fallbackType: "rewrite",
    };
    const display = toDisplayRoutes(
      [
        route({
          pattern: "/blog/[slug]",
          params: ["slug"],
          redirect: { destination: "/news/[slug]" },
          fallbackRoutes: [fallback("/ja/blog/[slug]")],
        }),
      ],
      { i18n },
    );

    expect(display[1]?.params).toEqual(["slug"]);
    expect(display[1]?.params).not.toBe(display[0]?.params);
    expect(display[1]?.redirect).toEqual({ destination: "/news/[slug]" });
    expect(display[1]?.redirect).not.toBe(display[0]?.redirect);
    // devframe's MCP serializer replaces any re-encountered object reference
    // with "[Circular]" — shared, non-cyclic references included — so the
    // payload must never repeat a reference.
    const seen = new WeakSet();
    const payload = JSON.stringify(display, (_key, value) => {
      if (value !== null && typeof value === "object") {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
    expect(payload).not.toContain("[Circular]");
  });

  it("ships the image endpoint once the actions endpoint puts the build on demand", () => {
    const routes = [
      route({ pattern: "/_image", type: "endpoint", origin: "internal", prerendered: false }),
      route({ pattern: "/" }),
    ];
    const actionsRoute = route({
      pattern: "/_actions/[...path]",
      type: "endpoint",
      origin: "internal",
      prerendered: false,
    });
    const context = { output: "static", adapterName: "@astrojs/node" };
    const imageDelivery = (rows: RouteInfo[]) =>
      toDisplayRoutes(rows, context).find((row) => row.pattern === "/_image")?.delivery;

    // Verified against `astro build` output: only the second build lists
    // `/_image` in its server manifest.
    expect(imageDelivery(routes)).toBe("dev-only");
    expect(imageDelivery([...routes, actionsRoute])).toBe("server");
  });
});

describe("countRoutes", () => {
  it("counts the project's own routes, excluding internal and injected ones", () => {
    const counts = countRoutes([
      route({ pattern: "/" }),
      route({ pattern: "/about" }),
      route({ pattern: "/api/hello", type: "endpoint" }),
      route({ pattern: "/old", type: "redirect", redirect: { destination: "/new" } }),
      // Astro injects these in dev or when an adapter is present; the
      // Routes panel lists them under Internal or Integrations. The
      // Overview totals must exclude the same routes before linking to
      // that panel.
      route({
        pattern: "/404",
        origin: "internal",
        prerendered: false,
        entrypoint: "astro-default-404.astro",
      }),
      route({ pattern: "/_image", type: "endpoint", origin: "internal", prerendered: false }),
      route({ pattern: "/injected", origin: "external" }),
    ]);

    expect(counts).toEqual({ pages: 2, endpoints: 1, redirects: 1 });
  });

  it("agrees with the Routes panel's own section rows", () => {
    const routes = [
      route({ pattern: "/", fallbackRoutes: [fallback("/fr")] }),
      route({ pattern: "/about" }),
      route({ pattern: "/api/hello", type: "endpoint" }),
      route({ pattern: "/old", type: "redirect", redirect: { destination: "/new" } }),
      route({
        pattern: "/404",
        origin: "internal",
        prerendered: false,
        entrypoint: "astro-default-404.astro",
      }),
    ];
    const display = toDisplayRoutes(routes, {});

    // The panel counts a section's real routes the same way (its `#countOf`
    // skips the synthesized fallback rows), so the two derivations must
    // land on the same numbers for the same store.
    for (const [section, count] of Object.entries(countRoutes(routes))) {
      expect(
        display.filter((row) => row.section === section && row.fallbackOf === undefined),
      ).toHaveLength(count);
    }
  });
});

describe("buildRoutesInfo", () => {
  it("assembles the context from the recorded project metadata", () => {
    const store = createStore();
    store.setProject({
      output: "static",
      adapterName: "@astrojs/node",
      middlewareFile: "src/middleware.ts",
      root: "/work/site",
      base: "/docs",
      trailingSlash: "always",
    });
    store.setRoutes([route({ pattern: "/" }), route({ pattern: "/api", type: "endpoint" })]);
    const routesInfo = buildRoutesInfo(store);

    expect(routesInfo.context).toMatchObject({
      output: "static",
      adapterName: "@astrojs/node",
      middlewareFile: "src/middleware.ts",
      root: "/work/site",
      base: "/docs",
      trailingSlash: "always",
    });
    expect(routesInfo.routes.map((row) => row.section)).toEqual(["pages", "endpoints"]);
  });

  it("derives delivery from the recorded adapter", () => {
    const store = createStore();
    store.setRoutes([route({ pattern: "/app", prerendered: false })]);

    expect(buildRoutesInfo(store).routes[0]?.delivery).toBe("needs-adapter");

    store.setProject({ adapterName: "@astrojs/node" });

    expect(buildRoutesInfo(store).routes[0]?.delivery).toBe("server");
  });
});
