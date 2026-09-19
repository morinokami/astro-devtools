/** Parse the current page's `astro-island` elements, directive arguments and observed hydration state. */

import { stableElementId } from "../../platform/element-identity.ts";
import { hasIslandHydrationFailed } from "./client-island-hydration.ts";

/** Astro renderer packages recognized by the panel. */
export type IslandFramework = "preact" | "react" | "solid" | "svelte" | "vue";

/** One `astro-island` element on the page, as the panel displays it. */
export interface IslandInfo {
  /** Stable identity of this DOM instance across repeated page scans. */
  id: string;
  /** The element itself, for highlighting it on the page. */
  element: Element;
  /** Component name, e.g. `Counter`. */
  name: string;
  /** The UI framework that renders it, when the renderer names a known one. */
  framework?: IslandFramework;
  /** The hydration directive with its argument, e.g. `client:media="(max-width: 50em)"`; absent if none. */
  directive?: string;
  /** The island's props as a single-line JSON object; absent when empty. */
  propsSummary?: string;
  /** The component's path as shown in the row. */
  displayPath?: string;
  /** The path format accepted by `/__open-in-editor`. */
  editorPath?: string;
  /** A retained `ssr` attribute means pending unless Astro reported a failure. */
  state: "pending" | "hydrated" | "failed";
}

/**
 * Astro's own props on an island, which say nothing about the component: the
 * scoped-style marker (`data-astro-cid-*`) and, for a component carrying a
 * `transition:` directive, the view-transition plumbing Astro serializes
 * beside the real props (`data-astro-transition-scope`, `-persist`,
 * `-persist-props`). Both live in Astro's own `data-astro-` namespace.
 */
const ASTRO_INTERNAL_PROP_PREFIX = "data-astro-";

/** Vite's dev URL prefix for a file outside the project root. */
const FS_PREFIX = "/@fs/";

/** Match renderer packages across normal, pnpm, and Vite-optimized URLs. */
const RENDERER_PACKAGES: [RegExp, IslandFramework][] = [
  [/@astrojs[/+_]preact[/@_.]/, "preact"],
  [/@astrojs[/+_]react[/@_.]/, "react"],
  [/@astrojs[/+_]solid-js[/@_.]/, "solid"],
  [/@astrojs[/+_]svelte[/@_.]/, "svelte"],
  [/@astrojs[/+_]vue[/@_.]/, "vue"],
];

/** A Windows drive letter; a path starting with one is already absolute without a leading slash. */
const VOLUME_PATTERN = /^[A-Za-z]:/;

/** Every island on the page, in document order. */
export function scanIslands(documentToScan: Document): IslandInfo[] {
  return [...documentToScan.querySelectorAll("astro-island")].map(readIsland);
}

function readIsland(element: Element): IslandInfo {
  const componentUrl = element.getAttribute("component-url");
  const componentPath = componentUrl === null ? undefined : normalizeComponentUrl(componentUrl);
  const options = parseJson(element.getAttribute("opts"));
  return {
    id: stableElementId(element),
    element,
    name: readName(options, componentPath),
    framework: readFramework(element, componentPath),
    directive: readDirective(element.getAttribute("client"), options),
    propsSummary: readProps(element.getAttribute("props")),
    ...readPaths(componentPath),
    // astro-island removes `ssr` when hydration finishes.
    state: !element.hasAttribute("ssr")
      ? "hydrated"
      : hasIslandHydrationFailed(element)
        ? "failed"
        : "pending",
  };
}

/** Read Astro's component name, falling back to its file name. */
function readName(options: unknown, componentPath: string | undefined): string {
  const name = isRecord(options) ? options.name : undefined;
  if (typeof name === "string" && name !== "") return name;
  return getFileNameWithoutExtension(componentPath ?? "") ?? "island";
}

