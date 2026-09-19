/**
 * Prepare server-island tracking before any panel opens. An early buffered
 * PerformanceObserver keeps its own copy of the island Resource Timing
 * entries, so they survive module-heavy dev pages that overflow the
 * browser's entry buffer — without resizing that buffer, which belongs to
 * the inspected app. A timestamp recorded when a View Transition starts
 * swapping lets the scanner ignore requests from the previous page, and the
 * copy keeps only current-navigation entries so it cannot grow across a
 * long client-routed session.
 *
 * State is stored on `window` because `inject.ts` and `client.ts` are
 * separate bundles with separate module state.
 */

const NAVIGATION_START_KEY = "__astroDevtoolsServerIslandNavigationStart";
const RESOURCE_ENTRIES_KEY = "__astroDevtoolsServerIslandResourceEntries";

interface IslandEntryCollector {
  entries: PerformanceEntry[];
  /** Kept so `takeRecords` can be called; observer callbacks can lag behind request completion. */
  observer: PerformanceObserver;
}

type TrackingHolder = Record<typeof NAVIGATION_START_KEY, number | undefined> &
  Record<typeof RESOURCE_ENTRIES_KEY, IslandEntryCollector | undefined>;

const holder = (): TrackingHolder => window as unknown as TrackingHolder;

/** Start tracking before island requests complete or their entries go stale. */
export function installServerIslandNavigationTracking(): void {
  const collector: IslandEntryCollector = {
    entries: [],
    observer: new PerformanceObserver((list) => {
      collectIslandEntries(collector, list.getEntries());
    }),
  };
  collector.observer.observe({ type: "resource", buffered: true });
  holder()[RESOURCE_ENTRIES_KEY] = collector;
  // The timestamp must be taken before the swap: swapping inserts the next
  // page's island preload links, so their requests start before
  // `astro:after-swap`.
  document.addEventListener("astro:before-swap", () => {
    const navigationStart = performance.now();
    holder()[NAVIGATION_START_KEY] = navigationStart;
    // The scanner never reads entries from before this navigation again.
    collector.entries = collector.entries.filter((entry) => entry.startTime >= navigationStart);
  });
}

/**
 * Keep only current-navigation island requests. Other resources — and the
 * previous page's islands completing after the swap — would grow the copy
 * without ever being read.
 */
function collectIslandEntries(
  collector: IslandEntryCollector,
  batch: readonly PerformanceEntry[],
): void {
  const navigationStart = serverIslandNavigationStart();
  for (const entry of batch) {
    if (entry.startTime >= navigationStart && entry.name.includes("/_server-islands/")) {
      collector.entries.push(entry);
    }
  }
}

/**
 * The island Resource Timing entries observed for the current navigation.
 * Falls back to the browser's own buffer when tracking is not installed.
 */
export function serverIslandResourceEntries(): readonly PerformanceEntry[] {
  const collector = holder()[RESOURCE_ENTRIES_KEY];
  if (collector === undefined) return performance.getEntriesByType("resource");
  return collector.entries;
}

/**
 * Pull completed requests whose observer callback has not run yet into the
 * collector. This is intentionally separate from the snapshot getter so a
 * component can flush in an event or Effect without mutating external state
 * during render.
 */
export function flushServerIslandResourceEntries(): void {
  const collector = holder()[RESOURCE_ENTRIES_KEY];
  if (collector !== undefined) collectIslandEntries(collector, collector.observer.takeRecords());
}

/** The time when the latest View Transition began swapping, or 0 after a full page load. */
export function serverIslandNavigationStart(): number {
  return holder()[NAVIGATION_START_KEY] ?? 0;
}
