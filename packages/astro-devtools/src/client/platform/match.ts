/**
 * Client-side route matching: which of Astro's routes serves a pathname
 * (the browser URL without `base`, as route patterns never include it),
 * so a panel can point out the current page's route. Routes carry the
 * source of their matching regex (`patternSource`) rather than the
 * `RegExp` itself, which would not survive the RPC's JSON serialization,
 * so each pattern is rebuilt here.
 */

/** Route fields needed for URL matching. */
interface Matchable {
  patternSource: string;
}

/**
 * Find the route that serves `pathname`. The list arrives in Astro's
 * route-matching order, so the first regex match is the route that the
 * server would pick.
 */
export function matchRoute<Route extends Matchable>(
  routes: Route[],
  pathname: string,
): Route | undefined {
  for (const route of routes) {
    // `new RegExp(undefined)` matches every string, so reject missing patterns.
    if (typeof route.patternSource !== "string" || route.patternSource === "") {
      continue;
    }
    try {
      if (new RegExp(route.patternSource).test(pathname)) return route;
    } catch {
      // Ignore an invalid pattern and try the remaining routes.
    }
  }
  return undefined;
}
