// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { setTimeout as sleep } from "node:timers/promises";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  RouteDisplay,
  RouteSection,
  RoutesContext,
  RoutesInfo,
} from "../../../../src/types.ts";

import { RoutesPanel } from "../../../../src/client/features/routes/RoutesPanel.tsx";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

async function mount(
  routes: RouteDisplay[],
  options: { clientType?: string; routesContext?: RoutesContext } = {},
): Promise<HTMLElement> {
  const routesInfo: RoutesInfo = { context: options.routesContext ?? {}, routes };
  const context = {
    clientType: options.clientType ?? "standalone",
    rpc: { call: vi.fn(() => Promise.resolve(routesInfo)) },
    connection: { events: { on: () => () => {} } },
  } as unknown as DockClientScriptContext;
  const container = document.createElement("div");
  document.body.append(container);
  await act(() => render(<RoutesPanel context={context} refreshKey={1} active />, container));
  await act(() => sleep(0));
  return container;
}

const statusText = (container: HTMLElement): string | undefined =>
  container.querySelector('.sr-only[role="status"]')?.textContent ?? undefined;

const rows = (container: HTMLElement): Element[] => [
  ...container.querySelectorAll('[data-testid="route-row"]'),
];

describe("RoutesPanel", () => {
  it("announces the number of routes matching its search input", async () => {
    const container = await mount([route("/"), route("/about")]);
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;

    expect(statusText(container)).toBe("2 routes shown.");
    expect(search.getAttribute("aria-controls")).toBe("route-results");
    expect(container.querySelector("#route-results")).not.toBeNull();
    expect(rows(container)).toHaveLength(2);
    expect(
      rows(container).every(
        (row) =>
          row.tagName === "LI" &&
          row.parentElement?.tagName === "UL" &&
          // Tailwind's preflight sets `list-style: none`, which strips list
          // semantics in WebKit unless the role is restored explicitly.
          row.parentElement.getAttribute("role") === "list",
      ),
    ).toBe(true);

    await act(() => {
      search.value = "about";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows(container)).toHaveLength(1);
    expect(statusText(container)).toBe("1 route shown for the current filter.");
  });

  it("keeps a matching route variant with its primary route", async () => {
    const primary = route("/about");
    const localized = { ...route("/ja/about"), variantOf: "/about" };
    const container = await mount([primary, localized, route("/contact")]);
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;

    await act(() => {
      search.value = "/ja/";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(rows(container).map((row) => row.textContent)).toEqual([
      expect.stringContaining("/about"),
      expect.stringContaining("/ja/about"),
    ]);
  });

  it("counts only the rows a collapsed section actually renders", async () => {
    // Astro's dev manifest always carries internal routes, and that section
    // starts collapsed — so the announcement must not count what it hides.
    const container = await mount([
      route("/"),
      route("/about"),
      route("/_image", "internal"),
      route("/_actions/[...path]", "internal"),
    ]);

    expect(rows(container)).toHaveLength(2);
    expect(statusText(container)).toBe("2 routes shown.");

    // The section's own collapse control, not the like-named filter chip.
    const toggle = [...container.querySelectorAll("button[aria-expanded]")].find((button) =>
      button.textContent?.includes("Internal"),
    ) as HTMLButtonElement | undefined;
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    await act(() => toggle?.click());

    expect(rows(container)).toHaveLength(4);
    expect(statusText(container)).toBe("4 routes shown.");
  });

  it("reaches a match that only the collapsed section holds", async () => {
    const container = await mount([
      route("/"),
      route("/about"),
      route("/_image", "internal"),
      route("/_actions/[...path]", "internal"),
    ]);
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;

    await act(() => {
      search.value = "_image";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Searching expands Internal, so the one match is reachable rather than
    // announced as a route that the panel never rendered.
    expect(rows(container)).toHaveLength(1);
    expect(statusText(container)).toBe("1 route shown for the current filter.");

    // Only the start of a search expands the section: it can still be
    // closed while the search stays active, and the count follows what is
    // left on screen.
    const toggle = [...container.querySelectorAll("button[aria-expanded]")].find((button) =>
      button.textContent?.includes("Internal"),
    ) as HTMLButtonElement | undefined;
    await act(() => toggle?.click());

    expect(rows(container)).toHaveLength(0);
    expect(statusText(container)).toBe("0 routes shown for the current filter.");
  });

  it("marks the current page after stripping the configured base", async () => {
    history.replaceState(null, "", "/docs/about");
    const container = await mount([route("/"), route("/about")], {
      clientType: "embedded",
      routesContext: { base: "/docs" },
    });

    const currentRows = rows(container).filter(
      (row) => row.getAttribute("aria-current") === "page",
    );
    expect(currentRows.map((row) => row.textContent)).toEqual([expect.stringContaining("/about")]);
  });

  it("builds route links with base and trailing slash applied", async () => {
    const container = await mount([route("/about")], {
      routesContext: { base: "/docs", trailingSlash: "always" },
    });

    const link = container.querySelector('[data-testid="route-row"] a');
    expect(link?.getAttribute("href")).toBe("/docs/about/");
  });

  it("moves the current-page row after Astro client navigation", async () => {
    history.replaceState(null, "", "/");
    const container = await mount([route("/"), route("/about")], { clientType: "embedded" });

    const currentPatterns = () =>
      rows(container)
        .filter((row) => row.getAttribute("aria-current") === "page")
        .map((row) => row.querySelector('[data-testid="route-pattern"]')?.textContent);
    expect(currentPatterns()).toEqual(["/"]);

    await act(() => {
      history.replaceState(null, "", "/about");
      document.dispatchEvent(new Event("astro:after-swap"));
    });

    expect(currentPatterns()).toEqual(["/about"]);
  });

  it("marks the fallback row current when a rewrite fallback keeps the browser on its URL", async () => {
    // With `fallbackType: "rewrite"`, `/fr/about` renders `/about` in place
    // and the browser stays on `/fr/about`.
    history.replaceState(null, "", "/fr/about");
    const container = await mount([route("/about"), fallbackRow("/fr/about", "/about")], {
      clientType: "embedded",
    });

    const currentPatterns = rows(container)
      .filter((row) => row.getAttribute("aria-current") === "page")
      .map((row) => row.querySelector('[data-testid="route-pattern"]')?.textContent);
    expect(currentPatterns).toEqual(["/fr/about"]);
  });

  it("falls back to All when a refresh removes the selected section's last route", async () => {
    let routesInfo: RoutesInfo = {
      context: {},
      routes: [route("/"), route("/api", "endpoints")],
    };
    const context = {
      clientType: "standalone",
      rpc: { call: vi.fn(() => Promise.resolve(routesInfo)) },
      connection: { events: { on: () => () => {} } },
    } as unknown as DockClientScriptContext;
    const container = document.createElement("div");
    document.body.append(container);
    await act(() => render(<RoutesPanel context={context} refreshKey={1} active />, container));
    await act(() => sleep());
    const sectionChips = () => [
      ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Route type filter"] button'),
    ];
    const endpointsChip = sectionChips().find((chip) => chip.textContent?.startsWith("Endpoints"));
    await act(() => endpointsChip?.click());
    expect(statusText(container)).toBe("1 route shown in Endpoints.");

    routesInfo = { context: {}, routes: [route("/")] };
    await act(() => render(<RoutesPanel context={context} refreshKey={2} active />, container));
    await act(() => sleep());

    // The emptied section has no chip, so the view falls back to All
    // instead of dead-ending on an empty selection.
    expect(sectionChips().some((chip) => chip.textContent?.startsWith("Endpoints"))).toBe(false);
    const allChip = sectionChips().find((chip) => chip.textContent?.startsWith("All"));
    expect(allChip?.getAttribute("aria-pressed")).toBe("true");
    expect(statusText(container)).toBe("1 route shown.");

    // The stored choice returns together with the section's routes.
    routesInfo = { context: {}, routes: [route("/"), route("/api", "endpoints")] };
    await act(() => render(<RoutesPanel context={context} refreshKey={3} active />, container));
    await act(() => sleep());
    expect(statusText(container)).toBe("1 route shown in Endpoints.");
  });
});

function route(pattern: string, section: RouteSection = "pages"): RouteDisplay {
  return {
    pattern,
    patternSource: `^${pattern}$`,
    entrypoint: pattern === "/" ? "src/pages/index.astro" : `src/pages${pattern}.astro`,
    type: "page",
    prerendered: true,
    origin:
      section === "internal" ? "internal" : section === "integrations" ? "external" : "project",
    pathname: pattern,
    params: [],
    fallbackRoutes: [],
    section,
    delivery: "static",
    matchOrder: 0,
    sourceLabel: pattern,
    sourceIsFile: true,
  };
}

/** A synthesized i18n fallback row, as `toDisplayRoutes` lists it under its target route. */
function fallbackRow(pattern: string, fallbackOf: string): RouteDisplay {
  return {
    ...route(pattern),
    type: "fallback",
    pathname: undefined,
    variantOf: fallbackOf,
    fallbackOf,
    sourceLabel: "",
    sourceIsFile: false,
  };
}
