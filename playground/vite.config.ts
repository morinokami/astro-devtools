import { defineConfig } from "vite-plus";

// Only Vite+ tasks live here: Astro starts Vite with `configFile: false`, so
// it never reads this file, and the e2e suite hands Playwright its own config.
export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: "astro dev",
        // `astro dev --background` (the agent workflow) exits 0 right after
        // spawning the server, and a cached exit-0 run would replay its
        // output instead of starting a server. Never cache a dev server.
        cache: false,
      },
      "e2e-browser": {
        command: process.env.CI
          ? "playwright install --with-deps --only-shell chromium"
          : "playwright install --only-shell chromium",
        // Browser binaries live outside the repository and must be checked
        // even when Vite+'s task cache is warm. CI installs the Linux system
        // dependencies through the same task so the browser target lives here.
        cache: false,
      },
      e2e: {
        command: "playwright test --config e2e/playwright.config.ts",
        // The playground resolves astro-devtools through its dist exports, so
        // an e2e run on its own could pass against a stale build.
        dependsOn: ["e2e-browser", "astro-devtools#build"],
        // A live browser suite is never worth replaying from the cache.
        cache: false,
      },
    },
  },
});
