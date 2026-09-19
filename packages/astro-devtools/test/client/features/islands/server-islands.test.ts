// @vitest-environment happy-dom

import type { DetachedWindowAPI } from "happy-dom";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import type {
  IslandResourceEntry,
  ServerIslandInfo,
} from "../../../../src/client/features/islands/server-islands.ts";

import { scanServerIslands } from "../../../../src/client/features/islands/server-islands.ts";

beforeAll(() => {
  // Prevent happy-dom from making real requests for preload fixtures.
  const { happyDOM } = window as unknown as { happyDOM: DetachedWindowAPI };
  happyDOM.settings.fetch.interceptor = {
    beforeAsyncRequest: async ({ window }) => new window.Response(),
  };
});

/** Use Astro 7.1.6 swap scripts and fake only the missing Resource Timing data. */

/** URLs resolve against the same base the scanner uses. */
const absoluteUrl = (url: string): string => new URL(url, document.baseURI).href;

let nextIslandId = 0;

function appendSwapScript(content: string): void {
  const script = document.createElement("script");
  script.setAttribute("type", "module");
  script.setAttribute("data-astro-rerun", "");
  script.setAttribute("data-island-id", `host-${nextIslandId++}`);
  script.textContent = content;
  document.body.append(script);
}

function appendGetScript(url: string): void {
  appendSwapScript(
    `const headers = new Headers({});\nlet response = await fetch(${JSON.stringify(url)}, { headers });replaceServerIsland("host", response);`,
  );
}

function appendPostScript(url: string): void {
  appendSwapScript(
    `let data = {\n\tencryptedComponentExport: "AAAA",\n\tencryptedProps: "BBBB",\n\tencryptedSlots: "",\n};\nconst headers = new Headers({ 'Content-Type': 'application/json', ...{} });\nlet response = await fetch(${JSON.stringify(url)}, {\n\tmethod: 'POST',\n\tbody: JSON.stringify(data),\n\theaders,\n});replaceServerIsland("host", response);`,
  );
}

function appendPreloadLink(url: string): void {
  const link = document.createElement("link");
  link.setAttribute("rel", "preload");
  link.setAttribute("as", "fetch");
  link.setAttribute("href", url);
  link.setAttribute("crossorigin", "anonymous");
  document.head.append(link);
}

function resourceEntry(
  url: string,
  options: { startTime?: number; status?: number } = {},
): IslandResourceEntry {
  const resourceTimingEntry: IslandResourceEntry = {
    name: absoluteUrl(url),
    startTime: options.startTime ?? 100,
  };
  if (options.status !== undefined) resourceTimingEntry.responseStatus = options.status;
  return resourceTimingEntry;
}

const scanPageServerIslands = (
  entries: IslandResourceEntry[] = [],
  navigationStartTime = 0,
): ServerIslandInfo[] => scanServerIslands(document, entries, navigationStartTime);

