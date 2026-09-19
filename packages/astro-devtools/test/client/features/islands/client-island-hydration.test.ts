// @vitest-environment happy-dom

/** Failures belong to DOM instances, survive separate bundles, and clear on recovery. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { installClientIslandHydrationTracking } from "../../../../src/client/features/islands/client-island-hydration.ts";
import { scanIslands } from "../../../../src/client/features/islands/islands.ts";

function appendIsland(): HTMLElement {
  const element = document.createElement("astro-island");
  element.setAttribute("ssr", "");
  element.setAttribute("component-url", "/src/components/Counter.tsx");
  document.body.append(element);
  return element;
}

function fail(element: Element): Event {
  const event = new CustomEvent("astro:hydration-error", {
    bubbles: true,
    composed: true,
    cancelable: true,
    detail: {
      error: new Error("Hydration failed"),
      componentUrl: element.getAttribute("component-url"),
    },
  });
  element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("client island hydration tracking", () => {
  it("retains a failure before the panel bundle loads, without cancelling Astro's error", async () => {
    installClientIslandHydrationTracking();
    const element = appendIsland();
    const event = fail(element);
    // A second installation must keep already recorded failures.
    installClientIslandHydrationTracking();
    // inject.ts and client.ts each have their own copy of the tracker module.
    vi.resetModules();
    const { scanIslands: scanFromPanelBundle } =
      await import("../../../../src/client/features/islands/islands.ts");

    expect(scanFromPanelBundle(document)[0]?.state).toBe("failed");
    expect(element.hasAttribute("ssr")).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("marks only the event's island even when nested islands share a component URL", () => {
    installClientIslandHydrationTracking();
    const parent = appendIsland();
    const child = appendIsland();
    parent.append(child);
    const ids = scanIslands(document).map((island) => island.id);
    fail(child);

    expect(scanIslands(document).map((island) => island.state)).toEqual(["pending", "failed"]);
    expect(scanIslands(document).map((island) => island.id)).toEqual(ids);
    fail(document.body);
    expect(scanIslands(document).map((island) => island.state)).toEqual(["pending", "failed"]);
  });

  it("keeps persisted failures through a body swap without marking replacement instances", () => {
    installClientIslandHydrationTracking();
    const persisted = appendIsland();
    fail(persisted);
    const newBody = document.createElement("body");
    newBody.append(persisted);
    document.body.replaceWith(newBody);
    document.dispatchEvent(new Event("astro:after-swap"));
    const replacement = appendIsland();

    expect(scanIslands(document).map((island) => island.state)).toEqual(["failed", "pending"]);
    fail(replacement);
    expect(scanIslands(document).map((island) => island.state)).toEqual(["failed", "failed"]);
  });

  it("clears a failure when a retry succeeds, including the non-bubbling hydrate event", () => {
    installClientIslandHydrationTracking();
    const element = appendIsland();
    fail(element);
    element.removeAttribute("ssr");
    expect(scanIslands(document)[0]?.state).toBe("hydrated");
    element.dispatchEvent(new CustomEvent("astro:hydrate"));
    // If this same element starts hydration again, its old failure is gone.
    element.setAttribute("ssr", "");
    expect(scanIslands(document)[0]?.state).toBe("pending");
  });
});
