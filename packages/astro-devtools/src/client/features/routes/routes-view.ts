/**
 * Pure view-model helpers for the Routes panel: section definitions and
 * counts, variant grouping, filtering, and current-page matching. The panel
 * derives everything it renders from `RoutesInfo` through these functions.
 */

import type { RouteDisplay, RoutesContext, RouteSection, RoutesInfo } from "../../../types.ts";

import { matchRoute } from "../../platform/match.ts";
import { toRoutePathname } from "../../platform/route-url.ts";

/** Sections in display order. */
export const SECTIONS: { id: RouteSection; title: string }[] = [
  { id: "pages", title: "Pages" },
  { id: "endpoints", title: "Endpoints" },
  { id: "redirects", title: "Redirects" },
  { id: "integrations", title: "Integrations" },
  { id: "internal", title: "Internal" },
];

/** One route section prepared for rendering. */
interface RouteSectionView {
  id: RouteSection;
  title: string;
  /** Primary-route count for the title; generated i18n fallback rows are not counted. */
  count: number;
  /** One-line behavior note under the title. */
  caption: string | undefined;
  /** Rows in display order: each primary route followed by its variants. */
  rows: RouteDisplay[];
}

/** Build the sections visible for the active section chip and filter text. */
export function buildSectionViews(
  routesInfo: RoutesInfo,
  activeSection: "all" | RouteSection,
  normalizedFilter: string,
): RouteSectionView[] {
  const views: RouteSectionView[] = [];
  for (const section of SECTIONS) {
    if (activeSection !== "all" && activeSection !== section.id) continue;
    const sectionRoutes = routesInfo.routes.filter((route) => route.section === section.id);
    if (sectionRoutes.length === 0) continue;
    // Keep a primary route together with its localized and fallback variants.
    const groups = groupRouteVariants(sectionRoutes).filter(
      (group) =>
        normalizedFilter === "" ||
        [group.primaryRoute, ...group.variants].some((route) =>
          routeMatchesFilter(route, normalizedFilter),
        ),
    );
    if (groups.length === 0) continue;
    views.push({
      id: section.id,
      title: section.title,
      count: sectionRoutes.filter((route) => route.fallbackOf === undefined).length,
      caption: sectionCaption(section.id, sectionRoutes, routesInfo.context),
      rows: groups.flatMap((group) => [group.primaryRoute, ...group.variants]),
    });
  }
  return views;
}

/** Primary-route counts per section, for the filter chips. */
export function sectionCounts(routes: readonly RouteDisplay[]): Map<RouteSection, number> {
  const counts = new Map<RouteSection, number>();
  for (const route of routes) {
    if (route.fallbackOf !== undefined) continue;
    counts.set(route.section, (counts.get(route.section) ?? 0) + 1);
  }
  return counts;
}

/** Match the filter text against a route's pattern, source, and redirect target. */
function routeMatchesFilter(route: RouteDisplay, normalizedFilter: string): boolean {
  const searchableText =
    `${route.pattern} ${route.sourceLabel} ${route.redirect?.destination ?? ""}`.toLowerCase();
  return searchableText.includes(normalizedFilter);
}

/** Explain redirects and generated i18n fallback rows once per section. */
function sectionCaption(
  section: RouteSection,
  sectionRoutes: readonly RouteDisplay[],
  context: RoutesContext,
): string | undefined {
  if (section === "redirects") {
    return "Served on demand as real 3xx responses; prerendered redirects build meta-refresh pages instead.";
  }
  if (!sectionRoutes.some((route) => route.fallbackOf !== undefined)) return undefined;
  return context.i18n?.fallbackType === "rewrite"
    ? "i18n fallback routes render the route they are listed under in place (rewrite)."
    : "i18n fallback routes redirect to the route they are listed under.";
}

/** The `rowKey` of the route that serves `browserPathname`, when one does. */
export function currentRowKey(routesInfo: RoutesInfo, browserPathname: string): string | undefined {
  // Match in Astro's route-matching order, which differs from display
  // order. The sort is stable, so a fallback row stays right behind the
  // route it is attached to, where Astro tests its pattern too.
  const byMatchOrder = routesInfo.routes.toSorted(
    (leftRoute, rightRoute) => leftRoute.matchOrder - rightRoute.matchOrder,
  );
  // Route regexes never include `base`, so strip it the way the dev server does.
  const current = matchRoute(
    byMatchOrder,
    toRoutePathname(browserPathname, routesInfo.context.base),
  );
  return current === undefined ? undefined : rowKey(current);
}

interface RouteVariantGroup {
  primaryRoute: RouteDisplay;
  variants: RouteDisplay[];
}

/** Group localized and fallback variants with their primary route. */
function groupRouteVariants(rows: RouteDisplay[]): RouteVariantGroup[] {
  const groups: RouteVariantGroup[] = [];
  const groupsByPattern = new Map<string, RouteVariantGroup>();
  for (const row of rows) {
    const parentGroup = row.variantOf ? groupsByPattern.get(row.variantOf) : undefined;
    if (parentGroup) {
      parentGroup.variants.push(row);
      continue;
    }
    const group = { primaryRoute: row, variants: [] };
    groups.push(group);
    groupsByPattern.set(row.pattern, group);
  }
  return groups;
}

/**
 * Create a stable key that also distinguishes generated i18n fallback rows.
 * A pattern is not an identity on its own: Astro's own fallback routes repeat
 * the pattern of the route they fall back to (`prefixDefaultLocale` with
 * `redirectToDefaultLocale` gives `/` a second `/` route), so the position in
 * the matching order joins the key. Every part is data the row already
 * carries, so a key survives a refresh.
 */
export function rowKey(route: RouteDisplay): string {
  return JSON.stringify([route.section, route.fallbackOf ?? "", route.pattern, route.matchOrder]);
}
