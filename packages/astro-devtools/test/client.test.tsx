// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { setTimeout as sleep } from "node:timers/promises";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import * as client from "../src/client.ts";

/**
 * Pin the `astro-devtools/client` surface to the dock scripts and exercise
 * one of them end to end: the script mounts its panel through the shared
 * shell and follows the dock's activation events.
 */

/** Create the dock events and DOM state needed by a client script. */
function fakeDock(panel: HTMLElement) {
  const listeners = new Map<string, Set<(eventData?: unknown) => void>>();
  const context = {
    clientType: "embedded",
    current: {
      domElements: { panel },
      events: {
        on: (event: string, listener: (eventData?: unknown) => void) => {
          let set = listeners.get(event);
          if (!set) {
            set = new Set();
            listeners.set(event, set);
          }
          set.add(listener);
          return () => set.delete(listener);
        },
      },
    },
  };
  return {
    context: context as unknown as DockClientScriptContext,
    emit: (event: string, eventData?: unknown): void => {
      for (const listener of listeners.get(event) ?? []) listener(eventData);
    },
  };
}

function panelElement(): HTMLElement {
  const panel = document.createElement("div");
  document.body.append(panel);
  return panel;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("client entry", () => {
  it("exports exactly the scripts the dock entries import", () => {
    // The names registered by `vite-plugin.ts`: the overview entry imports
    // the default export, the other four their `importName`. Anything else
    // here would ship as public API of `astro-devtools/client`.
    expect(Object.keys(client).sort()).toEqual([
      "actions",
      "config",
      "default",
      "islands",
      "routes",
    ]);
  });
});

describe("islands entry", () => {
  /** Count PerformanceObserver connections in happy-dom. */
  class TestPerformanceObserver {
    static connected = 0;
    observe(): void {
      TestPerformanceObserver.connected += 1;
    }
    disconnect(): void {
      TestPerformanceObserver.connected -= 1;
    }
  }

  it("disconnects page observers while inactive and rescans on reactivation", async () => {
    TestPerformanceObserver.connected = 0;
    vi.stubGlobal("PerformanceObserver", TestPerformanceObserver);

    const panel = panelElement();
    const dock = fakeDock(panel);
    await act(() => {
      client.islands(dock.context);
    });
    const content = panel.firstElementChild?.shadowRoot;
    expect(content?.textContent).toContain("No islands on this page");
    expect(content?.querySelector('[role="status"]')?.textContent).toBe(
      "No islands detected on this page.",
    );
    expect(TestPerformanceObserver.connected).toBe(1);

    // A page-side trigger while active rescans: the island becomes a row.
    const island = document.createElement("astro-island");
    // happy-dom lays out nothing, so hand the overlay a box to frame.
    island.getBoundingClientRect = () => new DOMRect(10, 10, 100, 40);
    document.body.append(island);
    await act(async () => {
      document.dispatchEvent(new Event("astro:page-load"));
      // The shared inventory coalesces triggers into one scan per microtask.
      await sleep();
    });
    expect(content?.textContent).toContain("1 client island");
    expect(content?.querySelector('[role="status"]')?.textContent).toBe(
      "1 of 1 client island hydrated.",
    );

    // Hovering the row draws the highlight over the island on the page.
    const row = content?.querySelector('[data-testid="island-row"]');
    await act(() => {
      row?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    });
    const highlight = document.querySelector("astro-devtools-highlight") as HTMLElement;
    expect(highlight.style.display).toBe("block");

    // Deactivation removes observers and the page highlight.
    await act(() => {
      dock.emit("entry:deactivated");
    });
    expect(highlight.style.display).toBe("none");
    expect(TestPerformanceObserver.connected).toBe(0);

    // Hidden panels do not respond to page events.
    document.body.append(document.createElement("astro-island"));
    await act(async () => {
      document.dispatchEvent(new Event("astro:page-load"));
      await sleep();
    });
    expect(content?.textContent).toContain("1 client island");

    // Reactivation reconnects and scans the current page.
    await act(() => {
      dock.emit("entry:activated");
    });
    expect(content?.textContent).toContain("2 client islands");
    expect(TestPerformanceObserver.connected).toBe(1);
  });
});
