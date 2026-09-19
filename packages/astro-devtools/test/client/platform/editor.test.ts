import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { openInEditor } from "../../../src/client/platform/editor.ts";

describe("openInEditor", () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requests.length = 0;
    // The helper only ever fetches URL strings, so the stub takes them as-is.
    globalThis.fetch = ((input: string) => {
      requests.push(input);
      return Promise.resolve(new Response());
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("joins the project root onto the file for the dev server", () => {
    openInEditor("astro.config.mjs", "/home/user/project/");
    expect(requests).toEqual([
      `/__open-in-editor?file=${encodeURIComponent("/home/user/project/astro.config.mjs")}`,
    ]);
  });

  it("sends the file alone when the root is unknown", () => {
    openInEditor("src/pages/index.astro", undefined);
    expect(requests).toEqual([
      `/__open-in-editor?file=${encodeURIComponent("src/pages/index.astro")}`,
    ]);
  });

  it("swallows a rejection from a dev server that is restarting or gone", async () => {
    // In the browser an unhandled rejection here lands in the inspected
    // application's own page, and in whatever error reporting it installs.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => void rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    globalThis.fetch = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;

    openInEditor("astro.config.mjs", undefined);
    // Let the rejection settle and the unhandled-rejection check run.
    await sleep(0);
    process.off("unhandledRejection", onRejection);

    expect(rejections).toEqual([]);
  });
});
