/**
 * The embedded dock and the Astro dev toolbar must coexist on a real page
 * without console errors — the one thing no unit test can show, and a
 * check that runs after every test in this file. Separate isolated tests
 * then look inside the real dock's shadow root: the brand logo and the group
 * accent both depend on upstream rendering of registration data (the
 * group's `icon` and `accentColor`), so only this suite can catch an
 * upstream switch to a closed shadow root — or a dock that stops
 * rendering either field.
 */
import type { Page } from "@playwright/test";

import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "./support/fixtures.ts";
import { switchPanel, waitFor } from "./support/helpers.ts";

let page: Page;
const errors: string[] = [];

interface OverviewStyleProbe {
  border: string;
  borderStyle: string;
  gradient: string;
  stopColor: string;
}

function overviewStyleProbe(target: Page): Promise<OverviewStyleProbe> {
  return target.evaluate(() => {
    const bordered = globalThis.__deepFind(document, ".border")[0];
    const gradient = globalThis.__deepFind(document, ".bg-clip-text")[0];
    const stop = globalThis.__deepFind(document, "linearGradient stop")[0];
    return {
      border: bordered ? getComputedStyle(bordered).borderTopWidth : "no .border element",
      borderStyle: bordered ? getComputedStyle(bordered).borderTopStyle : "no .border element",
      gradient: gradient ? getComputedStyle(gradient).backgroundImage : "no .bg-clip-text element",
      stopColor: stop
        ? getComputedStyle(stop).getPropertyValue("stop-color")
        : "no gradient stop element",
    };
  });
}

function waitForOverviewStyles(target: Page): Promise<OverviewStyleProbe> {
  return waitFor(
    async () => {
      const probe = await overviewStyleProbe(target);
      if (
        probe.border !== "1px" ||
        probe.borderStyle !== "solid" ||
        !probe.gradient.includes("linear-gradient") ||
        probe.stopColor !== "rgb(216, 51, 51)"
      ) {
        throw new Error(`overview styles not ready: ${JSON.stringify(probe)}`);
      }
      return probe;
    },
    { label: "the Overview panel styles to finish applying" },
  );
}

test.beforeEach(async ({ page: testPage, baseUrl }) => {
  page = testPage;
  // Collect errors from before the first navigation so nothing during
  // startup slips past the assertion.
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location().url;
    // A page without an icon makes Chrome probe /favicon.ico on its own,
    // which the dev server answers with 404.
    // That is the browser's probe, not the page erroring — nothing under
    // test requests the file — and whether its "Failed to load resource"
    // lands before the next navigation is down to timing.
    if (url.endsWith("/favicon.ico")) return;
    errors.push(url ? `${message.text()} (${url})` : message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${baseUrl}/`);
});

// Check after every test so errors raised by a panel switch or style probe
// are attributed to the test that caused them.
test.afterEach(() => {
  const seen = errors.splice(0);
  expect(seen, `console errors: ${seen.join(" | ")}`).toEqual([]);
});

test.describe("without persisted authorization", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the dock mounts next to the Astro toolbar with no console errors", async () => {
    await waitFor(
      () =>
        page.evaluate(
          () =>
            Boolean(document.querySelector("astro-dev-toolbar")) &&
            Boolean(document.querySelector("devframes-dock-embedded")),
        ),
      { label: "Astro toolbar and embedded dock mounted" },
    );
    // Both toolbars are up, but late startup work (panel imports, websocket
    // handshakes) can still throw after mount — hold the page open briefly so
    // those errors land in the list before afterEach checks it. This is the
    // suite's single fixed sleep.
    await sleep(1500);

    const mounted = await page.evaluate(() => ({
      astroToolbar: Boolean(document.querySelector("astro-dev-toolbar")),
      viteDock: Boolean(document.querySelector("devframes-dock-embedded")),
    }));
    expect(mounted).toEqual({ astroToolbar: true, viteDock: true });
  });
});

test("the real dock renders the registered branding inside its open shadow root", async () => {
  // The branding shows only for a trusted client with an Astro entry active.
  await switchPanel(page, "astro-devtools:overview", "#astro-version");
  const probe = await waitFor(
    async () => {
      const state = await page.evaluate(() => {
        const root = document.querySelector("devframes-dock-embedded")?.shadowRoot ?? null;
        const sidebar = root?.querySelector(".devframes-group-sidebar") ?? null;
        const member = (title: string) =>
          sidebar?.querySelector<HTMLElement>(`button[aria-label="${title}"]`) ?? null;
        const selected = member("Overview");
        const idle = member("Islands");
        return {
          openShadowRoot: root !== null,
          // The registered brand logo replaces the group icon in the dock.
          brandLogo: Boolean(root?.querySelector('img[src^="data:image/svg+xml"]')),
          // The dock applies the group's registered `accentColor` through
          // its stylesheet. Compare computed colors with a sibling instead
          // of pinning the ACCENT_COLOR value from `vite-plugin.ts`.
          selectedColor: selected ? getComputedStyle(selected).color : null,
          idleColor: idle ? getComputedStyle(idle).color : null,
        };
      });
      if (!state.openShadowRoot || !state.brandLogo || state.selectedColor === state.idleColor) {
        throw new Error(`dock branding not ready: ${JSON.stringify(state)}`);
      }
      return state;
    },
    { label: "the dock shadow root with branding and an accented selection" },
  );
  expect(probe.selectedColor).not.toBe(probe.idleColor);
});

test("Tailwind's custom properties resolve inside the panel shadow roots", async () => {
  // `@property` registration is document-scoped, and engines ignore the
  // rules when the compiled sheet lives in a panel's shadow tree —
  // `panel-shell.ts` compensates by un-guarding Tailwind's own
  // no-registration fallback inside the shadow sheet. If that regresses (a
  // Tailwind upgrade reshaping the `properties` layer, a resorted sheet),
  // `var(--tw-*)` stops resolving and the damage is purely visual,
  // invisible to every other test: `border` utilities compute to `0px none`
  // and gradient text turns transparent. Pin both here, where a real engine
  // computes the styles.
  await switchPanel(page, "astro-devtools:overview", "#astro-version");
  // The logo's SVG gradient can break in the same silent, visual-only way:
  // Preact writes SVG attributes as-is, so a React-style `stopColor` prop is
  // silently dropped and the stops render at their initial value, black.
  const probe = await waitForOverviewStyles(page);
  expect(probe.border).toBe("1px");
  expect(probe.borderStyle).toBe("solid");
  expect(probe.gradient).toContain("linear-gradient");
  expect(probe.stopColor).toBe("rgb(216, 51, 51)");
});

test("the panels leave the host document's CSS property registry untouched", async () => {
  // The flip side of the previous test: the panels must style themselves
  // without registering `--tw-*` on the page under inspection. A
  // document-level `@property` would silently override a host app running
  // its own Tailwind (duplicate names resolve last-wins, and adopted sheets
  // come after the host's own), so the panels must not reintroduce one —
  // through `document.adoptedStyleSheets` or any other document-level sheet.
  await switchPanel(page, "astro-devtools:overview", "#astro-version");
  await waitForOverviewStyles(page);
  const registered = await page.evaluate(() => {
    const names: string[] = [];
    const collect = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        if (rule instanceof CSSPropertyRule) names.push(rule.name);
        else if (rule instanceof CSSGroupingRule) collect(rule.cssRules);
      }
    };
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      // Cross-origin sheets throw on cssRules access; none of ours are.
      try {
        collect(sheet.cssRules);
      } catch {}
    }
    return names.filter((name) => name.startsWith("--tw-"));
  });
  expect(registered).toEqual([]);
});
