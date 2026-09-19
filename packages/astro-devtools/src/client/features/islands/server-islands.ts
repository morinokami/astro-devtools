/**
 * Reconstruct server islands from their swap scripts, preload links, and
 * Resource Timing entries. Astro removes its DOM markers after a successful swap.
 */

import { stableElementId } from "../../platform/element-identity.ts";
import {
  serverIslandNavigationStart,
  serverIslandResourceEntries,
} from "./server-island-navigation.ts";

type ServerIslandMethod = "GET" | "POST";

/** The fields every server island carries, whatever its state. */
interface ServerIslandIdentity {
  /** Stable identity of this island across repeated page scans. */
  id: string;
  name: string;
  method: ServerIslandMethod;
}

/**
 * A server island that the panel gives a row of its own: one still in
 * flight, or one whose request failed. Loaded islands are summarized by a
 * count instead, so no row ever renders one.
 */
export type UnloadedServerIsland =
  | (ServerIslandIdentity & { state: "pending" })
  | (ServerIslandIdentity & { state: "failed"; status: number });

/** One server island on the page, as the panel displays it. */
export type ServerIslandInfo = UnloadedServerIsland | (ServerIslandIdentity & { state: "loaded" });

/**
 * The slice of `PerformanceResourceTiming` that the scan reads — a
 * structural type so that tests can fake entries and the plain
 * `PerformanceEntry` values the tracker collects stay assignable.
 */
export interface IslandResourceEntry {
  /** The absolute request URL. */
  name: string;
  /** Milliseconds since time origin; soft navigations do not reset it. */
  startTime: number;
  /** The HTTP status, when the browser exposes it (0 means unknown). */
  responseStatus?: number;
}

/** Selector for pending-island marker scripts; the panel's MutationObserver also watches for it. */
export const SERVER_ISLAND_SCRIPT_SELECTOR = "script[data-island-id]";

/** Scan the current document and the tracked Resource Timing entries. */
export function scanServerIslandsLive(): ServerIslandInfo[] {
  return scanServerIslands(document, serverIslandResourceEntries(), serverIslandNavigationStart());
}

/** A Resource Timing entry paired with the island name parsed from its URL. */
interface NamedIslandEntry {
  entry: IslandResourceEntry;
  name: string;
}

/**
 * Return server islands for the current page. The navigation start time is
 * used to exclude requests that the previous page left in Resource Timing.
 */
export function scanServerIslands(
  documentToScan: Document,
  entries: readonly IslandResourceEntry[],
  navigationStartTime: number,
): ServerIslandInfo[] {
  const pendingScripts = readPendingIslandScripts(documentToScan);
  // Only current-navigation entries can count for the page's islands.
  const islandEntries = entries
    .map((entry) => ({ entry, name: parseServerIslandName(entry.name) }))
    .filter(
      (islandEntry): islandEntry is NamedIslandEntry =>
        islandEntry.name !== undefined && islandEntry.entry.startTime >= navigationStartTime,
    );
  return [
    ...scanGetIslands(documentToScan, pendingScripts, islandEntries),
    ...scanPostIslands(pendingScripts, islandEntries),
  ];
}

/**
 * GET islands are keyed by their request URL, which pairs preload links,
 * marker scripts, and completed requests. Only GET requests carry a query.
 */
