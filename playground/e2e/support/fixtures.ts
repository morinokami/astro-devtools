import { expect, test as base } from "@playwright/test";

import { installDeepFind } from "./helpers.ts";

interface Fixtures {
  /** A non-optional view of Playwright's dynamic built-in baseURL fixture. */
  baseUrl: string;
}

/**
 * The dock fetches its `<collection>:<name>` icons from api.iconify.design
 * while it renders. A CI runner's shared egress gets rate-limited there
 * (an error response without CORS headers, logged as a console error by
 * every icon on the page) and an offline machine cannot reach it at all;
 * neither says anything about the code under test, and the dock tests
 * assert an error-free console. Every page therefore answers those
 * requests itself with a plain square: icons are upstream assets, not
 * what this suite proves.
 */
const ICONIFY_API_URL = "https://api.iconify.design/**";
const STUB_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<rect width="24" height="24" fill="currentColor"/></svg>';

export const test = base.extend<Fixtures>({
  baseUrl: async ({ baseURL }, use) => {
    const baseUrl = baseURL?.replace(/\/$/, "");
    if (baseUrl === undefined) {
      throw new Error("baseURL was not captured from the Astro dev server output");
    }
    await use(baseUrl);
  },
  page: async ({ page }, use) => {
    await page.route(ICONIFY_API_URL, (route) =>
      route.fulfill({ contentType: "image/svg+xml", body: STUB_ICON_SVG }),
    );
    await installDeepFind(page);
    await use(page);
  },
});

export { expect };
