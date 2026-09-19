// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vite-plus/test";

import { onAstroPageChange } from "../../../src/client/platform/page-events.ts";

describe("onAstroPageChange", () => {
  it("invokes the listener after a swap and after a page load", () => {
    const listener = vi.fn();
    const stop = onAstroPageChange(listener);
    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops invoking the listener once unsubscribed", () => {
    const listener = vi.fn();
    const stop = onAstroPageChange(listener);
    stop();
    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));
    expect(listener).not.toHaveBeenCalled();
  });
});
