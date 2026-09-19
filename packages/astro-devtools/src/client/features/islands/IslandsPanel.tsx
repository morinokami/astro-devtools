import {
  Caption,
  CardTitle,
  DocsLink,
  PanelCard,
  PanelContent,
  PanelViewport,
  RowList,
  StateNote,
  StatusAnnouncer,
} from "@astro-devtools/ui";
import { useEffect } from "preact/hooks";

import type { ProjectContext } from "../../../types.ts";
import type { PanelProps } from "../../platform/panel-shell.ts";
import type { UnloadedServerIsland } from "./server-islands.ts";
import type { IslandInventory } from "./use-island-inventory.ts";

import { openInEditor } from "../../platform/editor.ts";
import { hideHighlight } from "../../platform/overlay.ts";
import { isPageScoped } from "../../platform/page-scope.ts";
import { callRpc } from "../../platform/rpc.ts";
import { countOf } from "../../platform/text.ts";
import { IslandRow } from "./IslandRow.tsx";
import { isAbsolutePath } from "./islands.ts";
import { ServerIslandRow } from "./ServerIslandRow.tsx";
import { useIslandInventory } from "./use-island-inventory.ts";

/**
 * Show client and server islands found in the current page. Client islands
 * come from `astro-island` elements and recorded hydration failures; server
 * islands are reconstructed from swap scripts, preload links, and Resource
 * Timing entries.
 */

const ISLANDS_DOCS_URL = "https://docs.astro.build/en/concepts/islands/";

export function IslandsPanel({ context, refreshKey, active }: PanelProps) {
  const pageScoped = isPageScoped(context);
  const inventory = useIslandInventory(pageScoped, active, refreshKey);

  /** A hidden panel must not leave its page highlight visible. */
  useEffect(() => {
    if (!pageScoped || !active) return;
    return hideHighlight;
  }, [pageScoped, active]);

  const openIsland = async (file: string): Promise<void> => {
    if (file === "") return;
    // `/@fs/` component paths are already absolute.
    let root: string | undefined;
    if (!isAbsolutePath(file)) {
      const projectContext: ProjectContext = await callRpc(
        context,
        "astro-devtools:project:context",
      ).catch(() => ({}));
      root = projectContext.root;
    }
    openInEditor(file, root);
  };

  if (!pageScoped) return <IslandsStandalone />;

  const islands = inventory?.islands ?? [];
  const serverIslands = inventory?.serverIslands ?? [];
  const clientCount = islands.length;
  const serverCount = serverIslands.length;
  const serverIslandsNeedingAttention = serverIslands.filter(
    (island): island is UnloadedServerIsland => island.state !== "loaded",
  );
  const serverLoadedCount = serverCount - serverIslandsNeedingAttention.length;
  return (
    <PanelViewport class="text-sm">
      <PanelContent class="gap-3">
        <StatusAnnouncer>
          {/* Announce nothing until the page has been read: the pre-scan
              commit would otherwise claim an empty page. */}
          {inventory === undefined ? "" : islandsStatus(inventory)}
        </StatusAnnouncer>
        {/* Only render a section when that kind of island exists. */}
        {clientCount === 0 && serverCount === 0 ? (
          <PanelCard>
            <StateNote title="No islands on this page.">
              Did you forget to add a client directive to your interactive UI component?{" "}
              <LearnAboutIslands />
            </StateNote>
          </PanelCard>
        ) : (
          <>
            {clientCount > 0 && (
              <PanelCard>
                <CardTitle>{countOf(clientCount, "client island")} on this page</CardTitle>
                <RowList>
                  {islands.map((island) => (
                    <IslandRow key={island.id} island={island} onOpen={openIsland} />
                  ))}
                </RowList>
              </PanelCard>
            )}
            {serverCount > 0 && (
              <PanelCard>
                <CardTitle>{countOf(serverCount, "server island")} on this page</CardTitle>
                {/* Loaded server islands are summarized; pending and failed islands show details. */}
                {serverIslandsNeedingAttention.length === 0 ? (
                  <Caption data-testid="server-islands-note">All loaded.</Caption>
                ) : (
                  <>
                    <RowList>
                      {serverIslandsNeedingAttention.map((island) => (
                        <ServerIslandRow key={island.id} island={island} />
                      ))}
                    </RowList>
                    {serverLoadedCount > 0 && (
                      <Caption data-testid="server-islands-note" class="mt-3">
                        {serverLoadedCount} more loaded.
                      </Caption>
                    )}
                  </>
                )}
              </PanelCard>
            )}
          </>
        )}
      </PanelContent>
    </PanelViewport>
  );
}

/** Summarize live island changes without announcing every row and badge. */
function islandsStatus({ islands, serverIslands }: IslandInventory): string {
  if (islands.length === 0 && serverIslands.length === 0) {
    return "No islands detected on this page.";
  }
  const messages: string[] = [];
  if (islands.length > 0) {
    const hydratedCount = islands.filter((island) => island.state === "hydrated").length;
    const failedCount = islands.filter((island) => island.state === "failed").length;
    messages.push(`${hydratedCount} of ${countOf(islands.length, "client island")} hydrated.`);
    if (failedCount > 0) messages.push(`${failedCount} failed.`);
  }
  if (serverIslands.length > 0) {
    const loadedCount = serverIslands.filter((island) => island.state === "loaded").length;
    messages.push(`${loadedCount} of ${countOf(serverIslands.length, "server island")} loaded.`);
  }
  return messages.join(" ");
}

/** Explain why page islands are unavailable in the standalone DevTools UI. */
function IslandsStandalone() {
  return (
    <PanelViewport class="text-sm">
      <PanelContent>
        <PanelCard>
          <CardTitle>Islands</CardTitle>
          <StateNote title="Islands are page-scoped.">
            This panel reads the islands of the page it is opened on, so it only works from the dock
            embedded in your site. <LearnAboutIslands />
          </StateNote>
        </PanelCard>
      </PanelContent>
    </PanelViewport>
  );
}

/** Link used by the empty and standalone states. */
function LearnAboutIslands() {
  return <DocsLink href={ISLANDS_DOCS_URL}>Learn about islands</DocsLink>;
}
