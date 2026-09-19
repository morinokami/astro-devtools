import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

/** Whether this dock is embedded in the inspected page rather than the standalone UI. */
export function isPageScoped(context: DockClientScriptContext): boolean {
  return context.clientType !== "standalone";
}
