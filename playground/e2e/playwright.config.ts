import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

import { artifactsDir, authStatePath, e2eDir, playgroundDir } from "./support/paths.ts";

export default defineConfig({
  testDir: e2eDir,
  outputDir: path.join(artifactsDir, "test-results"),
  reporter: [[process.env.CI ? "dot" : "list"], [path.join(e2eDir, "support/cleanup-reporter.ts")]],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Unconditional so concurrency flakes reproduce identically locally and in
  // CI; capped at 2 to bound contention on the single shared dev server.
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  webServer: {
    command: "node e2e/support/start-server.ts",
    cwd: playgroundDir,
    env: { ASTRO_DEV_BACKGROUND: "0" },
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    // Vite treats port 0 as unspecified and selects the first available port
    // in its default range. Capturing the URL Astro actually prints avoids a
    // separate check-then-bind free-port helper.
    wait: { stdout: /Local\s+(?<playwright_test_base_url>http:\/\/localhost:\d+)\/?/ },
    timeout: 60_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      retries: process.env.CI ? 1 : 0,
      use: {
        ...devices["Desktop Chrome"],
        trace: "retain-on-failure",
      },
    },
    {
      name: "chromium",
      testMatch: /.*\.test\.ts/,
      dependencies: ["setup"],
      // No retries by design: a flake against the shared dev server is a real
      // race and must fail loudly. If that ever changes, prefer
      // retryStrategy: "isolated" to keep retries off the busy server.
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
        trace: "retain-on-failure",
      },
    },
  ],
});
