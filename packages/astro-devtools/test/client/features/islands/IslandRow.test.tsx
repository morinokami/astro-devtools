// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { IslandInfo } from "../../../../src/client/features/islands/islands.ts";

import { IslandRow } from "../../../../src/client/features/islands/IslandRow.tsx";
import { hideHighlight } from "../../../../src/client/platform/overlay.ts";
import { cleanupTestComponents, renderTestComponent } from "../../render.ts";

afterEach(async () => {
  hideHighlight();
  await cleanupTestComponents();
});

describe("IslandRow", () => {
  const islandInfo = (overrides: Partial<IslandInfo>): IslandInfo => ({
    id: "counter-island",
    element: document.createElement("astro-island"),
    name: "Counter",
    state: "hydrated",
    ...overrides,
  });

  it("puts a labeled framework logo before the component name", async () => {
    const container = await renderTestComponent(
      <IslandRow island={islandInfo({ framework: "vue" })} onOpen={async () => {}} />,
    );
    const icon = container.querySelector('[data-testid="island-framework"]');
    // The wrapper names the framework while the nested SVG remains decorative.
    expect(icon?.getAttribute("role")).toBe("img");
    expect(icon?.getAttribute("aria-label")).toBe("Vue");
    expect(icon?.getAttribute("title")).toBe("Vue");
    expect(icon?.querySelector("svg")).not.toBe(null);
    expect(icon?.nextElementSibling?.textContent).toBe("<Counter>");
    expect(container.querySelector('[data-testid="island-row"]')?.tagName).toBe("LI");
  });

  it("renders no logo for an island of no known framework", async () => {
    const container = await renderTestComponent(
      <IslandRow island={islandInfo({})} onOpen={async () => {}} />,
    );
    expect(container.querySelector('[data-testid="island-framework"]')).toBe(null);
    expect(container.textContent).toContain("<Counter>");
  });

  it("highlights the current root after the island replaces it", async () => {
    const island = document.createElement("astro-island");
    const originalRoot = document.createElement("div");
    originalRoot.getBoundingClientRect = () =>
      ({ top: 10, left: 10, width: 10, height: 10 }) as DOMRect;
    island.append(originalRoot);
    document.body.append(island);
    const container = await renderTestComponent(
      <IslandRow island={islandInfo({ element: island })} onOpen={async () => {}} />,
    );

    const currentRoot = document.createElement("section");
    currentRoot.getBoundingClientRect = () =>
      ({ top: 30, left: 40, width: 100, height: 50 }) as DOMRect;
    island.replaceChildren(currentRoot);
    container
      .querySelector('[data-testid="island-row"]')
      ?.dispatchEvent(new Event("pointerover", { bubbles: true }));

    const highlight = document.querySelector<HTMLElement>("astro-devtools-highlight");
    expect(highlight?.style.display).toBe("block");
    expect(highlight?.style.top).toBe("20px");
    expect(highlight?.style.left).toBe("30px");
    expect(highlight?.style.width).toBe("115px");
    expect(highlight?.style.height).toBe("65px");
  });
});
