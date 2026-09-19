// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { OverviewInfo } from "../../../../src/types.ts";

import { StatsGrid } from "../../../../src/client/features/overview/StatsGrid.tsx";
import { ASTRO_DOCK_ENTRY_IDS } from "../../../../src/dock-ids.ts";
import { cleanupTestComponents, renderTestComponent } from "../../render.ts";

/** The Overview stat cards expose product names and preserve their native semantics. */

const OVERVIEW_INFO: OverviewInfo = {
  astroVersion: "7.2.9",
  viteVersion: "0.3.0",
  counts: { pages: 7, endpoints: 1, redirects: 1, actions: 5 },
};

async function mount(overviewInfo = OVERVIEW_INFO, onOpenEntry = () => {}) {
  return renderTestComponent(<StatsGrid overviewInfo={overviewInfo} onOpenEntry={onOpenEntry} />);
}

afterEach(cleanupTestComponents);

describe("StatsGrid", () => {
  it("names version links with their products instead of only their version numbers", async () => {
    const container = await mount();
    const links = [...container.querySelectorAll("a")];

    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Astro v7.2.9",
      "Vite v0.3.0",
    ]);
    expect(links.map((link) => link.textContent)).toEqual(["v7.2.9", "v0.3.0"]);
  });

  it("labels an unavailable product version without calling it a literal version", async () => {
    const container = await mount({ counts: OVERVIEW_INFO.counts });
    const links = [...container.querySelectorAll("a")];

    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Astro version unknown",
      "Vite version unknown",
    ]);
  });

  it("keeps visible and accessible labels aligned for blank versions", async () => {
    const container = await mount({
      astroVersion: "",
      viteVersion: "   ",
      counts: OVERVIEW_INFO.counts,
    });
    const links = [...container.querySelectorAll("a")];

    expect(links.map((link) => link.textContent)).toEqual(["unknown", "unknown"]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Astro version unknown",
      "Vite version unknown",
    ]);
  });

  it("uses real buttons with phrasing content for panel navigation", async () => {
    const onOpenEntry = vi.fn();
    const container = await mount(OVERVIEW_INFO, onOpenEntry);
    const buttons = [...container.querySelectorAll("button")];

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.firstElementChild?.tagName === "SPAN")).toBe(true);
    buttons[0]?.click();
    buttons[1]?.click();
    expect(onOpenEntry.mock.calls).toEqual([
      [ASTRO_DOCK_ENTRY_IDS.routes],
      [ASTRO_DOCK_ENTRY_IDS.actions],
    ]);
  });
});
