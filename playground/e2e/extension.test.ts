/**
 * The third-party extension surface. The playground-extension integration
 * registers a json-render panel using only what an external package gets:
 * the `astro-devtools/kit` group id and a Vite plugin's `devtools` hook.
 * Only a real session shows that whole path working — the DevTools host
 * calling a foreign plugin's hook, the entry syncing to an authorized
 * client inside the Astro group, and the spec rendering with no client
 * bundle — so this suite is what catches regressions in the documented
 * recipe (and in upstream kit changes to it).
 */
import type { Page } from "@playwright/test";

import { EXTENSION_DOCK_ENTRY_ID, EXTENSION_PANEL_MARKER } from "../devtools-extension.ts";
import { expect, test } from "./support/fixtures.ts";
import { dockEntries, switchEntry, waitFor } from "./support/helpers.ts";

let page: Page;

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  page = testPage;
  await page.goto(`${baseUrl}/`);
});

test("the extension's dock entry lands in the Astro group", async () => {
  const entry = await waitFor(
    async () => (await dockEntries(page)).find(({ id }) => id === EXTENSION_DOCK_ENTRY_ID),
    { label: "the extension's dock entry" },
  );
  // The assertion uses the literal group id, not the exported constant: the
  // value itself is public API (extensions may hold it in already-published
  // builds), so a rename must fail here instead of silently updating both
  // sides at once.
  expect(entry?.groupId).toBe("astro");
});

test("the dock renders the extension's json-render panel", async () => {
  await switchEntry(page, EXTENSION_DOCK_ENTRY_ID);
  // The panel's DOM belongs to the upstream json-render component library,
  // so assert on the rendered marker text rather than any structure.
  await waitFor(
    () =>
      page.evaluate(
        (needle) =>
          globalThis
            .__deepFind(document, "*")
            .some(
              (element) =>
                element.childElementCount === 0 && (element.textContent ?? "").includes(needle),
            ),
        EXTENSION_PANEL_MARKER,
      ),
    { label: "the extension panel's rendered content" },
  );
});
