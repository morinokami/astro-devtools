// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { hideHighlight, showHighlight } from "../../../src/client/platform/overlay.ts";

/** The highlight lives in the page document, outside every shadow root. */
const HIGHLIGHT_TAG = "astro-devtools-highlight";

/** happy-dom lays nothing out, so a target reports whatever box it is given. */
function createTarget(rect = { top: 30, left: 40, width: 100, height: 50 }): HTMLElement {
  const target = document.createElement("div");
  target.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(target);
  return target;
}

const highlight = (): HTMLElement | null => document.querySelector(HIGHLIGHT_TAG);

afterEach(() => {
  hideHighlight();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("showHighlight", () => {
  it("draws the highlight with padding around the target's box", () => {
    showHighlight(createTarget({ top: 30, left: 40, width: 100, height: 50 }));
    const element = highlight();
    expect(element?.isConnected).toBe(true);
    expect(element?.style.display).toBe("block");
    expect(element?.style.top).toBe("20px");
    expect(element?.style.left).toBe("30px");
    expect(element?.style.width).toBe("115px");
    expect(element?.style.height).toBe("65px");
  });

  it("hides the highlight in place instead of removing it", () => {
    showHighlight(createTarget());
    hideHighlight();
    const element = highlight();
    expect(element?.isConnected).toBe(true);
    expect(element?.style.display).toBe("none");
  });

  it("follows the target when the page scrolls or resizes", () => {
    const rect = { top: 30, left: 40, width: 100, height: 50 };
    showHighlight(createTarget(rect));
    expect(highlight()?.style.top).toBe("20px");

    rect.top = 130;
    window.dispatchEvent(new Event("scroll"));
    expect(highlight()?.style.top).toBe("120px");

    rect.left = 140;
    window.dispatchEvent(new Event("resize"));
    expect(highlight()?.style.left).toBe("130px");
  });

  it("tracks the newest target when a row re-shows without hiding first", () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const second = { top: 230, left: 40, width: 100, height: 50 };
    showHighlight(createTarget({ top: 30, left: 40, width: 100, height: 50 }));
    showHighlight(createTarget(second));
    expect(highlight()?.style.top).toBe("220px");

    // The pointer crossing a row's children re-shows once per boundary; the
    // page listeners are registered once for the whole visible stretch.
    expect(addListener.mock.calls.map(([type]) => type)).toEqual(["scroll", "resize"]);
    second.top = 330;
    window.dispatchEvent(new Event("scroll"));
    expect(highlight()?.style.top).toBe("320px");
  });

  it("stops tracking the target once hidden", () => {
    const target = createTarget();
    showHighlight(target);
    hideHighlight();
    const measure = vi.fn(() => ({ top: 30, left: 40, width: 100, height: 50 }) as DOMRect);
    target.getBoundingClientRect = measure;

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(measure).not.toHaveBeenCalled();
    expect(highlight()?.style.display).toBe("none");
  });

  it("remounts the highlight after a view transition replaces the body element", () => {
    showHighlight(createTarget());
    const before = highlight();
    expect(before?.isConnected).toBe(true);

    // Astro view transitions swap in a whole new body element, stranding
    // anything mounted in the old one; the swap event only hides the highlight.
    const newBody = document.createElement("body");
    document.body.replaceWith(newBody);
    document.dispatchEvent(new Event("astro:after-swap"));
    expect(before?.isConnected).toBe(false);
    expect(before?.style.display).toBe("none");

    showHighlight(createTarget());
    const after = highlight();
    expect(after?.isConnected).toBe(true);
    expect(after?.style.display).toBe("block");
  });
});
