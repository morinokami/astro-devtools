import { Caption, CardTitle, DisclosureButton, PanelCard, RowList } from "@astro-devtools/ui";

import type { RouteDisplay } from "../../../types.ts";
import type { RouteUrlContext } from "../../platform/route-url.ts";

import { RouteRow } from "./RouteRow.tsx";
import { rowKey } from "./routes-view.ts";

/** Render one route section, optionally with a collapse control. */
export function RouteSectionCard({
  title,
  count,
  caption,
  routes,
  currentKey,
  root,
  urlContext,
  collapsible,
}: {
  title: string;
  count: number;
  /** One-line behavior note under the title; hidden while collapsed. */
  caption?: string;
  /** Section rows in display order, including localized and fallback variants. */
  routes: RouteDisplay[];
  /** `rowKey` of the row that serves the current page, when one does. */
  currentKey?: string;
  /** Absolute project root, for resolving editor links. */
  root: string | undefined;
  /** Resolved `base` and `trailingSlash`, for building route links. */
  urlContext: RouteUrlContext;
  /** Collapse wiring; only the Internal section provides it. */
  collapsible?: { collapsed: boolean; rowsId: string; onToggle: () => void };
}) {
  const collapsed = collapsible?.collapsed ?? false;
  const heading = `${title} (${count})`;
  return (
    <PanelCard>
      {collapsible ? (
        <CardTitle>
          <DisclosureButton
            expanded={!collapsed}
            controls={collapsible.rowsId}
            marker="end"
            class="border-0 bg-transparent p-0 text-inherit"
            onClick={collapsible.onToggle}
          >
            <span>{heading}</span>
          </DisclosureButton>
        </CardTitle>
      ) : (
        <CardTitle>{heading}</CardTitle>
      )}
      {caption !== undefined && !collapsed && <Caption class="mb-3">{caption}</Caption>}
      {!collapsed && (
        <RowList id={collapsible?.rowsId}>
          {routes.map((route) => (
            <RouteRow
              key={rowKey(route)}
              route={route}
              isCurrent={rowKey(route) === currentKey}
              root={root}
              urlContext={urlContext}
            />
          ))}
        </RowList>
      )}
    </PanelCard>
  );
}
