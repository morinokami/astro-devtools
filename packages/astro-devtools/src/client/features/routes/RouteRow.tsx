import type { BadgeTone } from "@astro-devtools/ui";

import { Badge, Caption, ExternalLink, Row, SourceLink } from "@astro-devtools/ui";
import { cn } from "cn";

import type { RouteDelivery, RouteDisplay } from "../../../types.ts";
import type { RouteUrlContext } from "../../platform/route-url.ts";

import { openInEditor } from "../../platform/editor.ts";
import { toRouteHref } from "../../platform/route-url.ts";

const DELIVERY_BADGES: Record<RouteDelivery, { label: string; tone: BadgeTone }> = {
  static: { label: "static", tone: "green" },
  server: { label: "server", tone: "blue" },
  "dev-only": { label: "dev only", tone: "gray" },
  "needs-adapter": { label: "needs adapter", tone: "yellow" },
};

/** Show a route's pattern, production delivery mode, and source. */
export function RouteRow({
  route,
  isCurrent,
  root,
  urlContext,
}: {
  route: RouteDisplay;
  isCurrent: boolean;
  /** Absolute project root, for resolving editor links. */
  root: string | undefined;
  /** Resolved `base` and `trailingSlash`, for building route links. */
  urlContext: RouteUrlContext;
}) {
  // Used by the end-to-end route inventory test.
  const patternText = (
    <span data-testid="route-pattern" class="truncate font-mono">
      {route.pattern}
    </span>
  );
  // Only user-facing routes with a concrete URL are worth opening.
  const linkable = route.section !== "internal" && route.pathname !== undefined;
  const pattern = linkable ? (
    <ExternalLink
      href={toRouteHref(route.pathname ?? "/", route.type, urlContext)}
      class="border-b border-dashed border-transparent text-inherit no-underline hover:border-muted"
    >
      {patternText}
    </ExternalLink>
  ) : (
    patternText
  );
  // The locale is already visible in the route pattern.
  const fallbackBadge =
    route.type === "fallback" && route.fallbackOf === undefined ? (
      <Badge tone="gray">fallback</Badge>
    ) : null;
  const currentBadge = isCurrent ? <Badge tone="purple">current page</Badge> : null;

  const delivery =
    route.fallbackOf === undefined ? (
      <Badge tone={DELIVERY_BADGES[route.delivery].tone}>
        {DELIVERY_BADGES[route.delivery].label}
      </Badge>
    ) : (
      <Badge tone="gray">fallback</Badge>
    );

  return (
    <Row
      data-testid="route-row"
      class={cn(
        "grid grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1.3fr)] items-center gap-3 px-2 py-1.75 text-[13px]",
        "@max-[620px]/panel:grid-cols-[minmax(0,1fr)_auto] @max-[620px]/panel:gap-y-1.5 @max-[420px]/panel:grid-cols-1",
        isCurrent && "rounded-xs bg-accent/12 shadow-[inset_2px_0_0_var(--color-lavender)]",
      )}
      aria-current={isCurrent ? "page" : undefined}
    >
      {/* Keep delivery and source columns aligned for grouped route variants. */}
      <span
        class={cn(
          "flex min-w-0 items-center gap-2 text-bright",
          route.variantOf !== undefined && "pl-5 @max-[420px]/panel:pl-3",
        )}
      >
        {pattern}
        {fallbackBadge}
        {currentBadge}
      </span>
      <span class="flex">{delivery}</span>
      <span class="flex min-w-0 items-center gap-2 @max-[620px]/panel:col-span-full">
        <SourceCell route={route} root={root} />
      </span>
    </Row>
  );
}

/** The source cell: where a route comes from, or where a redirect goes. */
function SourceCell({ route, root }: { route: RouteDisplay; root: string | undefined }) {
  // The section caption explains generated fallback rows and their target.
  if (route.fallbackOf !== undefined) return null;
  if (route.redirect) {
    const status = route.redirect.status ?? 301;
    return (
      <>
        <Badge tone="gray">{String(status)}</Badge>
        <span class="truncate font-mono">→ {route.redirect.destination}</span>
      </>
    );
  }
  if (route.sourceIsFile) {
    return (
      <SourceLink
        class="block max-w-full truncate font-mono"
        title={route.entrypoint}
        onClick={() => openInEditor(route.entrypoint, root)}
      >
        {route.sourceLabel}
      </SourceLink>
    );
  }
  return (
    <Caption as="span" class="truncate" title={route.entrypoint}>
      {route.sourceLabel}
    </Caption>
  );
}
