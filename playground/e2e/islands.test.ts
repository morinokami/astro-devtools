/**
 * The Islands panel on a real app page. Unit tests scan synthetic
 * happy-dom elements; this is the only place where a real astro-island
 * carries the attributes that the scanner reads, where hydration state
 * changes live (the client:visible island sits below the fold, so it stays
 * pending while the client:load one hydrates), and where the hover
 * highlight overlay draws on the page.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { switchPanel, waitFor } from "./support/helpers.ts";

let base: string;
let page: Page;

// One span-text list per row (the component name plus every badge), joined
// for coarse matching — the badge wording and row structure are covered by
// unit tests; here the assertion is only that the hydration states show up
// somewhere.
function rowBadges(target: Page): Promise<string[]> {
  return target.evaluate(() =>
    globalThis
      .__deepFind(document, '[data-testid="island-row"]')
      .map((row) =>
        [...row.querySelectorAll("span")].map((span) => span.textContent?.trim() ?? "").join(" "),
      ),
  );
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  base = baseUrl;
  page = testPage;
  await page.goto(`${base}/`);
  await switchPanel(page, "astro-devtools:islands", '[data-testid="island-row"]');
});

test("the Islands panel lists the page's two islands with their hydration states", async () => {
  // The client:load island's row flips to "hydrated" asynchronously; poll
  // until both states are visible.
  await waitFor(
    async () => {
      const badges = await rowBadges(page);
      return (
        badges.length === 2 &&
        badges.some((text) => text.includes("hydrated")) &&
        badges.some((text) => text.includes("pending"))
      );
    },
    { label: "one hydrated and one pending island row" },
  );
});

test("the Islands panel highlights the hovered island on the page", async () => {
  await waitFor(async () => (await rowBadges(page)).some((text) => text.includes("hydrated")), {
    label: "a hydrated island row before hovering",
  });
  const probe = await page.evaluate(() => {
    const rows = globalThis.__deepFind(document, '[data-testid="island-row"]');
    // The hydration badge is the one span whose whole text is the state word.
    const row = rows.find((candidate) =>
      [...candidate.querySelectorAll("span")].some(
        (badge) => badge.textContent?.trim() === "hydrated",
      ),
    );
    if (!row) throw new Error("no hydrated island row");
    // The highlight lives in the page's own document (the panel runs there
    // too), outside every shadow root, and is hidden rather than removed.
    const highlightDisplay = () => {
      const element = document.querySelector("astro-devtools-highlight");
      return element ? getComputedStyle(element).display : null;
    };
    row.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const hovered = highlightDisplay();
    row.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null }));
    return { hovered, left: highlightDisplay() };
  });
  expect(probe.hovered).toBe("block");
  expect(probe.left).toBe("none");
});
