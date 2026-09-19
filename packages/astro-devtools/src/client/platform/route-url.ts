/**
 * Translate between browser URLs and Astro route pathnames. Route patterns
 * and `pathname` values never include the configured `base`, and links must
 * follow the `trailingSlash` rule, so both directions need the resolved
 * config values.
 */

import type { RouteInfo } from "../../types.ts";

/** URL settings needed to translate a route pathname into a browser URL. */
export interface RouteUrlContext {
  /** Resolved `base` of the site, e.g. `/` or `/docs`. */
  base?: string;
  /** Resolved `trailingSlash` mode (`always`, `never`, `ignore`). */
  trailingSlash?: "always" | "never" | "ignore";
}

/** `base` without its trailing slash, or `""` for the default root base. */
function basePrefix(base: string | undefined): string {
  return (base ?? "/").replace(/\/+$/, "");
}

/**
 * Normalize a browser pathname the way the Astro dev server does before
 * matching (strip `base`, keep the leading slash, decode escapes), so it
 * can be tested against route regexes. For example, `/docs/about` becomes
 * `/about`.
 */
export function toRoutePathname(browserPathname: string, base: string | undefined): string {
  const prefix = basePrefix(base);
  let pathname = browserPathname;
  if (prefix !== "") {
    if (pathname === prefix || pathname === `${prefix}/`) {
      pathname = "/";
    } else if (pathname.startsWith(`${prefix}/`)) {
      pathname = pathname.slice(prefix.length);
    }
  }
  try {
    return decodeURI(pathname);
  } catch {
    // Astro also matches the raw pathname when it cannot be decoded.
    return pathname;
  }
}

/** Astro's own file-extension probe (`hasFileExtension` in internal-helpers). */
const FILE_EXTENSION = /\/[^/]+\.\w+$/;

/**
 * Build the browser URL that serves a route's concrete `pathname`, with
 * `base` restored and the same trailing-slash rule that Astro's route
 * patterns are built with. For example, `/about` becomes `/docs/about/`.
 */
export function toRouteHref(
  routePathname: string,
  routeType: RouteInfo["type"],
  context: RouteUrlContext,
): string {
  if (routePathname === "/") {
    // The dev server accepts the site root only at the resolved `base`,
    // written exactly as configured: under `trailingSlash: "ignore"`, a
    // base authored with a trailing slash requires that slash, so it must
    // not be stripped here.
    const root = context.base || "/";
    if (context.trailingSlash === "always" && !root.endsWith("/")) return `${root}/`;
    return root;
  }
  const pathname = `${basePrefix(context.base)}${routePathname}`;
  // Astro exempts only endpoints with a file extension from the rule; a page
  // URL that looks like a file (e.g. `/feed.xml`) still takes the slash.
  const fileEndpoint = routeType === "endpoint" && FILE_EXTENSION.test(pathname);
  if (context.trailingSlash === "always" && !fileEndpoint) {
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
  }
  return pathname;
}
