// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";
import type { ComponentChild, FunctionComponent } from "preact";

import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { PanelProps } from "../../../src/client/platform/panel-shell.ts";

import { ActionsPanel } from "../../../src/client/features/actions/ActionsPanel.tsx";
import { ConfigPanel } from "../../../src/client/features/config/ConfigPanel.tsx";
import { OverviewPanel } from "../../../src/client/features/overview/OverviewPanel.tsx";
import { RoutesPanel } from "../../../src/client/features/routes/RoutesPanel.tsx";

/** Create a disconnected standalone context for panel-level error states. */
function failingContext(): DockClientScriptContext {
  return {
    clientType: "standalone",
    rpc: { call: vi.fn(() => Promise.reject(new Error("RPC connection lost"))) },
    connection: {
      events: { on: () => () => {} },
    },
    docks: { switchEntry: vi.fn() },
  } as unknown as DockClientScriptContext;
}

async function mount(vnode: ComponentChild): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  await act(() => render(vnode, container));
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("RPC panel states", () => {
  const panels: { label: string; errorText: string; Panel: FunctionComponent<PanelProps> }[] = [
    { label: "Config", errorText: "Could not load Astro config.", Panel: ConfigPanel },
    { label: "Routes", errorText: "Could not load routes.", Panel: RoutesPanel },
    { label: "Overview", errorText: "Could not load project overview.", Panel: OverviewPanel },
    { label: "Actions", errorText: "Could not load actions.", Panel: ActionsPanel },
  ];

  for (const { label, errorText, Panel } of panels) {
    it(`${label} shows an RPC error and retry action`, async () => {
      const container = await mount(<Panel context={failingContext()} refreshKey={1} active />);

      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(errorText);
      expect(alert?.textContent).toContain("RPC connection lost");
      expect(alert?.querySelector("button")?.textContent).toBe("Retry");
    });
  }
});
