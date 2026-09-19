import {
  Caption,
  Chip,
  PanelContent,
  PanelViewport,
  RequestNotes,
  StatusAnnouncer,
  TextInput,
} from "@astro-devtools/ui";
import { useState } from "preact/hooks";

import type { RouteSection } from "../../../types.ts";
import type { PanelProps } from "../../platform/panel-shell.ts";

import { useRerenderOnPageChange, useRpcData } from "../../platform/hooks.ts";
import { isPageScoped } from "../../platform/page-scope.ts";
import { countOf } from "../../platform/text.ts";
import { buildSectionViews, currentRowKey, SECTIONS, sectionCounts } from "./routes-view.ts";
import { RouteSectionCard } from "./RouteSectionCard.tsx";

/** Show project routes, their production delivery mode, and their source. */

export function RoutesPanel({ context, refreshKey, active }: PanelProps) {
  const pageScoped = isPageScoped(context);
  const routesState = useRpcData(context, refreshKey, "astro-devtools:routes:list");
  const routesInfo = routesState.data;
  // Re-render after Astro client navigation so the current-page row moves
  // with the page.
  useRerenderOnPageChange(pageScoped && active);
  const [selectedSection, setSelectedSection] = useState<"all" | RouteSection>("all");
  const [filterText, setFilterText] = useState("");
  const [internalExpanded, setInternalExpanded] = useState(false);

  const normalizedFilter = filterText.trim().toLowerCase();
  const counts = sectionCounts(routesInfo?.routes ?? []);
  const totalCount = counts.values().reduce((total, count) => total + count, 0);

  // A refresh can remove the last route from the selected section, and with
  // it the section's chip. The view falls back to "all" while the stored
  // choice has nothing to select — and restores the choice if the section's
  // routes come back during the same edit session.
  const activeSection =
    selectedSection === "all" || (counts.get(selectedSection) ?? 0) > 0 ? selectedSection : "all";

  const sectionViews =
    routesInfo === undefined ? [] : buildSectionViews(routesInfo, activeSection, normalizedFilter);
  // A collapsed section renders no rows, so its rows must not be counted as
  // shown.
  const visibleRouteCount = sectionViews.reduce(
    (total, view) => total + (view.id === "internal" && !internalExpanded ? 0 : view.rows.length),
    0,
  );
  const currentKey =
    pageScoped && routesInfo !== undefined
      ? currentRowKey(routesInfo, location.pathname)
      : undefined;

  const selectSection = (nextSection: "all" | RouteSection): void => {
    setSelectedSection(nextSection);
    // Filtering down to Internal is an explicit request to see it.
    if (nextSection === "internal") setInternalExpanded(true);
  };

  const updateFilter = (value: string): void => {
    // Starting a search is the same kind of request: a match inside the
    // collapsed Internal section has to become reachable rather than be
    // counted as hidden. Only the transition from empty to non-empty
    // expands the section, so it can still be collapsed again while the
    // search stays active.
    if (normalizedFilter === "" && value.trim() !== "") setInternalExpanded(true);
    setFilterText(value);
  };

  const chipOptions: { id: "all" | RouteSection; label: string; count: number }[] = [
    { id: "all", label: "All", count: totalCount },
    ...SECTIONS.map((section) => ({
      id: section.id,
      label: section.title,
      count: counts.get(section.id) ?? 0,
    })),
  ];
  // Empty sections have no chip.
  const visibleChips = chipOptions.filter((option) => option.id === "all" || option.count > 0);

  const hasRoutes = (routesInfo?.routes.length ?? 0) > 0;
  const statusSection =
    activeSection === "all"
      ? ""
      : ` in ${SECTIONS.find((section) => section.id === activeSection)?.title ?? activeSection}`;
  const statusFilter = normalizedFilter === "" ? "" : " for the current filter";
  // The announcement says "shown" rather than "match": a section the user
  // collapsed again keeps its rows out of the count, and "shown" stays
  // accurate in that case while "match" would not.
  const routeStatus =
    routesInfo === undefined
      ? ""
      : !hasRoutes
        ? "No routes have been resolved yet."
        : `${countOf(visibleRouteCount, "route")} shown${statusSection}${statusFilter}.`;

  return (
    <PanelViewport class="text-sm">
      <PanelContent class="gap-4">
        <StatusAnnouncer>{routeStatus}</StatusAnnouncer>
        <RequestNotes state={routesState} label="routes" />
        {hasRoutes && (
          <div class="flex flex-wrap items-center gap-2">
            <span
              role="group"
              aria-label="Route type filter"
              class="flex flex-wrap items-center gap-1"
            >
              {visibleChips.map((option) => (
                <Chip
                  key={option.id}
                  pressed={activeSection === option.id}
                  onClick={() => selectSection(option.id)}
                >
                  {option.label} {option.count}
                </Chip>
              ))}
            </span>
            <TextInput
              type="search"
              // The box of the chips it shares the row with.
              size="sm"
              aria-label="Filter routes"
              aria-controls="route-results"
              placeholder="Filter routes…"
              class="ml-auto min-w-35 @max-[420px]/panel:ml-0 @max-[420px]/panel:w-full"
              value={filterText}
              onInput={(event) => updateFilter(event.currentTarget.value)}
            />
          </div>
        )}
        <div id="route-results" class="flex flex-col gap-3">
          {routesInfo !== undefined && !hasRoutes && (
            <Caption class="py-2">No routes have been resolved yet.</Caption>
          )}
          {hasRoutes && sectionViews.length === 0 && (
            <Caption class="py-2">No routes match the current filter.</Caption>
          )}
          {routesInfo !== undefined &&
            sectionViews.map((view) => (
              <RouteSectionCard
                key={view.id}
                title={view.title}
                count={view.count}
                caption={view.caption}
                routes={view.rows}
                currentKey={currentKey}
                root={routesInfo.context.root}
                urlContext={routesInfo.context}
                collapsible={
                  view.id === "internal"
                    ? {
                        collapsed: !internalExpanded,
                        rowsId: "section-internal-rows",
                        onToggle: () => setInternalExpanded((expanded) => !expanded),
                      }
                    : undefined
                }
              />
            ))}
        </div>
      </PanelContent>
    </PanelViewport>
  );
}
