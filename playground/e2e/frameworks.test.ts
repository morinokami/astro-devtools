/**
 * The Islands panel's framework logos against every official renderer at
 * once. Unit tests own the URL-to-framework mapping on synthetic
 * attributes; only in this suite does each real integration resolve its
 * client entrypoint into the `renderer-url` that the scanner reads — this
 * is the suite that catches an integration renaming its package or
 * entrypoint. The page's client:only island is the directive's live
 * fixture: astro ships it without server HTML, so its row depends on the
 * scanner needing nothing but the island's attributes. The Alpine widget
 * baked into the page is the deliberate counter-example: it ships as a
 * global script with no renderer, so no seventh row may ever appear for
 * it.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { switchPanel, waitFor } from "./support/helpers.ts";

let base: string;
let page: Page;

/** The aria-labels of the rows' framework icons, in document order. */
function frameworkLabels(target: Page): Promise<string[]> {
  return target.evaluate(() =>
    globalThis
      .__deepFind(document, '[data-testid="island-framework"]')
      .map((icon) => icon.getAttribute("aria-label") ?? ""),
  );
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  base = baseUrl;
  page = testPage;
  await page.goto(`${base}/frameworks`);
  await switchPanel(page, "astro-devtools:islands", '[data-testid="island-row"]');
});

test("the Islands panel labels each official renderer's island with its framework logo", async () => {
  // The rows render synchronously with the scan, but the panel itself
  // mounts async after the switch; poll until all six rows are up (five
  // client:load counters plus the client:only one).
  await waitFor(async () => (await frameworkLabels(page)).length === 6, {
    label: "six framework-labeled island rows",
  });
  expect((await frameworkLabels(page)).toSorted((a, b) => a.localeCompare(b))).toEqual([
    "Preact",
    "Preact",
    "React",
    "SolidJS",
    "Svelte",
    "Vue",
  ]);
});

test("the Islands panel resolves the client:only island's framework from its renderer alone", async () => {
  // No server HTML exists for this island, so the framework can only have
  // come from the astro-island's renderer-url attribute.
  const row = await page.evaluate(() =>
    globalThis
      .__deepFind(document, '[data-testid="island-row"]')
      .map((row) => ({
        text: [...row.querySelectorAll("span")]
          .map((span) => span.textContent?.trim() ?? "")
          .join(" "),
        framework:
          row.querySelector('[data-testid="island-framework"]')?.getAttribute("aria-label") ?? "",
      }))
      .find((candidate) => candidate.text.includes("client:only")),
  );
  expect(row?.framework).toBe("Preact");
  expect(row?.text).toContain("Counter");
});

test("the Islands panel lists no island for Alpine, a page script rather than a renderer", async () => {
  const rows = await page.evaluate(
    () => globalThis.__deepFind(document, '[data-testid="island-row"]').length,
  );
  expect(rows).toBe(6);
});