function scanGetIslands(
  documentToScan: Document,
  pendingScripts: readonly PendingScript[],
  islandEntries: readonly NamedIslandEntry[],
): ServerIslandInfo[] {
  // The newest request per URL wins by start time — the entries are not
  // sorted, because observer batches arrive in completion order.
  const resourceEntryByUrl = new Map<string, IslandResourceEntry>();
  for (const { entry } of islandEntries) {
    const known = resourceEntryByUrl.get(entry.name);
    if (known === undefined || entry.startTime >= known.startTime) {
      resourceEntryByUrl.set(entry.name, entry);
    }
  }

  // Nested islands may have no preload link, so also collect URLs from
  // scripts and timing entries.
  const getIslandsByUrl = new Map<string, string>();
  for (const link of readPreloadLinks(documentToScan)) getIslandsByUrl.set(link.url, link.name);
  for (const script of pendingScripts) {
    if (script.method === "GET" && !getIslandsByUrl.has(script.url)) {
      getIslandsByUrl.set(script.url, script.name);
    }
  }
  for (const { entry, name } of islandEntries) {
    if (entry.name.includes("?") && !getIslandsByUrl.has(entry.name)) {
      getIslandsByUrl.set(entry.name, name);
    }
  }

  const pendingGetUrls = new Set(
    pendingScripts.filter((script) => script.method === "GET").map((script) => script.url),
  );
  const islands: ServerIslandInfo[] = [];
  for (const [url, name] of getIslandsByUrl) {
    const id = serverIslandId("GET", url);
    const entry = resourceEntryByUrl.get(url);
    const status = entry === undefined ? undefined : getFailureStatus(entry);
    if (status !== undefined) {
      islands.push({ id, name, method: "GET", state: "failed", status });
    } else if (pendingGetUrls.has(url) || entry === undefined) {
      // The island still has its marker script, or its request is in flight
      // (entries only appear on completion).
      islands.push({ id, name, method: "GET", state: "pending" });
    } else {
      islands.push({ id, name, method: "GET", state: "loaded" });
    }
  }
  return islands;
}

/**
 * POST islands share one URL per name, so keep their marker identities as
 * well as their counts. A failed request leaves its marker in the DOM, and
 * so does a 200 answer until Astro swaps it in — which it only does for a
 * `text/html` answer, and only after the Resource Timing entry lands. So,
 * as for GET, a remaining marker outranks a completed request: a request
 * counts as loaded only once no remaining marker can still be its own.
 */
function scanPostIslands(
  allPendingScripts: readonly PendingScript[],
  islandEntries: readonly NamedIslandEntry[],
): ServerIslandInfo[] {
  const postScriptsByName = Map.groupBy(
    allPendingScripts.filter((script) => script.method === "POST"),
    (script) => script.name,
  );
  const postEntriesByName = Map.groupBy(
    islandEntries.filter(({ entry }) => !entry.name.includes("?")),
    ({ name }) => name,
  );
  // A Set keeps the marker scripts' order and drops the names it repeats.
  const postIslandNames = new Set([...postScriptsByName.keys(), ...postEntriesByName.keys()]);
  const islands: ServerIslandInfo[] = [];
  for (const name of postIslandNames) {
    const scripts = postScriptsByName.get(name) ?? [];
    const completedEntries = (postEntriesByName.get(name) ?? []).map(({ entry }) => entry);
    // One pass, so each entry's failure status is derived exactly once.
    // The entry list is append-only within a navigation, so the index keeps
    // simultaneous same-URL requests distinct even when the browser
    // coarsens their start times to equal values.
    const failures: { id: string; startTime: number; status: number }[] = [];
    // Requests that completed without a known failure: a 200, or a status
    // the browser hides. Neither proves a swap, so they are treated alike.
    const completedIds: string[] = [];
    for (const [index, entry] of completedEntries.entries()) {
      const id = serverIslandId("POST", entry.name, String(entry.startTime), String(index));
      const status = getFailureStatus(entry);
      if (status !== undefined) failures.push({ id, startTime: entry.startTime, status });
      else completedIds.push(id);
    }
    // Marker scripts that remain after known failures represent pending requests.
    const pendingScripts = scripts.slice(failures.length);
    // Each of those markers may still own one of the completed requests — a
    // swap that has not run yet, or an answer that was not HTML — and which
    // one is unknowable, so only the surplus of completed requests over
    // remaining markers has certainly swapped in. While requests are in
    // flight this can undercount loaded islands for a moment; it never
    // reports one marker as both loaded and pending.
    const loadedCount = Math.max(0, completedIds.length - pendingScripts.length);
    for (const id of completedIds.slice(0, loadedCount)) {
      islands.push({ id, name, method: "POST", state: "loaded" });
    }
    // A failure may take over its marker's identity only when no marker is
    // still pending: every remaining marker then belongs to a failure, and
    // sorting by start time pairs them in document order because inline
    // scripts issue their requests in the order they appear. While requests
    // are still in flight the owner of a failure is unknowable, so its row
    // keeps the failure's own request identity instead of borrowing a
    // marker that may yet succeed.
    const failedMarkerScripts = pendingScripts.length === 0 ? scripts : [];
    const orderedFailures = failures.toSorted((left, right) => left.startTime - right.startTime);
    for (const [index, failure] of orderedFailures.entries()) {
      islands.push({
        id: failedMarkerScripts[index]?.id ?? failure.id,
        name,
        method: "POST",
        state: "failed",
        status: failure.status,
      });
    }
    for (const script of pendingScripts) {
      islands.push({ id: script.id, name, method: "POST", state: "pending" });
    }
  }
  return islands;
}

