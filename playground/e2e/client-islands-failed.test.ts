/**
 * Astro's real hydration-error event must reach the injected recorder before
 * the panel opens, and update an already open panel without DOM mutations.
 * A real throwing component exercises hydration exceptions; aborting its
 * imports (including Astro's retry) also pins module-load failures.
 */
import { expect, test } from "./support/fixtures.ts";
import { switchPanel } from "./support/helpers.ts";

test("retains a hydration failure before the Islands panel opens", async ({ page, baseUrl }) => {
  const failure = page.waitForEvent("console", {
    predicate: (message) =>
      message.type() === "error" && message.text().includes("[astro-island] Error hydrating"),
  });
  await page.goto(`${baseUrl}/client-islands-failed`);
  await failure;
  expect(await page.locator('[data-testid="island-row"]').count()).toBe(0);
  await expect(page.locator('astro-island[component-url*="ThrowingIsland"]')).toHaveAttribute(
    "ssr",
    "",
  );

  await switchPanel(page, "astro-devtools:islands", '[data-testid="island-row"]');
  const rows = page.getByTestId("island-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "<ThrowingIsland>" })).toContainText("failed");
  await expect(rows.filter({ hasText: "<PreactCounter>" })).toContainText("hydrated");
  await expect(rows.filter({ hasText: "<Greeting>" })).toContainText("pending");

  await page.locator('astro-island[component-url*="Greeting"]').scrollIntoViewIfNeeded();
  await expect(rows.filter({ hasText: "<Greeting>" })).toContainText("hydrated");
  await expect(rows.filter({ hasText: "<ThrowingIsland>" })).toContainText("failed");
});

test("updates an open panel when hydration fails", async ({ page, baseUrl }) => {
  // Hold only the response timing; the browser still imports and hydrates
  // the real fixture after its pending row has been observed.
  const ready = Promise.withResolvers<void>();
  await page.route("**/components/preact/ThrowingIsland.tsx*", async (route) => {
    await ready.promise;
    await route.continue();
  });
  try {
    await page.goto(`${baseUrl}/client-islands-failed`, { waitUntil: "domcontentloaded" });
    await switchPanel(page, "astro-devtools:islands", '[data-testid="island-row"]');
    const row = page.getByTestId("island-row").filter({ hasText: "<ThrowingIsland>" });
    await expect(row).toContainText("pending");
    ready.resolve();
    await expect(row).toContainText("failed");
    await expect(page.locator('astro-island[component-url*="ThrowingIsland"]')).toHaveAttribute(
      "ssr",
      "",
    );
  } finally {
    ready.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("reports a failed component import after Astro exhausts its retry", async ({
  page,
  baseUrl,
}) => {
  let attempts = 0;
  await page.route("**/components/preact/ThrowingIsland.tsx*", async (route) => {
    attempts++;
    await route.abort("failed");
  });
  await page.goto(`${baseUrl}/client-islands-failed`);
  await switchPanel(page, "astro-devtools:islands", '[data-testid="island-row"]');
  await expect(
    page.getByTestId("island-row").filter({ hasText: "<ThrowingIsland>" }),
  ).toContainText("failed");
  expect(attempts).toBe(2);
});
