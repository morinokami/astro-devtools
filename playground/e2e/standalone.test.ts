/**
 * The standalone UI at /__devtools/ embeds no page, so page-scoped readings
 * must be replaced by a note instead of describing the DevTools app itself.
 * This doubles as the smoke test that a custom-render panel mounts in a real
 * dock. The auth setup's persisted token makes each fresh browser context
 * trusted here too.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { switchEntry, switchPanel, waitFor } from "./support/helpers.ts";

let page: Page;

// The standalone notes carry no container hook of their own; each note's title
// copy is unique to its panel, so the exact sentence rendered as a whole
// paragraph is the assertion target.
function noteShown(target: Page, copy: string): Promise<boolean> {
  return target.evaluate(
    (text) => globalThis.__deepFind(document, "p").some((p) => p.textContent?.trim() === text),
    copy,
  );
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  page = testPage;
  await page.goto(`${baseUrl}/__devtools/`);
  await switchPanel(page, "astro-devtools:overview", "#astro-version");
});

test("the integration brands the standalone UI as Astro DevTools", async () => {
  // The integration's default branding travels through the connection
  // handshake; the client applies `windowTitle` and `tagline` to the
  // document head it owns (applyDocumentHead runs for the standalone page).
  await expect(page).toHaveTitle("Astro DevTools");
  const description = await page.evaluate(() =>
    document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
  );
  expect(description).toBe("DevTools for Astro, built on Vite DevTools");
});

test("the standalone Overview fills its stats from a live RPC round trip", async () => {
  // The panel mounts with "—" placeholders and fills them from an RPC round
  // trip; a populated version proves the round trip completed.
  await waitFor(
    () =>
      page.evaluate(() => {
        const version = globalThis.__deepFind(document, "#astro-version")[0];
        const text = version?.textContent?.trim() ?? "";
        return text.length > 0 && text !== "—";
      }),
    { label: "the overview astro version stat to populate" },
  );
  const astroVersion = await page.evaluate(
    () => globalThis.__deepFind(document, "#astro-version")[0]?.textContent?.trim() ?? null,
  );
  expect(astroVersion).toMatch(/^v\d+\.\d+\.\d+/);
});

test("the standalone Routes panel lists routes but marks none as the current page", async () => {
  // Each panel handles the standalone case in its own way: Routes still
  // shows every route, but in the standalone UI `location` is the DevTools
  // app's own URL, so no row may win the aria-current="page" marking.
  await switchPanel(page, "astro-devtools:routes", '[data-testid="route-row"]');
  const rows = await page.evaluate(() => {
    const rowElements = globalThis.__deepFind(document, '[data-testid="route-row"]');
    return {
      total: rowElements.length,
      current: rowElements.filter((row) => row.getAttribute("aria-current") === "page").length,
    };
  });
  expect(rows.total).toBeGreaterThan(0);
  expect(rows.current).toBe(0);
});

test("the standalone Islands panel shows the page-scoped note instead of rows", async () => {
  await switchEntry(page, "astro-devtools:islands");
  // The note is the standalone view's whole content, so its copy doubles as
  // the panel's mount signal.
  await waitFor(() => noteShown(page, "Islands are page-scoped."), {
    label: "the Islands standalone note",
  });
  const rows = await page.evaluate(
    () => globalThis.__deepFind(document, '[data-testid="island-row"]').length,
  );
  expect(rows).toBe(0);
});