interface PendingScript {
  /** Stable identity of the marker element across repeated scans. */
  id: string;
  name: string;
  method: ServerIslandMethod;
  /** Absolute request URL — the pairing key for GET islands. */
  url: string;
}

/**
 * Read the islands that have not been swapped in yet from their inline swap
 * scripts. The URL is the first JSON string literal that contains the
 * endpoint segment (the encrypted params are base64/hex, so they cannot
 * collide with it). It is unescaped by parsing it back as JSON — the
 * inverse of Astro's `stringifyForScript`.
 */
function readPendingIslandScripts(documentToScan: Document): PendingScript[] {
  const pendingScripts: PendingScript[] = [];
  for (const script of documentToScan.querySelectorAll(SERVER_ISLAND_SCRIPT_SELECTOR)) {
    const text = script.textContent ?? "";
    const literal = /"((?:[^"\\]|\\.)*\/_server-islands\/(?:[^"\\]|\\.)*)"/.exec(text);
    if (!literal) continue;
    let url: string;
    try {
      url = new URL(JSON.parse(`"${literal[1] as string}"`) as string, documentToScan.baseURI).href;
    } catch {
      continue;
    }
    const name = parseServerIslandName(url);
    if (name === undefined) continue;
    pendingScripts.push({
      // Element identity rather than `data-island-id`: Astro mints a fresh
      // random id per render, so the attribute is no more durable than the
      // element — and this cannot collide across methods or empty values.
      id: stableElementId(script),
      name,
      method: /method:\s*['"]POST['"]/.test(text) ? "POST" : "GET",
      url,
    });
  }
  return pendingScripts;
}

function serverIslandId(...parts: string[]): string {
  return JSON.stringify(parts);
}

/** Read preload links that remain after GET islands swap. */
function readPreloadLinks(documentToScan: Document): { name: string; url: string }[] {
  const links: { name: string; url: string }[] = [];
  for (const link of documentToScan.querySelectorAll<HTMLLinkElement>(
    'link[rel="preload"][as="fetch"]',
  )) {
    const name = parseServerIslandName(link.href);
    if (name !== undefined) links.push({ name, url: link.href });
  }
  return links;
}

/** Return a known non-success status. */
function getFailureStatus(entry: IslandResourceEntry): number | undefined {
  const status = entry.responseStatus;
  return typeof status === "number" && status !== 0 && status !== 200 ? status : undefined;
}

/** `true` when the URL points at the server-island endpoint. */
export function isServerIslandUrl(url: string): boolean {
  return parseServerIslandName(url) !== undefined;
}

/**
 * Extract the island name from a request URL. It tolerates a `base` prefix
 * before the endpoint segment and a `trailingSlash: "always"` slash after
 * the name; the name itself never contains `/`, `?`, or `#`.
 */
function parseServerIslandName(url: string): string | undefined {
  const match = /\/_server-islands\/([^/?#]+)/.exec(url);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1] as string);
  } catch {
    return match[1];
  }
}
