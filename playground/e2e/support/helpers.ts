import type { Page } from "@playwright/test";

import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

interface DockEntry {
  id: string;
  groupId?: string;
  type?: string;
  url?: string;
}

interface DevtoolsClientContext {
  docks: {
    entries: DockEntry[] | { value?: DockEntry[] };
    switchEntry: (id?: string | null) => Promise<boolean>;
  };
  rpc: {
    call: (name: string, ...args: unknown[]) => Promise<unknown>;
    /** Whether the dev server has marked this connection trusted. */
    isTrusted: boolean;
  };
}

declare global {
  // Browser-side globals reached from page.evaluate callbacks.
  var __deepFind: (root: ParentNode, selector: string) => Element[];
  var __DEVFRAME_HUB_CLIENT_CONTEXT__: DevtoolsClientContext | undefined;
}

export async function installDeepFind(page: Page): Promise<void> {
  // Define the helper once inside the page: page.evaluate serializes each
  // callback into the page on its own, so sharing has to happen inside the
  // page itself rather than by closing over one Node-side copy.
  await page.addInitScript(() => {
    const deepFind = (root: ParentNode, selector: string, results: Element[] = []): Element[] => {
      for (const element of root.querySelectorAll("*")) {
        if (element.matches(selector)) results.push(element);
        if (element.shadowRoot) deepFind(element.shadowRoot, selector, results);
      }
      return results;
    };
    globalThis.__deepFind = deepFind;
  });
}

export async function waitFor<T>(
  fn: () => Promise<T> | T,
  {
    timeoutMs = 15_000,
    intervalMs = 250,
    label,
  }: { timeoutMs?: number; intervalMs?: number; label: string },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      const reason = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
      const detail = lastError === undefined ? "" : ` (last error: ${reason})`;
      throw new Error(`Timed out waiting for ${label}${detail}`);
    }
    await sleep(intervalMs);
  }
}

/**
 * Return the dock entries list, normalized in-page: the kit types
 * docks.entries as a plain array; the ref shape is kept as a fallback in
 * case upstream drifts.
 */
export function dockEntries(page: Page): Promise<DockEntry[]> {
  return page.evaluate(() => {
    const raw = globalThis.__DEVFRAME_HUB_CLIENT_CONTEXT__?.docks.entries;
    return Array.isArray(raw) ? raw : (raw?.value ?? []);
  });
}

/** Whether the page's DevTools client is trusted by the dev server. */
export function isTrusted(page: Page): Promise<boolean> {
  return (
    page
      .evaluate(() => globalThis.__DEVFRAME_HUB_CLIENT_CONTEXT__?.rpc.isTrusted === true)
      // A page whose execution context is gone mid-navigation is not trusted.
      .catch(() => false)
  );
}

async function authorizeOnce(page: Page, base: string, logPath: string): Promise<void> {
  // The banner prints on demand: the standalone UI's auth notice asks the
  // server for a code as soon as it mounts (this visit covers a log that
  // holds no code yet), and every rotation — exchange, expiry, five failed
  // attempts — re-prints it, so the newest code in the log is always the
  // current one: take it right away. Waiting for a code printed after this
  // point would be pointless, since the current code's banner already
  // predates this visit.
  await page.goto(`${base}/__devtools/`);
  const otp = await waitFor(
    async () => [...(await readFile(logPath, "utf8")).matchAll(/devframe_otp=(\d+)/g)].at(-1)?.[1],
    { label: "the devframe OTP in the dev server log" },
  );
  // The code is passed in the URL fragment so it never reaches server logs.
  await page.goto(`${base}/#devframe_otp=${otp}`);
  // Untrusted clients also receive the client-local `~settings` dock entry,
  // so a populated entries list proves nothing; ask the client itself.
  await waitFor(() => isTrusted(page), { label: "a trusted DevTools client context" });
}

/**
 * Custom RPC functions and the dock state are only available to trusted
 * clients. The dev server prints a one-time code (as part of a magic link)
 * to its output; visiting the magic link exchanges the code for a bearer
 * token the browser persists, so a page that is already trusted needs
 * nothing.
 */
export async function authorize(page: Page, base: string, logPath: string): Promise<void> {
  if (await isTrusted(page)) return;
  try {
    await authorizeOnce(page, base, logPath);
  } catch (firstError) {
    // A code expires five minutes after its rotation. The failed exchange
    // rotates it and prints the replacement, so a second pass picks up a
    // valid code. (A single wrong code rotates nothing, so that case fails
    // the same way twice.)
    try {
      await authorizeOnce(page, base, logPath);
    } catch (secondError) {
      throw new AggregateError(
        [firstError, secondError],
        "DevTools authorization failed on both attempts",
      );
    }
  }
}

function evaluateRpcCall(page: Page, name: string, timeoutMs: number): Promise<unknown> {
  return page.evaluate(
    ([rpcName, timeout]) => {
      const ctx = globalThis.__DEVFRAME_HUB_CLIENT_CONTEXT__;
      if (!ctx) throw new Error("no DevTools client context");
      return Promise.race([
        ctx.rpc.call(rpcName),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`rpc timeout: ${rpcName}`)), timeout);
        }),
      ]);
    },
    [name, timeoutMs] as const,
  );
}

/** Call an idempotent RPC query, retrying once across a Vite page reload. */
export async function rpcCall(page: Page, name: string, timeoutMs = 10_000): Promise<unknown> {
  try {
    return await evaluateRpcCall(page, name, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Execution context was destroyed")) throw error;

    // A cold dev server can finish a Vite-triggered navigation after the
    // trusted-client barrier. All callers are read-only queries, so wait for
    // the replacement page to reconnect and retry the interrupted query once.
    await waitFor(() => isTrusted(page), {
      timeoutMs,
      label: `the DevTools client to reconnect before retrying ${name}`,
    });
    return evaluateRpcCall(page, name, timeoutMs);
  }
}

export async function switchEntry(page: Page, entryId: string): Promise<void> {
  // Right after a navigation the client context exists but its entries list
  // is still filling over the websocket; switchEntry returns false for an
  // unknown id, so retry the switch until the entry has registered.
  await waitFor(
    () =>
      page.evaluate((id) => {
        const ctx = globalThis.__DEVFRAME_HUB_CLIENT_CONTEXT__;
        if (!ctx) throw new Error("no DevTools client context");
        return ctx.docks.switchEntry(id);
      }, entryId),
    { label: `switchEntry(${entryId}) to succeed` },
  );
}

export async function switchPanel(
  page: Page,
  entryId: string,
  readySelector: string,
): Promise<void> {
  await switchEntry(page, entryId);
  // Playwright locators pierce open shadow roots, so panel readiness no
  // longer needs a browser-side recursive selector walk.
  try {
    await page.locator(readySelector).first().waitFor({ state: "attached", timeout: 15_000 });
  } catch (error) {
    throw new Error(
      `Panel ${entryId} did not attach ${JSON.stringify(readySelector)} within 15 seconds`,
      { cause: error },
    );
  }
}
