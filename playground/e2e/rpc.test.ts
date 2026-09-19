/**
 * The RPC transport, end to end: an authorized browser client calls the
 * integration's server functions over the real devtools channel and gets
 * real project data back. The functions' shapes are unit-tested; this suite
 * only checks the live round-trip and that a real dev run populates the
 * store. Separate tests also mount the data-only panels (Routes, Config)
 * once: no unit test renders a panel, so a renderer that crashed on mount
 * would otherwise pass everything — and the mounted Routes panel is the one
 * place where the current-page marking meets a real location and real route
 * regexes.
 */
import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { dockEntries, isTrusted, rpcCall, switchPanel, waitFor } from "./support/helpers.ts";

let page: Page;

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  page = testPage;
  await page.goto(`${baseUrl}/`);
  await waitFor(() => isTrusted(page), { label: "the restored DevTools client to become trusted" });
});

test("the integration registers the Astro dock group and its entries", async () => {
  // Entries arrive only after the websocket client is trusted, so poll.
  await waitFor(
    async () => {
      const ids = (await dockEntries(page)).map((entry) => entry.id);
      return [
        "astro",
        "astro-devtools:overview",
        "astro-devtools:islands",
        "astro-devtools:routes",
        "astro-devtools:actions",
        "astro-devtools:config",
        "astro-devtools:docs",
      ].every((id) => ids.includes(id));
    },
    { label: "astro dock entries registered" },
  );
  // Registry data only — the external docs site is never loaded here.
  const docs = (await dockEntries(page)).find((entry) => entry.id === "astro-devtools:docs");
  expect(docs?.type).toBe("iframe");
  expect(docs?.url).toBe("https://docs.astro.build/");
});

test("astro-devtools:routes:list returns a populated routing context", async () => {
  // The per-field derivations (deriveDelivery, fallbackOf, …) are covered
  // by the unit tests; this test only checks that a real dev run populates
  // the store.
  const info = (await rpcCall(page, "astro-devtools:routes:list")) as {
    context?: { adapterName?: string; output?: string };
    routes?: unknown[];
  };
  expect(info.context?.adapterName).toBeTruthy();
  expect(info.context?.output).toBeTruthy();
  expect(info.routes?.length).toBeGreaterThan(0);
});

test("astro-devtools:project:context returns the project root", async () => {
  const context = (await rpcCall(page, "astro-devtools:project:context")) as { root?: string };
  expect(typeof context.root).toBe("string");
  expect(context.root?.length).toBeGreaterThan(0);
});

test("astro-devtools:overview:get reports the running Astro version", async () => {
  const info = (await rpcCall(page, "astro-devtools:overview:get")) as {
    astroVersion?: string;
  };
  expect(info.astroVersion).toMatch(/^\d+\.\d+\.\d+/);
});

test("astro-devtools:actions:list returns the playground's actions file and actions", async () => {
  const info = (await rpcCall(page, "astro-devtools:actions:list")) as {
    actionsFile?: string;
    actions?: { qualifiedName: string; accept?: string; input?: unknown }[];
  };
  expect(info.actionsFile).toBe("src/actions/index.ts");
  expect((info.actions ?? []).map((action) => action.qualifiedName)).toEqual([
    "greet",
    "feedback.submit",
    "survey",
    "upload",
    "likes.add",
    "users.update",
    "users.remove",
  ]);
  // likes.add lives in likes.ts, not in the entry file: metadata must reach
  // actions defined in imported files through the real astro dev server too.
  const likesAdd = (info.actions ?? []).find((action) => action.qualifiedName === "likes.add");
  expect(likesAdd?.accept).toBe("json");
  expect(likesAdd?.input).toMatchObject({ properties: { post: { type: "string" } } });
  // users is a module namespace, whose null prototype is not a plain object;
  // Astro resolves `users.update` through it, so the listing must too — and
  // with the same metadata as any other action.
  const usersUpdate = (info.actions ?? []).find(
    (action) => action.qualifiedName === "users.update",
  );
  expect(usersUpdate?.accept).toBe("json");
  expect(usersUpdate?.input).toMatchObject({ properties: { id: { type: "string" } } });
  // z.instanceof(File) has no JSON Schema form; the metadata wrapper converts
  // with `unrepresentable: "any"`, so the field survives as an empty schema
  // and accept survives alongside it — the shape that the panel's "cannot
  // be called" fallback is built on.
  const upload = (info.actions ?? []).find((action) => action.qualifiedName === "upload");
  expect(upload?.accept).toBe("form");
  expect(upload?.input).toMatchObject({ type: "object", required: ["file"] });
});

test("astro-devtools:config:get resolves the config file", async () => {
  const info = (await rpcCall(page, "astro-devtools:config:get")) as { configFile?: string };
  expect(info.configFile).toBe("astro.config.mjs");
});

test("the Routes panel mounts with the playground's routes and marks the current page", async () => {
  await switchPanel(page, "astro-devtools:routes", '[data-testid="route-row"]');
  const rows = await page.evaluate(() =>
    globalThis.__deepFind(document, '[data-testid="route-row"]').map((row) => ({
      pattern: row.querySelector('[data-testid="route-pattern"]')?.textContent?.trim() ?? "",
      current: row.getAttribute("aria-current") === "page",
    })),
  );
  expect(rows.map((row) => row.pattern)).toContain("/blog/[slug]");
  // The embedded counterpart of the standalone no-current-row check:
  // matching the page's real location against real route regexes happens
  // only here. The marking renders together with the rows, so no extra
  // polling is needed once a row exists.
  expect(rows.filter((row) => row.current).map((row) => row.pattern)).toEqual(["/"]);
});

test("the Config panel mounts with resolved-config rows", async () => {
  await switchPanel(page, "astro-devtools:config", '[data-testid="config-row"]');
  const rows = await page.evaluate(() =>
    globalThis
      .__deepFind(document, '[data-testid="config-row"]')
      .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  expect(rows.length).toBeGreaterThan(0);
  // The integrations row resolves each installed version against real
  // node_modules — the one part that summarizeConfig's unit tests have to
  // fake.
  expect(rows.join(" ")).toMatch(/astro-devtools@\d/);
});
