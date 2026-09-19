/**
 * The Islands panel's server card against real server islands. Unit tests
 * own the scan's state machine on synthetic traces; the astro contracts run
 * end to end only here — the inline swap scripts that astro renders, the
 * preload links it puts in the head, the `/_server-islands/` responses and
 * the Chromium Resource Timing entries that the scan pairs them with. This is the
 * suite that catches astro moving the endpoint path, the swap-script
 * template, or the GET/POST switch. The card only gives problem islands
 * their own rows, so the two fixture pages pin its two shapes: a healthy set
 * collapsed to a line (`/server-islands`) and a deliberate failure as a row
 * (`/server-islands-failed`). Each page gets one self-contained test that
 * opens it and reads the card.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { switchPanel, waitFor } from "./support/helpers.ts";

let base: string;
let page: Page;
const serverIslandRequestMethods: string[] = [];

/** One text string per server-island row, joining the row's spans — the name plus its badges. */
function serverRows(target: Page): Promise<string[]> {
  return target.evaluate(() =>
    globalThis
      .__deepFind(document, '[data-testid="server-island-row"]')
      .map((row) =>
        [...row.querySelectorAll("span")].map((span) => span.textContent?.trim() ?? "").join(" "),
      ),
  );
}

/** The card's quiet line — "All loaded." or "N more loaded." */
function noteText(target: Page): Promise<string> {
  return target.evaluate(
    () =>
      globalThis
        .__deepFind(document, '[data-testid="server-islands-note"]')[0]
        ?.textContent?.trim() ?? "",
  );
}

/** Every card title in the panel, for the two-card layout checks. */
function cardTitles(target: Page): Promise<string[]> {
  return target.evaluate(() =>
    globalThis.__deepFind(document, "h2").map((title) => title.textContent?.trim() ?? ""),
  );
}

/** Load a fixture page, starting the island request log afresh for it. */
async function visit(path: string): Promise<void> {
  serverIslandRequestMethods.length = 0;
  await page.goto(`${base}${path}`);
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  base = baseUrl;
  page = testPage;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/_server-islands/")) {
      serverIslandRequestMethods.push(request.method());
    }
  });
});

test("the server islands card collapses a fully loaded set to one line", async () => {
  await visit("/server-islands");
  // The note only renders once the islands' deliberate delay has passed
  // (while they are pending, they are rows), so waiting for it also waits
  // for the swaps.
  await switchPanel(page, "astro-devtools:islands", '[data-testid="server-islands-note"]');
  await waitFor(async () => (await noteText(page)) === "All loaded.", {
    label: 'the server card to settle on "All loaded."',
  });
  expect(serverIslandRequestMethods.filter((method) => method === "POST")).toHaveLength(1);
  // Loaded islands are indistinguishable by design, so none may be a row.
  expect(await serverRows(page)).toEqual([]);
  // The counted title still proves all three islands (two GET, one POST)
  // were detected, and the two cards share one title shape.
  const titles = await cardTitles(page);
  expect(titles).toContain("3 server islands on this page");
  expect(titles).toContain("1 client island on this page");
});

test("the server islands card surfaces a failed island as a row with the rest folded away", async () => {
  await visit("/server-islands-failed");
  await switchPanel(page, "astro-devtools:islands", '[data-testid="server-island-row"]');
  // The 500 answer leaves the swap script in place, so without the
  // Resource Timing status the row would read pending forever — reaching
  // "failed" proves the whole entry-pairing pipeline.
  await waitFor(
    async () => {
      const rows = await serverRows(page);
      return rows.length === 1 && (rows[0] ?? "").includes("failed · 500");
    },
    { label: "the throwing component's failed row" },
  );
  expect((await serverRows(page))[0]).toContain("<ThrowingComponent>");
  await waitFor(async () => (await noteText(page)) === "1 more loaded.", {
    label: "the healthy island to fold into the quiet line",
  });
  expect(await cardTitles(page)).toContain("2 server islands on this page");
});
