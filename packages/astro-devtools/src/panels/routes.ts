import type { AstroConfig, IntegrationResolvedRoute } from "astro";

import type { AstroDevtoolsStore } from "../store.ts";
import type {
  I18nInfo,
  OverviewCounts,
  RedirectInfo,
  RouteDelivery,
  RouteDisplay,
  RouteInfo,
  RouteSection,
  RoutesInfo,
} from "../types.ts";

/** Reduce the resolved `i18n` config to the summary that the panel shows. */
export function toI18nInfo(i18n: AstroConfig["i18n"]): I18nInfo | undefined {
  if (!i18n) return undefined;
  const routing = i18n.routing;
  const manualRouting = routing === "manual";
  const routingOptions = manualRouting || routing === undefined ? undefined : routing;
  return {
    locales: i18n.locales.map((locale) => (typeof locale === "string" ? locale : locale.path)),
    defaultLocale: i18n.defaultLocale,
    manualRouting,
    prefixDefaultLocale: routingOptions?.prefixDefaultLocale === true,
    redirectToDefaultLocale: routingOptions?.redirectToDefaultLocale === true,
    // Manual routing carries no `fallbackType` of its own, and Astro resolves
    // it to `rewrite` (`toFallbackType`) for both the runtime manifest and
    // `astro:i18n`, so the panels have to say `rewrite` too.
    fallbackType: manualRouting ? "rewrite" : (routingOptions?.fallbackType ?? "redirect"),
    fallback: i18n.fallback,
  };
}

/**
 * Reduce the resolved routes to the store's list, ordered the way the dev
 * server matches URLs. `astro:routes:resolved` is not that order: Astro sorts
 * the routes it collected and then appends its default error pages
 * (`ensure404Route`), so a project without its own `src/pages/404.astro`
 * receives `/404` behind a root `[...slug]` that the running server ranks
 * below it. Sorting here is what makes `matchOrder` — the array position the
 * panel matches URLs by — true to its name.
 */
export function toRouteInfos(routes: IntegrationResolvedRoute[]): RouteInfo[] {
  return routes.toSorted(compareMatchPriority).map(toRouteInfo);
}

/** Reduce a resolved route to the serializable fields that the panel shows. */
export function toRouteInfo(route: IntegrationResolvedRoute): RouteInfo {
  return {
    pattern: route.pattern,
    patternSource: route.patternRegex.source,
    entrypoint: String(route.entrypoint),
    type: route.type,
    prerendered: route.isPrerendered,
    origin: route.origin,
    pathname: route.pathname,
    // Astro builds an i18n fallback route by spreading the route it falls
    // back to, so two resolved routes can share one `params` array — and
    // devframe's MCP serializer prints any re-encountered object reference
    // as "[Circular]". Copying it here keeps both rows' params real arrays.
    params: [...route.params],
    redirect: toRedirectInfo(route.redirect),
    // Astro stores i18n fallback routes on their target route.
    fallbackRoutes: route.fallbackRoutes.map((fallback) => ({
      pattern: fallback.pattern,
      patternSource: fallback.patternRegex.source,
    })),
  };
}

function toRedirectInfo(redirect: IntegrationResolvedRoute["redirect"]): RedirectInfo | undefined {
  if (redirect === undefined) return undefined;
  if (typeof redirect === "string") return { destination: redirect };
  return { destination: redirect.destination, status: redirect.status };
}

/** One parsed part of a route segment, as Astro's route priority reads it. */
type RoutePart = IntegrationResolvedRoute["segments"][number][number];

/**
 * Astro's own route priority, mirroring `routeComparator`
 * (astro/src/core/routing/priority.ts) — the comparator the dev server's
 * `Router` sorts by before it matches a URL. Kept field for field so that
 * re-sorting an already sorted list only moves the routes that Astro added
 * after its own sort.
 */
