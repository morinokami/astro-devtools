/**
 * Story-test setup and Vite+ tasks. The Storybook Vitest addon runs every
 * story as a browser-mode component test: a render smoke test, the story's
 * play assertions, and the axe audit from the project's preview annotations.
 * Every story runs once per theme, so the audit holds both halves of each
 * `light-dark()` token to the same contrast rules. Storybook's own Vite
 * builder also loads this file, which is safe because `storybookTest()`
 * disables itself outside Vitest runs.
 */

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import path from "node:path";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  plugins: [storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") })],
  // Keep hooks in the same pre-bundled Preact graph from the first browser
  // load; discovering it mid-run reloads Storybook and duplicates Preact.
  optimizeDeps: { include: ["preact/hooks"] },
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // One instance per theme. `env` reaches the preview as
      // `import.meta.env.STORYBOOK_THEME`, where it picks the default theme.
      instances: [
        { browser: "chromium", name: "storybook (light)", env: { STORYBOOK_THEME: "light" } },
        { browser: "chromium", name: "storybook (dark)", env: { STORYBOOK_THEME: "dark" } },
      ],
    },
  },
  run: {
    tasks: {
      "test-browser": {
        command: process.env.CI
          ? "playwright install --with-deps --only-shell chromium"
          : "playwright install --only-shell chromium",
        // Browser binaries live outside the repository and must be checked
        // even when Vite+'s task cache is warm.
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: ["test-browser"],
      },
    },
  },
});
