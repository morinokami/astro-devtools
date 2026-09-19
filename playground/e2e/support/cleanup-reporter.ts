import type { FullResult, Reporter } from "@playwright/test/reporter";

import { rm } from "node:fs/promises";

import { artifactsDir } from "./paths.ts";

export default class CleanupReporter implements Reporter {
  private runPassed = false;

  onEnd(result: FullResult): void {
    this.runPassed = result.status === "passed";
  }

  async onExit(): Promise<void> {
    if (!this.runPassed) return;
    // onExit runs after every reporter has completed onEnd, including
    // Playwright's internal writer for test-results/.last-run.json.
    await rm(artifactsDir, { recursive: true, force: true });
  }

  printsToStdio(): boolean {
    return false;
  }
}