function compareMatchPriority(
  leftRoute: IntegrationResolvedRoute,
  rightRoute: IntegrationResolvedRoute,
): number {
  const leftSegments = leftRoute.segments;
  const rightSegments = rightRoute.segments;
  const commonLength = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < commonLength; index++) {
    const left = leftSegments[index] ?? [];
    const right = rightSegments[index] ?? [];
    const leftIsStatic = left.every(isStaticPart);
    const rightIsStatic = right.every(isStaticPart);
    if (leftIsStatic && rightIsStatic) {
      const leftContent = segmentContent(left);
      const rightContent = segmentContent(right);
      if (leftContent !== rightContent) return leftContent.localeCompare(rightContent);
    }
    if (leftIsStatic !== rightIsStatic) return leftIsStatic ? -1 : 1;
    const leftIsDynamic = left.every((part) => part.dynamic);
    const rightIsDynamic = right.every((part) => part.dynamic);
    if (leftIsDynamic !== rightIsDynamic) return leftIsDynamic ? 1 : -1;
    const leftHasSpread = left.some((part) => part.spread);
    const rightHasSpread = right.some((part) => part.spread);
    if (leftHasSpread !== rightHasSpread) return leftHasSpread ? 1 : -1;
  }
  if (leftSegments.length !== rightSegments.length) {
    // A route is only outranked by the one extra segment of a rest route.
    const leftEndsInRest = leftSegments.at(-1)?.some((part) => part.spread);
    const rightEndsInRest = rightSegments.at(-1)?.some((part) => part.spread);
    if (
      leftEndsInRest !== rightEndsInRest &&
      Math.abs(leftSegments.length - rightSegments.length) === 1
    ) {
      if (leftSegments.length > rightSegments.length && leftEndsInRest) return 1;
      if (rightSegments.length > leftSegments.length && rightEndsInRest) return -1;
    }
    return leftSegments.length > rightSegments.length ? -1 : 1;
  }
  if ((leftRoute.type === "endpoint") !== (rightRoute.type === "endpoint")) {
    return leftRoute.type === "endpoint" ? -1 : 1;
  }
  return leftRoute.pattern.localeCompare(rightRoute.pattern);
}

function isStaticPart(part: RoutePart): boolean {
  return !part.dynamic && !part.spread;
}

function segmentContent(segment: readonly RoutePart[]): string {
  return segment.map((part) => part.content).join("");
}

/** Build the Routes panel response from the current store. */
export function buildRoutesInfo(store: AstroDevtoolsStore): RoutesInfo {
  const { output, adapterName, middlewareFile, root, base, trailingSlash, i18n } = store.project;
  const context = { output, adapterName, middlewareFile, root, base, trailingSlash, i18n };
  return { context, routes: toDisplayRoutes(store.routes, context) };
}

/** Add display fields, group localized pages, and sort each section by URL. */
export function toDisplayRoutes(
  routes: RouteInfo[],
  context: { output?: string; adapterName?: string; i18n?: I18nInfo },
): RouteDisplay[] {
  const deliveryContext: RouteDeliveryContext = {
    hasAdapter: Boolean(context.adapterName),
    hasOnDemandRoutes: hasOnDemandRoutes(routes, context.output),
  };
  const displayRoutes = routes.map((route, index): RouteDisplay => {
    const source = getRouteSource(route);
    return {
      ...route,
      section: getRouteSection(route),
      delivery: getRouteDelivery(route, deliveryContext),
      matchOrder: index,
      sourceLabel: source.label,
      sourceIsFile: source.isFile,
    };
  });
  // One grouping pass instead of one full scan per section, and the same
  // `Map.groupBy` that `countRoutes` below counts the sections with.
  const routesBySection = Map.groupBy(displayRoutes, (route) => route.section);
  const routesInSection = (section: RouteSection) =>
    (routesBySection.get(section) ?? []).toSorted((leftRoute, rightRoute) =>
      comparePatterns(leftRoute.pattern, rightRoute.pattern),
    );
  const orderedRoutes = [
    ...groupLocalizedPages(routesInSection("pages"), context.i18n),
    ...routesInSection("endpoints"),
    ...routesInSection("redirects"),
    ...routesInSection("integrations"),
    ...routesInSection("internal"),
  ];
  return addFallbackRows(orderedRoutes);
}

/** Readable labels for Astro's built-in routes. */
const INTERNAL_LABELS: [pattern: string, label: string][] = [
  ["/_image", "astro (image endpoint)"],
  ["/_actions/", "astro (actions endpoint)"],
  ["/_server-islands/", "astro (server islands)"],
];

function getRouteSource(route: RouteInfo): { label: string; isFile: boolean } {
  // Redirect rows show their destination instead of a source module.
  if (route.type === "redirect") return { label: "", isFile: false };
  if (route.origin === "project") return { label: route.entrypoint, isFile: true };
  if (route.origin === "internal") {
    const internal = INTERNAL_LABELS.find(([pattern]) => route.pattern.startsWith(pattern));
    if (internal) return { label: internal[1], isFile: false };
    const defaultPage = /^astro-default-(\w+)\.astro$/.exec(route.entrypoint);
    if (defaultPage) return { label: `astro (default ${defaultPage[1]})`, isFile: false };
    return { label: "astro (built-in)", isFile: false };
  }
  // origin "external": injected by an integration.
  const packageName = getPackageName(route.entrypoint);
  return {
    label: packageName ? `${packageName} (integration)` : route.entrypoint,
    isFile: false,
  };
}

/** Package name for a path inside node_modules, or `undefined` for paths outside it. */
function getPackageName(entrypoint: string): string | undefined {
  const marker = "node_modules/";
  // Searching for the last occurrence skips pnpm's store prefix
  // (`.pnpm/<id>/node_modules/`).
  const index = entrypoint.lastIndexOf(marker);
  if (index === -1) return undefined;
  const segments = entrypoint.slice(index + marker.length).split("/");
  const name = segments[0]?.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  return name || undefined;
}

