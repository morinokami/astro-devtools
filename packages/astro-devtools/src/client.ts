import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { ActionsPanel } from "./client/features/actions/ActionsPanel.tsx";
import { ConfigPanel } from "./client/features/config/ConfigPanel.tsx";
import { IslandsPanel } from "./client/features/islands/IslandsPanel.tsx";
import { OverviewPanel } from "./client/features/overview/OverviewPanel.tsx";
import { RoutesPanel } from "./client/features/routes/RoutesPanel.tsx";
import { setupPanel } from "./client/platform/panel-shell.ts";

/**
 * Client entry points for the five Astro dock panels. This is the
 * `astro-devtools/client` package entry that Vite DevTools imports, so it
 * exports nothing but the dock scripts; the shared mount lifecycle lives in
 * `client/platform/panel-shell.ts`.
 */

/** Client script for the `astro-devtools:overview` dock entry. */
export default function setupOverviewPanel(context: DockClientScriptContext): void {
  setupPanel(context, OverviewPanel);
}

/** Client script for the `astro-devtools:islands` dock entry. */
export function islands(context: DockClientScriptContext): void {
  setupPanel(context, IslandsPanel);
}

/** Client script for the `astro-devtools:routes` dock entry. */
export function routes(context: DockClientScriptContext): void {
  setupPanel(context, RoutesPanel);
}

/** Client script for the `astro-devtools:actions` dock entry. */
export function actions(context: DockClientScriptContext): void {
  setupPanel(context, ActionsPanel);
}

/** Client script for the `astro-devtools:config` dock entry. */
export function config(context: DockClientScriptContext): void {
  setupPanel(context, ConfigPanel);
}
