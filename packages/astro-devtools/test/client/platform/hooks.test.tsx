// @vitest-environment happy-dom

import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ConfigInfo } from "../../../src/types.ts";

import { useRpcData } from "../../../src/client/platform/hooks.ts";

/** Provide only the RPC and connection surfaces used by the hook. */
function fakeContext(call: (name: string) => Promise<unknown>) {
  type ConnectionListener = (status: string, previous: string) => void;
  const connectionListeners = new Set<ConnectionListener>();
  const context = {
    rpc: { call },
    connection: {
      events: {
        on: (event: string, listener: ConnectionListener) => {
          if (event === "connection:status") connectionListeners.add(listener);
          return () => connectionListeners.delete(listener);
        },
      },
    },
  } as unknown as DockClientScriptContext;
  return {
    context,
    emitConnection: (status: string, previous: string): void => {
      for (const listener of connectionListeners) listener(status, previous);
    },
    connectionListeners,
  };
}

function HookView({
  context,
  refreshKey,
}: {
  context: DockClientScriptContext;
  refreshKey: number;
}) {
  const result = useRpcData(context, refreshKey, "astro-devtools:config:get");
  return (
    <div data-status={result.status} data-file={result.data?.configFile ?? ""}>
      <span>{result.error?.message}</span>
      <button type="button" onClick={result.refresh}>
        Refresh
      </button>
    </div>
  );
}

function configInfo(configFile: string): ConfigInfo {
  return { configFile, entries: [] };
}

function status(container: HTMLElement): string | undefined {
  return container.firstElementChild?.getAttribute("data-status") ?? undefined;
}

function file(container: HTMLElement): string | undefined {
  return container.firstElementChild?.getAttribute("data-file") ?? undefined;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useRpcData", () => {
  it("moves from loading to ready", async () => {
    const request = Promise.withResolvers<ConfigInfo>();
    const call = vi.fn(() => request.promise);
    const dock = fakeContext(call);
    const container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<HookView context={dock.context} refreshKey={1} />, container));
    expect(status(container)).toBe("loading");
    expect(call).toHaveBeenCalledWith("astro-devtools:config:get");

    await act(async () => request.resolve(configInfo("astro.config.mjs")));
    expect(status(container)).toBe("ready");
    expect(file(container)).toBe("astro.config.mjs");
  });

  it("exposes failures and retries while retaining previous data", async () => {
    const initial = Promise.withResolvers<ConfigInfo>();
    const failedRefresh = Promise.withResolvers<ConfigInfo>();
    const successfulRetry = Promise.withResolvers<ConfigInfo>();
    const call = vi
      .fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => failedRefresh.promise)
      .mockImplementationOnce(() => successfulRetry.promise);
    const dock = fakeContext(call);
    const container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<HookView context={dock.context} refreshKey={1} />, container));
    await act(async () => initial.resolve(configInfo("old.config.mjs")));

    await act(() => container.querySelector("button")?.click());
    expect(status(container)).toBe("loading");
    expect(file(container)).toBe("old.config.mjs");

    await act(async () => failedRefresh.reject("connection lost"));
    expect(status(container)).toBe("error");
    expect(file(container)).toBe("old.config.mjs");
    expect(container.textContent).toContain("connection lost");

    await act(() => container.querySelector("button")?.click());
    expect(call).toHaveBeenCalledTimes(3);
    await act(async () => successfulRetry.resolve(configInfo("new.config.mjs")));
    expect(status(container)).toBe("ready");
    expect(file(container)).toBe("new.config.mjs");
  });

  it("ignores an older request after the refresh key changes", async () => {
    const older = Promise.withResolvers<ConfigInfo>();
    const newer = Promise.withResolvers<ConfigInfo>();
    const call = vi
      .fn()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const dock = fakeContext(call);
    const container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<HookView context={dock.context} refreshKey={1} />, container));
    await act(() => render(<HookView context={dock.context} refreshKey={2} />, container));
    await act(async () => newer.resolve(configInfo("newer.config.mjs")));
    await act(async () => older.resolve(configInfo("older.config.mjs")));

    expect(status(container)).toBe("ready");
    expect(file(container)).toBe("newer.config.mjs");
  });

  it("retries after the RPC connection recovers", async () => {
    const failure = Promise.withResolvers<ConfigInfo>();
    const retry = Promise.withResolvers<ConfigInfo>();
    const call = vi
      .fn()
      .mockImplementationOnce(() => failure.promise)
      .mockImplementationOnce(() => retry.promise);
    const dock = fakeContext(call);
    const container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<HookView context={dock.context} refreshKey={1} />, container));
    await act(async () => failure.reject(new Error("disconnected")));
    expect(status(container)).toBe("error");

    await act(() => dock.emitConnection("connected", "disconnected"));
    expect(status(container)).toBe("loading");
    expect(call).toHaveBeenCalledTimes(2);

    await act(async () => retry.resolve(configInfo("recovered.config.mjs")));
    expect(status(container)).toBe("ready");

    await act(() => render(null, container));
    expect(dock.connectionListeners.size).toBe(0);
  });

  it("does not duplicate the initial request when connecting completes", async () => {
    const request = Promise.withResolvers<ConfigInfo>();
    const call = vi.fn(() => request.promise);
    const dock = fakeContext(call);
    const container = document.createElement("div");
    document.body.append(container);

    await act(() => render(<HookView context={dock.context} refreshKey={1} />, container));
    await act(() => dock.emitConnection("connected", "connecting"));

    expect(call).toHaveBeenCalledTimes(1);
  });
});