function getRouteSection(route: RouteInfo): RouteSection {
  if (route.origin === "internal") return "internal";
  if (route.origin === "external") return "integrations";
  if (route.type === "redirect") return "redirects";
  if (route.type === "endpoint") return "endpoints";
  return "pages";
}

/**
 * Count the project's own routes by Routes panel section: pages, endpoints,
 * and redirects. The panel's other two sections, Integrations and Internal,
 * hold integration-injected and Astro internal routes, which are not counted.
 */
export function countRoutes(routes: RouteInfo[]): Omit<OverviewCounts, "actions"> {
  const sections = Map.groupBy(
    routes.filter((route) => route.origin === "project"),
    getRouteSection,
  );
  const count = (section: RouteSection): number => sections.get(section)?.length ?? 0;
  return { pages: count("pages"), endpoints: count("endpoints"), redirects: count("redirects") };
}

interface RouteDeliveryContext {
  hasAdapter: boolean;
  /**
   * `true` when some route renders on demand: `output` is `server`, or a
   * route covered by Astro's prerender scan opts out of prerendering. See
   * `hasOnDemandRoutes`.
   */
  hasOnDemandRoutes: boolean;
}

/**
 * Mirror the `buildOutput` that `astro build` has settled on when it decides
 * whether to add the image endpoint: `server` when `output` is `server` or
 * when a route in its prerender scan is not prerendered. The scan covers
 * project and integration routes plus the actions endpoint, which Astro
 * injects before it with `prerender: false`; the image endpoint, the
 * server-islands endpoint, and the default error pages are injected after
 * the scan, so their own `prerender: false` never counts. An adapter that
 * demands a server build (`adapterFeatures.buildOutput`) only applies in
 * `astro:config:done`, which the build runs after resolving routes, so it
 * does not count either: such a build still leaves the image endpoint out.
 */
export function hasOnDemandRoutes(routes: RouteInfo[], output: string | undefined): boolean {
  if (output === "server") return true;
  return routes.some(
    (route) =>
      !route.prerendered && (route.origin !== "internal" || route.pattern.startsWith("/_actions/")),
  );
}

/** Determine how a route is delivered after `astro build`. */
export function getRouteDelivery(
  route: Pick<RouteInfo, "prerendered" | "origin" | "pattern" | "entrypoint">,
  context: RouteDeliveryContext,
): RouteDelivery {
  if (route.prerendered) return "static";
  if (route.origin === "project") return context.hasAdapter ? "server" : "needs-adapter";
  if (route.origin === "internal") {
    if (/^astro-default-\w+\.astro$/.test(route.entrypoint)) return "dev-only";
    // Server islands and actions render on demand even when every page is
    // prerendered, so an adapter always ships their endpoints. Astro rejects
    // either feature at config time when no server target exists for them.
    if (route.pattern.startsWith("/_server-islands/") || route.pattern.startsWith("/_actions/")) {
      return context.hasAdapter ? "server" : "dev-only";
    }
    // The image endpoint: the dev server always injects it, the build only
    // for a project with on-demand routes.
    return context.hasAdapter && context.hasOnDemandRoutes ? "server" : "dev-only";
  }
  return context.hasAdapter ? "server" : "dev-only";
}

/**
 * Sort route patterns by URL segments: static before dynamic before spread.
 * Unlike Astro's route-matching sort, a shorter prefix appears first for easier scanning.
 */
export function comparePatterns(leftPattern: string, rightPattern: string): number {
  const leftSegments = getPatternSegments(leftPattern);
  const rightSegments = getPatternSegments(rightPattern);
  const commonLength = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < commonLength; index++) {
    const order = compareSegments(leftSegments[index] ?? "", rightSegments[index] ?? "");
    if (order !== 0) return order;
  }
  if (leftSegments.length !== rightSegments.length) {
    return leftSegments.length - rightSegments.length;
  }
  return leftPattern.localeCompare(rightPattern);
}

function getPatternSegments(pattern: string): string[] {
  return pattern.split("/").filter((segment) => segment !== "");
}

/** Compare two route segments, ignoring the names of dynamic parameters. */
function compareSegments(left: string, right: string): number {
  const leftIsStatic = !left.includes("[");
  const rightIsStatic = !right.includes("[");
  if (leftIsStatic && rightIsStatic) return left.localeCompare(right);
  if (leftIsStatic !== rightIsStatic) return leftIsStatic ? -1 : 1;
  const fullyDynamic = /^(?:\[[^\]]+\])+$/;
  const leftIsFullyDynamic = fullyDynamic.test(left);
  const rightIsFullyDynamic = fullyDynamic.test(right);
  if (leftIsFullyDynamic !== rightIsFullyDynamic) return leftIsFullyDynamic ? 1 : -1;
  const leftIsSpread = left.includes("[...");
  const rightIsSpread = right.includes("[...");
  if (leftIsSpread !== rightIsSpread) return leftIsSpread ? 1 : -1;
  return 0;
}

