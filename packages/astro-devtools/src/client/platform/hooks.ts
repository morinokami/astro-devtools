import type { RequestResult, RequestState } from "@astro-devtools/ui";
import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { useCallback, useEffect, useState } from "preact/hooks";

import type { AstroDevtoolsRpcFunctions } from "../../types.ts";

import { onAstroPageChange } from "./page-events.ts";
import { callRpc } from "./rpc.ts";

/**
 * Fetch RPC data whenever `refreshKey` changes or `refresh` is called. A
 * completed request is ignored if a newer request has started. Previous data
 * stays available during refreshes and transient failures.
 */
export function useRpcData<Name extends keyof AstroDevtoolsRpcFunctions>(
  context: DockClientScriptContext,
  refreshKey: number,
  name: Name,
): RequestResult<AstroDevtoolsRpcFunctions[Name]> {
  type Data = AstroDevtoolsRpcFunctions[Name];
  const [state, setState] = useState<RequestState<Data>>({
    status: "loading",
    data: undefined,
    error: undefined,
  });
  const [retryKey, setRetryKey] = useState(0);
  const refresh = useCallback(() => setRetryKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({
      status: "loading",
      data: previous.data,
      error: undefined,
    }));
    callRpc(context, name).then(
      (next) => {
        if (!cancelled) setState({ status: "ready", data: next, error: undefined });
      },
      (reason: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            status: "error",
            data: previous.data,
            error: rpcError(reason),
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [context, refreshKey, name, retryKey]);

  useEffect(
    () =>
      context.connection.events.on("connection:status", (status, previous) => {
        // The initial connecting state already queues the request. Retry only
        // after recovering from a terminal connection state or an
        // authorization failure.
        if (status === "connected" && previous !== "connecting" && previous !== "connected") {
          refresh();
        }
      }),
    [context, refresh],
  );

  return { ...state, refresh };
}

/**
 * Re-render after Astro's client navigation events, so a panel that reads
 * the inspected page re-reads it while it stays open. The hook listens only
 * while `enabled` is true (the panel is page-scoped and active); activating
 * a panel already triggers a re-read via `refreshKey`.
 */
export function useRerenderOnPageChange(enabled: boolean): void {
  const [, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    return onAstroPageChange(() => setRevision((revision) => revision + 1));
  }, [enabled]);
}

/** Convert arbitrary promise rejection values into something the UI can show. */
function rpcError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason !== "") return new Error(reason);
  return new Error("Could not load data from the dev server for an unknown reason.");
}
