// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  flushServerIslandResourceEntries,
  installServerIslandNavigationTracking,
  serverIslandNavigationStart,
  serverIslandResourceEntries,
} from "../../../../src/client/features/islands/server-island-navigation.ts";

/** The `window` keys the tracking shares between the inject and client bundles. */
const WINDOW_KEYS = [
  "__astroDevtoolsServerIslandNavigationStart",
  "__astroDevtoolsServerIslandResourceEntries",
];

interface FakeEntry {
  name: string;
  startTime: number;
}

/** happy-dom has no PerformanceObserver, so the tests drive a fake one. */
class FakePerformanceObserver {
  static latest: FakePerformanceObserver | undefined;
  static observeOptions: PerformanceObserverInit | undefined;
  /** Entries completed but not yet delivered through the callback. */
  pending: FakeEntry[] = [];

  constructor(private readonly callback: (list: { getEntries: () => FakeEntry[] }) => void) {
    FakePerformanceObserver.latest = this;
  }

  observe(options: PerformanceObserverInit): void {
    FakePerformanceObserver.observeOptions = options;
  }

  takeRecords(): FakeEntry[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }

  disconnect(): void {}

  deliver(entries: FakeEntry[]): void {
    this.callback({ getEntries: () => entries });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of WINDOW_KEYS) Reflect.deleteProperty(window, key);
  Reflect.deleteProperty(performance, "setResourceTimingBufferSize");
  FakePerformanceObserver.latest = undefined;
  FakePerformanceObserver.observeOptions = undefined;
});

function install(): FakePerformanceObserver {
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
  installServerIslandNavigationTracking();
  const observer = FakePerformanceObserver.latest;
  if (observer === undefined) throw new Error("tracking installed no observer");
  return observer;
}

describe("installServerIslandNavigationTracking", () => {
  it("observes resources with the buffered flag instead of resizing the buffer", () => {
    const bufferSpy = vi.fn();
    performance.setResourceTimingBufferSize = bufferSpy;

    install();

    expect(FakePerformanceObserver.observeOptions).toEqual({ type: "resource", buffered: true });
    expect(bufferSpy).not.toHaveBeenCalled();
  });

  it("records the navigation time when a View Transition starts swapping", () => {
    install();

    expect(serverIslandNavigationStart()).toBe(0);

    document.dispatchEvent(new Event("astro:before-swap"));

    expect(serverIslandNavigationStart()).toBeGreaterThan(0);
  });
});

describe("serverIslandResourceEntries", () => {
  it("keeps only island entries from observer callbacks", () => {
    const observer = install();

    observer.deliver([
      { name: "https://example.test/_astro/index.css", startTime: 1 },
      { name: "https://example.test/_server-islands/Avatar?e=A&p=B", startTime: 2 },
    ]);
    observer.deliver([{ name: "https://example.test/_server-islands/Cart", startTime: 3 }]);

    expect(serverIslandResourceEntries().map((entry) => entry.startTime)).toEqual([2, 3]);
  });

  it("drains undelivered entries only when explicitly flushed outside render", () => {
    const observer = install();
    observer.pending = [
      { name: "https://example.test/_server-islands/Avatar?e=A", startTime: 5 },
      { name: "https://example.test/tracker.js", startTime: 6 },
    ];

    expect(serverIslandResourceEntries()).toEqual([]);

    flushServerIslandResourceEntries();

    expect(serverIslandResourceEntries().map((entry) => entry.startTime)).toEqual([5]);
    // Drained once; a second read must not duplicate the entry.
    expect(serverIslandResourceEntries()).toHaveLength(1);
  });

  it("prunes the previous navigation but keeps preloads started during the swap", () => {
    const observer = install();
    observer.deliver([{ name: "https://example.test/_server-islands/Avatar?e=A", startTime: 1 }]);

    expect(serverIslandResourceEntries()).toHaveLength(1);

    // A View Transition: the navigation start (the boundary) is recorded,
    // then the swap inserts the next page's preload links — their requests
    // start before `astro:after-swap`.
    document.dispatchEvent(new Event("astro:before-swap"));
    const boundary = serverIslandNavigationStart();
    const preloadName = "https://example.test/_server-islands/Avatar?e=B";
    const preloadStart = boundary + 0.1;
    document.dispatchEvent(new Event("astro:after-swap"));

    expect(serverIslandResourceEntries()).toHaveLength(0);

    // Entries surface only later: the preload, and a previous-page island
    // that was still in flight when the swap began.
    observer.deliver([
      { name: preloadName, startTime: preloadStart },
      { name: "https://example.test/_server-islands/Cart?e=C", startTime: boundary - 1 },
    ]);

    expect(serverIslandResourceEntries().map((entry) => entry.name)).toEqual([preloadName]);
  });

  it("falls back to the browser's buffer when tracking is not installed", () => {
    expect(serverIslandResourceEntries()).toEqual(performance.getEntriesByType("resource"));
  });
});