/** Group localized routes below their unprefixed or default-locale route. */
function groupLocalizedPages(pages: RouteDisplay[], i18n: I18nInfo | undefined): RouteDisplay[] {
  if (!i18n) return pages;
  const nonDefaultLocales = i18n.locales.filter((locale) => locale !== i18n.defaultLocale);
  // With `prefixDefaultLocale`, the default locale's pages carry a prefix
  // too (`/en/about`); stripping it from the grouping key lands every
  // locale's variant of a page in the same group. Non-default locales come
  // first, mirroring the order in which Astro's own fallback generation
  // lets locales claim a route.
  const keyLocales = i18n.prefixDefaultLocale
    ? [...nonDefaultLocales, i18n.defaultLocale]
    : nonDefaultLocales;
  const groups = Map.groupBy(pages, (route) => {
    const keyLocale = getRouteLocale(route.pattern, keyLocales);
    return keyLocale === undefined ? route.pattern : stripLocale(route.pattern, keyLocale);
  });
  const orderedRoutes: RouteDisplay[] = [];
  for (const key of [...groups.keys()].sort(comparePatterns)) {
    const group = groups.get(key);
    // The head is the route that no non-default locale claims: the
    // unprefixed one, or the default locale's own under `prefixDefaultLocale`.
    const head =
      group?.find((route) => getRouteLocale(route.pattern, nonDefaultLocales) === undefined) ??
      group?.[0];
    if (!group || !head) continue;
    orderedRoutes.push(head);
    for (const route of group) {
      if (route === head) continue;
      route.variantOf = head.pattern;
      orderedRoutes.push(route);
    }
  }
  return orderedRoutes;
}

/** Return the first locale that claims a segment of a route pattern. */
function getRouteLocale(pattern: string, locales: string[]): string | undefined {
  // Locale folders may sit anywhere below src/pages/, so Astro matches
  // locales against every URL segment — `Astro.currentLocale`
  // (computeCurrentLocale), the i18n middleware (pathHasLocale), and
  // fallback generation (createI18nFallbackRoutes) all scan the whole
  // path. To Astro, `/products/ja` is the `ja` variant of `/products`.
  const segments = pattern.split("/");
  return locales.find((locale) => segments.includes(locale));
}

/** Strip the locale segment: `/ja/about` → `/about`; `/ja` → `/`. */
function stripLocale(pattern: string, locale: string): string {
  const segments = pattern.split("/");
  const index = segments.indexOf(locale);
  if (index === -1) return pattern;
  segments.splice(index, 1);
  const stripped = segments.join("/");
  return stripped === "" ? "/" : stripped;
}

/**
 * Insert a display variant for each i18n fallback route, once per URL.
 * Astro generates one fallback route per fallback locale, and several of
 * them can land on the same URL — `fallback: { ja: "en", fr: "en" }` leaves
 * every page with two fallbacks that are both the page's own pattern — so
 * the rows they produce would be identical in every field, down to the
 * regex they match on, and would share a `rowKey`.
 */
function addFallbackRows(routes: RouteDisplay[]): RouteDisplay[] {
  const routesWithFallbacks: RouteDisplay[] = [];
  for (const route of routes) {
    routesWithFallbacks.push(route);
    const fallbackPatterns = new Set<string>();
    for (const fallback of route.fallbackRoutes) {
      if (fallbackPatterns.has(fallback.pattern)) continue;
      fallbackPatterns.add(fallback.pattern);
      routesWithFallbacks.push({
        ...route,
        pattern: fallback.pattern,
        // With `fallbackType: "rewrite"` the browser stays on the fallback
        // URL, so the row needs the fallback's own regex to be marked as
        // the current page. A `redirect` fallback lands on the target
        // route instead, whose own row then matches.
        patternSource: fallback.patternSource,
        type: "fallback",
        // Astro tests a route's fallback patterns while matching that
        // route, so the row keeps its target's position and follows it.
        matchOrder: route.matchOrder,
        // Not linked: the section caption explains where a fallback URL leads.
        pathname: undefined,
        // devframe's MCP serializer prints any re-encountered object
        // reference as "[Circular]", so fields that the spread would share
        // with the parent row are copied here.
        params: [...route.params],
        redirect: route.redirect && { ...route.redirect },
        fallbackRoutes: [],
        variantOf: route.variantOf ?? route.pattern,
        fallbackOf: route.pattern,
        sourceLabel: "",
        sourceIsFile: false,
      });
    }
  }
  return routesWithFallbacks;
}
