/**
 * Keep a snapshot of the current page's client and server islands while the
 * owning panel is active. Each active panel owns its own page watchers — at
 * most one panel is active per dock, so the page is not scanned twice in
 * practice. Returns `undefined` until the first scan, so a live region
 * never announces an empty page that was simply not read yet. A
 * deactivated panel keeps its last snapshot — the pre-paint rescan on
 * reactivation replaces it before anyone can see it age.
 */

import { useLayoutEffect, useState } from "preact/hooks";

import type { IslandInfo } from "./islands.ts";
import type { ServerIslandInfo } from "./server-islands.ts";

import { onAstroPageChange } from "../../platform/page-events.ts";
import { scanIslands } from "./islands.ts";
import { flushServerIslandResourceEntries } from "./server-island-navigation.ts";
import {
  isServerIslandUrl,
  scanServerIslandsLive,
  SERVER_ISLAND_SCRIPT_SELECTOR,
} from "./server-islands.ts";

/** One immutable inventory snapshot produced outside component render. */
export interface IslandInventory {
  pathname: string;
  islands: readonly IslandInfo[];
  serverIslands: readonly ServerIslandInfo[];
}

export function useIslandInventory(
  pageScoped: boolean,
  active: boolean,
  refreshKey: number,
): IslandInventory | undefined {
  const [inventory, setInventory] = useState<IslandInventory>();

  // A layout effect, so the activation scan fills the snapshot before paint;
  // refreshKey re-runs it whenever dock activation increments it. Scans run
  // from the effect rather than render, because flushing pending
  // PerformanceObserver records mutates shared state.
  useLayoutEffect(() => {
    if (!pageScoped || !active) return;

    let rescanScheduled = false;
    const rescan = (): void => {
      rescanScheduled = false;
      // A DOM mutation can arrive before the early resource observer's callback.
      flushServerIslandResourceEntries();
      setInventory({
        pathname: location.pathname,
        islands: scanIslands(document),
        serverIslands: scanServerIslandsLive(),
      });
    };
    /** Coalesce a burst of change notifications into a single scan. */
    const scheduleRescan = (): void => {
      if (rescanScheduled) return;
      rescanScheduled = true;
      queueMicrotask(() => {
        if (rescanScheduled) rescan();
      });
    };

    rescan();
    const stopPageChangeListener = onAstroPageChange(scheduleRescan);
    // A hydration failure can leave the DOM untouched. The early injected
    // listener records it; scan in a microtask after event delivery finishes.
    document.addEventListener("astro:hydration-error", scheduleRescan, true);

    // `astro:hydrate` does not bubble, so hydration is detected when an
    // astro-island loses its `ssr` attribute. Dynamically mounted or removed
    // islands and server-island swap scripts appear as child-list mutations.
    // The observer must watch `documentElement`, not `body`: a view
    // transition replaces the body element, which would strand a body-bound
    // observer on a detached node.
    const observer = new MutationObserver((records) => {
      const touchedIsland = records.some((record) =>
        record.type === "attributes"
          ? record.target instanceof Element && record.target.localName === "astro-island"
          : touchesIslandMarkup(record),
      );
      if (touchedIsland) scheduleRescan();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["ssr"],
      childList: true,
    });

    // Failed server-island requests do not change the DOM. Resource Timing
    // entries trigger a scan so those failures become visible.
    const resourceObserver = new PerformanceObserver((list) => {
      if (list.getEntries().some((entry) => isServerIslandUrl(entry.name))) scheduleRescan();
    });
    resourceObserver.observe({ type: "resource" });

    return () => {
      // A scheduled microtask must not scan for a deactivated panel.
      rescanScheduled = false;
      stopPageChangeListener();
      document.removeEventListener("astro:hydration-error", scheduleRescan, true);
      observer.disconnect();
      resourceObserver.disconnect();
    };
  }, [pageScoped, active, refreshKey]);

  return inventory;
}

const ISLAND_MARKUP_SELECTOR = `astro-island, ${SERVER_ISLAND_SCRIPT_SELECTOR}`;

/** A childList record whose added or removed subtrees contain island markup. */
function touchesIslandMarkup(record: MutationRecord): boolean {
  for (const nodes of [record.addedNodes, record.removedNodes]) {
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(ISLAND_MARKUP_SELECTOR)) return true;
      if (node.querySelector(ISLAND_MARKUP_SELECTOR) !== null) return true;
    }
  }
  return false;
}