/** Detect the framework from its renderer URL or component extension. */
function readFramework(
  element: Element,
  componentPath: string | undefined,
): IslandFramework | undefined {
  const rendererUrl = element.getAttribute("renderer-url");
  if (rendererUrl !== null) {
    const url = normalizeComponentUrl(rendererUrl);
    for (const [pattern, framework] of RENDERER_PACKAGES) {
      if (pattern.test(url)) return framework;
    }
  }
  if (componentPath?.endsWith(".vue")) return "vue";
  if (componentPath?.endsWith(".svelte")) return "svelte";
  return undefined;
}

/** Append Astro's plain JSON directive argument in attribute syntax. */
function readDirective(directive: string | null, options: unknown): string | undefined {
  if (!directive) return undefined;
  const label = `client:${directive}`;
  const value = isRecord(options) ? options.value : undefined;
  // Bare directives have no argument (Astro may serialize them as "" or true).
  if (value === undefined || value === null || value === "" || value === true) return label;
  const argument = JSON.stringify(value);
  return `${label}=${typeof value === "string" ? argument : `{${argument}}`}`;
}

/** Format serialized island props on one line, excluding Astro style attributes. */
function readProps(serializedProps: string | null): string | undefined {
  const parsed = parseJson(serializedProps);
  if (!isRecord(parsed)) return undefined;
  const entries = Object.entries(parsed)
    .filter(([key]) => !key.startsWith(ASTRO_INTERNAL_PROP_PREFIX))
    .map(([key, value]) => [key, reviveValue(value)] as const);
  if (entries.length === 0) return undefined;
  try {
    return JSON.stringify(Object.fromEntries(entries));
  } catch {
    return undefined;
  }
}

/**
 * Decode one value of Astro's props serializer into plain JSON for display.
 *
 * Astro tags every value — recursively, not just at the top level — as a
 * `[type, value]` tuple; see astro/runtime/server/serialize. Types with no
 * JSON form (Map, Set, BigInt, …) become their closest JSON approximation
 * rather than real instances, since the result only feeds `JSON.stringify`.
 */
function reviveValue(value: unknown): unknown {
  // Preserve non-tuple values from custom or newer serializers.
  if (!Array.isArray(value)) return value;
  const [type, payload] = value as [unknown, unknown];
  switch (type) {
    case 0: // plain value; an object's properties are tuples again
      return isRecord(payload) ? reviveEntries(payload) : payload;
    case 1: // Array of tuples
    case 4: // Map, as [key, value] tuple pairs
    case 5: // Set, as an array of tuples
      return Array.isArray(payload) ? payload.map(reviveValue) : payload;
    case 11: // Infinity, as its sign
      return payload === -1 ? "-Infinity" : "Infinity";
    // RegExp source, Date ISO string, BigInt digits, URL href, and typed
    // arrays all carry a payload that is already displayable JSON.
    default:
      return payload;
  }
}

function reviveEntries(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, reviveValue(value)]),
  );
}

/** Convert a component URL into display and editor paths. */
function readPaths(componentPath: string | undefined): {
  displayPath?: string;
  editorPath?: string;
} {
  if (componentPath === undefined || componentPath === "") return {};
  if (componentPath.startsWith(FS_PREFIX)) {
    const fileSystemPath = componentPath.slice(FS_PREFIX.length);
    const path = isAbsolutePath(fileSystemPath) ? fileSystemPath : `/${fileSystemPath}`;
    return { displayPath: path, editorPath: path };
  }
  const path = componentPath.replace(/^\//, "");
  return path === "" ? {} : { displayPath: path, editorPath: path };
}

/** Whether an editor path is already absolute. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || VOLUME_PATTERN.test(path);
}

/** Decode a component URL and remove its query and fragment. */
function normalizeComponentUrl(componentUrl: string): string {
  const path = componentUrl.split(/[?#]/)[0] ?? "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** The last path segment without its extension, e.g. `Counter` for `a/b/Counter.tsx`. */
function getFileNameWithoutExtension(path: string): string | undefined {
  const file = path.split("/").pop() ?? "";
  return file.replace(/\.[^./]+$/, "") || undefined;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