/** Drop the row ids, for assertions that compare islands by name, method and state. */
const serverIslandStates = (entries: IslandResourceEntry[] = [], navigationStartTime = 0) =>
  scanPageServerIslands(entries, navigationStartTime).map((island) =>
    island.state === "failed"
      ? {
          name: island.name,
          method: island.method,
          state: island.state,
          status: island.status,
        }
      : { name: island.name, method: island.method, state: island.state },
  );

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("scanServerIslands", () => {
  const url = "/_server-islands/Avatar?e=AAAA&p=&s=";

  it("reads a pending GET island off its swap script and preload link", () => {
    appendPreloadLink(url);
    appendGetScript(url);

    expect(serverIslandStates()).toEqual([{ name: "Avatar", method: "GET", state: "pending" }]);
  });

  it("shows a GET island pending while its request is still in flight", () => {
    appendPreloadLink(url);

    expect(serverIslandStates()).toEqual([{ name: "Avatar", method: "GET", state: "pending" }]);
  });

  it("marks a GET island loaded once its timing entry exists and its script is gone", () => {
    appendPreloadLink(url);

    expect(serverIslandStates([resourceEntry(url, { status: 200 })])).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
    ]);
  });

  it("marks a GET island failed on a non-200 answer even while its script remains", () => {
    appendPreloadLink(url);
    appendGetScript(url);

    expect(serverIslandStates([resourceEntry(url, { status: 500 })])).toEqual([
      { name: "Avatar", method: "GET", state: "failed", status: 500 },
    ]);
  });

  it("keeps duplicate islands apart through their unique request URLs", () => {
    const first = "/_server-islands/Avatar?e=AAAA&p=&s=";
    const second = "/_server-islands/Avatar?e=ZZZZ&p=&s=";
    appendPreloadLink(first);
    appendPreloadLink(second);
    appendGetScript(second);

    expect(serverIslandStates([resourceEntry(first, { status: 200 })])).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
      { name: "Avatar", method: "GET", state: "pending" },
    ]);
  });

  it("keeps a GET island's identity while its request state changes", () => {
    appendPreloadLink(url);
    appendGetScript(url);
    const pending = scanPageServerIslands()[0];

    document.querySelector("script[data-island-id]")?.remove();
    const loaded = scanPageServerIslands([resourceEntry(url, { status: 200 })])[0];

    expect(loaded?.id).toBe(pending?.id);
  });

  it("counts a nested GET island that no preload link announced", () => {
    // While pending, its swap script is the only trace…
    appendGetScript(url);
    expect(serverIslandStates()).toEqual([{ name: "Avatar", method: "GET", state: "pending" }]);

    // After the swap, the current page's timing entry is enough.
    document.body.replaceChildren();
    expect(serverIslandStates([resourceEntry(url, { status: 200 })])).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
    ]);
  });

  it("ignores old GET entries that are not referenced by the current page", () => {
    expect(serverIslandStates([resourceEntry(url, { startTime: 50, status: 200 })], 80)).toEqual(
      [],
    );
    expect(serverIslandStates([resourceEntry(url, { startTime: 90, status: 200 })], 80)).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
    ]);
  });

  it("shows a GET island pending instead of reusing a pre-navigation result", () => {
    appendPreloadLink(url);

    expect(serverIslandStates([resourceEntry(url, { startTime: 50, status: 500 })], 80)).toEqual([
      { name: "Avatar", method: "GET", state: "pending" },
    ]);
  });

  it("matches GET islands against their newest entry regardless of array order", () => {
    appendPreloadLink(url);
    // A slow pre-navigation request can complete — and so be observed —
    // after the current page's request for the same URL.
    const entries = [
      resourceEntry(url, { startTime: 90, status: 200 }),
      resourceEntry(url, { startTime: 50, status: 500 }),
    ];

    expect(serverIslandStates(entries, 80)).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
    ]);
    // Within one navigation the newest request also wins by start time.
    expect(serverIslandStates(entries, 0)).toEqual([
      { name: "Avatar", method: "GET", state: "loaded" },
    ]);
  });

  it("reads a pending POST island off its swap script", () => {
    appendPostScript("/_server-islands/Cart");

    expect(serverIslandStates()).toEqual([{ name: "Cart", method: "POST", state: "pending" }]);
  });

  it("uses distinct marker identities for duplicate POST islands", () => {
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);
    appendPostScript(cart);

    const pending = scanPageServerIslands();

    expect(new Set(pending.map((island) => island.id)).size).toBe(2);
  });

  it("keeps a POST island's identity when its request fails", () => {
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);
    const pending = scanPageServerIslands()[0];

    const failed = scanPageServerIslands([resourceEntry(cart, { status: 500 })])[0];

    expect(failed?.state).toBe("failed");
    expect(failed?.id).toBe(pending?.id);
  });

  it("does not hand a marker's identity to a failure while another request is in flight", () => {
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);
    appendPostScript(cart);
    const markerIds = scanPageServerIslands().map((island) => island.id);

    // One request failed, the other has not completed. Which marker owns
    // the failure is unknowable, so the failed row must not borrow either
    // marker's identity — the borrowed id would hop to the other marker
    // once the in-flight request settles.
    const partial = scanPageServerIslands([resourceEntry(cart, { status: 500 })]);

    const failed = partial.find((island) => island.state === "failed");
    const stillPending = partial.filter((island) => island.state === "pending");
    expect(failed).toBeDefined();
    expect(markerIds).not.toContain(failed?.id);
    expect(stillPending).toHaveLength(1);
    expect(markerIds).toContain(stillPending[0]?.id);
  });

  it("settles a failure on the surviving marker once the other request succeeds", () => {
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);
    appendPostScript(cart);
    const markerIds = scanPageServerIslands().map((island) => island.id);

    // The successful request swapped its marker away; the failed request's
    // marker survives, so the failure can now claim it.
    document.querySelector("script[data-island-id]")?.remove();
    const settled = scanPageServerIslands([
      resourceEntry(cart, { status: 500, startTime: 100 }),
      resourceEntry(cart, { status: 200, startTime: 101 }),
    ]);

    const failed = settled.find((island) => island.state === "failed");
    expect(failed?.id).toBe(markerIds[1]);
  });

  it("keeps failed rows distinct when their start times coarsen to the same value", () => {
    const cart = "/_server-islands/Cart";

    // No markers remain (the app removed them), and the browser reported
    // both simultaneous requests with an identical start time.
    const failedTwice = scanPageServerIslands([
      resourceEntry(cart, { status: 500, startTime: 100 }),
      resourceEntry(cart, { status: 502, startTime: 100 }),
    ]);

    expect(failedTwice).toHaveLength(2);
    expect(new Set(failedTwice.map((island) => island.id)).size).toBe(2);
  });

  it("marks POST islands loaded by their completed entries", () => {
    expect(serverIslandStates([resourceEntry("/_server-islands/Cart", { status: 200 })])).toEqual([
      { name: "Cart", method: "POST", state: "loaded" },
    ]);
  });

  it("splits mixed POST outcomes into loaded, failed and pending rows", () => {
    // Four islands of one component: two swapped in, one answered 500 (its
    // script stays), one still in flight. The in-flight marker is
    // indistinguishable from a marker that one of the 200 answers left in
    // place, so only one loaded row is certain until that request settles —
    // the marker is never counted as loaded and pending at once.
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);
    appendPostScript(cart);

    expect(
      serverIslandStates([
        resourceEntry(cart, { status: 200 }),
        resourceEntry(cart, { status: 200 }),
        resourceEntry(cart, { status: 500 }),
      ]),
    ).toEqual([
      { name: "Cart", method: "POST", state: "loaded" },
      { name: "Cart", method: "POST", state: "failed", status: 500 },
      { name: "Cart", method: "POST", state: "pending" },
    ]);
  });

  it("counts every swapped POST island once the in-flight requests settle", () => {
    // The same four islands after the last request succeeded and swapped
    // its marker away: the failure's marker is the only one left.
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);

    expect(
      serverIslandStates([
        resourceEntry(cart, { status: 200 }),
        resourceEntry(cart, { status: 200 }),
        resourceEntry(cart, { status: 500 }),
        resourceEntry(cart, { status: 200 }),
      ]),
    ).toEqual([
      { name: "Cart", method: "POST", state: "loaded" },
      { name: "Cart", method: "POST", state: "loaded" },
      { name: "Cart", method: "POST", state: "loaded" },
      { name: "Cart", method: "POST", state: "failed", status: 500 },
    ]);
  });

  it("ignores POST entries from before the latest navigation", () => {
    expect(
      serverIslandStates(
        [resourceEntry("/_server-islands/Cart", { startTime: 10, status: 200 })],
        50,
      ),
    ).toEqual([]);
  });

  it("never double-counts a POST island whose 200 answer left its marker in place", () => {
    // Astro swaps a 200 answer only when its content type is text/html, and
    // the swap runs after the Resource Timing entry lands — so a 200 entry
    // next to a remaining marker is one island, not a loaded one plus a
    // pending one. As for GET, the marker decides.
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);

    expect(serverIslandStates([resourceEntry(cart, { status: 200 })])).toEqual([
      { name: "Cart", method: "POST", state: "pending" },
    ]);

    // Once the marker is gone, the same entry is the loaded island.
    document.querySelector("script[data-island-id]")?.remove();
    expect(serverIslandStates([resourceEntry(cart, { status: 200 })])).toEqual([
      { name: "Cart", method: "POST", state: "loaded" },
    ]);
  });

  it("never double-counts a POST island when the browser hides response statuses", () => {
    // A failed island: its request completed (status unreadable) and its
    // script remains. Without a status, report one pending row rather than
    // both a loaded row and a pending row.
    const cart = "/_server-islands/Cart";
    appendPostScript(cart);

    expect(serverIslandStates([resourceEntry(cart)])).toEqual([
      { name: "Cart", method: "POST", state: "pending" },
    ]);
  });

  it("lists GET islands first, in preload-link order", () => {
    appendPreloadLink("/_server-islands/First?e=AAAA&p=&s=");
    appendPreloadLink("/_server-islands/Second?e=BBBB&p=&s=");
    appendPostScript("/_server-islands/Third");

    expect(scanPageServerIslands().map((island) => island.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("parses the name through a base prefix and a trailing slash", () => {
    appendPreloadLink("/docs/_server-islands/Avatar/?e=AAAA&p=&s=");

    expect(serverIslandStates()).toEqual([{ name: "Avatar", method: "GET", state: "pending" }]);
  });

  it("ignores scripts, links and entries that are not server islands", () => {
    // Some other library's script happens to use the same attribute.
    appendSwapScript(`console.log("not an island");`);
    const link = document.createElement("link");
    link.setAttribute("rel", "preload");
    link.setAttribute("as", "fetch");
    link.setAttribute("href", "/api/data.json");
    document.head.append(link);

    expect(serverIslandStates([resourceEntry("/api/data.json", { status: 200 })])).toEqual([]);
  });
});
