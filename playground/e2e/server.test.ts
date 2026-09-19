import { readFile } from "node:fs/promises";

/**
 * The HTTP surfaces that the integration wires onto the dev server — checked
 * with plain fetch, no browser involved. That includes the MCP side: unit tests
 * own which RPC definitions carry `agent` metadata, but only a live dev run
 * shows devframe actually starting the loopback server, advertising it in
 * `__connection.json`, and serving the tools to a client that — like every
 * native MCP client — sends no Origin header and never sees the OTP flow.
 */
import { expect, test } from "./support/fixtures.ts";
import { serverLogPath } from "./support/paths.ts";

let base: string;

test.beforeEach(({ baseUrl }) => {
  base = baseUrl;
});

test("the dev server serves the standalone DevTools UI at /__devtools/", async () => {
  const res = await fetch(`${base}/__devtools/`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Devframes");
});

test("the integration advertises Vite client-module resolution before registering dock scripts", async () => {
  expect(await readFile(serverLogPath, "utf8")).not.toContain("[DF8111]");
});

// Each optional @vitejs/devtools-* integration (not its install launcher)
// hosts static assets at /__devtools-<name>/; a 404 here means the package
// was not picked up. favicon.svg is probed because it is the one file every
// integration ships (vitest has no index.html — its dock launches Vitest's
// own UI server instead).
for (const name of ["rolldown", "vite", "vitest", "oxc"]) {
  test(`the dev server serves the ${name} DevTools assets at /__devtools-${name}/`, async () => {
    const res = await fetch(`${base}/__devtools-${name}/favicon.svg`);
    expect(res.status).toBe(200);
  });
}

/**
 * JSON-RPC over MCP's Streamable HTTP: the server may answer a POST as
 * plain JSON or as a one-shot SSE stream, so both bodies parse here.
 */
function parseMcpMessages(contentType: string, body: string): unknown[] {
  if (contentType.includes("text/event-stream")) {
    return body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice("data:".length)) as unknown);
  }
  return body === "" ? [] : [JSON.parse(body) as unknown];
}

interface McpResponse {
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown };
}

function isMcpResponse(message: unknown): message is McpResponse {
  return typeof message === "object" && message !== null;
}

/**
 * Dial the MCP endpoint the way a native client does, through the documented
 * discovery chain: `__connection.json` names a path relative to itself on
 * the dev server, then the Streamable HTTP handshake (initialize →
 * notifications/initialized) opens the session that the returned function
 * then uses.
 */
async function connectMcp(): Promise<(method: string, params?: unknown) => Promise<unknown>> {
  const connectionUrl = `${base}/__astro-devtools/__connection.json`;
  const connection = (await (await fetch(connectionUrl)).json()) as {
    mcp?: { path?: string };
  };
  const { path } = connection.mcp ?? {};
  if (path === undefined) {
    throw new Error(`no mcp entry in __connection.json: ${JSON.stringify(connection)}`);
  }
  const endpoint = new URL(path, connectionUrl).href;
  let sessionId: string | undefined;
  let protocolVersion: string | undefined;
  let nextId = 1;

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
        ...(protocolVersion === undefined ? {} : { "mcp-protocol-version": protocolVersion }),
      },
      body: JSON.stringify(body),
    });
    sessionId = res.headers.get("mcp-session-id") ?? sessionId;
    return {
      status: res.status,
      messages: parseMcpMessages(res.headers.get("content-type") ?? "", await res.text()),
    };
  };

  const request = async (method: string, params: unknown = {}): Promise<unknown> => {
    const id = nextId++;
    const { status, messages } = await post({ jsonrpc: "2.0", id, method, params });
    const response = messages.filter(isMcpResponse).find((message) => message.id === id);
    if (response === undefined) throw new Error(`no response to ${method} (HTTP ${status})`);
    if (response.error !== undefined) {
      throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
    }
    return response.result;
  };

  const initialized = (await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "playground-e2e", version: "0.0.0" },
  })) as { protocolVersion?: string };
  protocolVersion = initialized.protocolVersion;
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

test("the dev server advertises the MCP endpoint in __connection.json", async () => {
  const res = await fetch(`${base}/__astro-devtools/__connection.json`);
  expect(res.status).toBe(200);
  const connection = (await res.json()) as { mcp?: { path?: string; port?: number } };
  expect(connection.mcp?.path).toBe("__mcp");
  expect(connection.mcp?.port).toBeUndefined();
});

test("the MCP endpoint exposes the agent-annotated queries, and only those, as tools", async () => {
  const request = await connectMcp();
  const { tools } = (await request("tools/list")) as {
    tools: {
      name: string;
      annotations?: { readOnlyHint?: boolean };
    }[];
  };
  // Colon-namespaced RPC ids appear on the MCP wire with underscores.
  // devframe may list built-ins of its own, so the test asserts membership
  // rather than the exact list.
  for (const name of [
    "astro-devtools_overview_get",
    "astro-devtools_routes_list",
    "astro-devtools_actions_list",
  ]) {
    const tool = tools.find((candidate) => candidate.name === name);
    expect(tool, `missing tool ${name}`).toBeDefined();
    expect(tool?.annotations?.readOnlyHint, `${name} readOnlyHint`).toBe(true);
  }
  // RPC functions without `agent` metadata must stay off the tool list.
  const names = tools.map((tool) => tool.name);
  expect(names).not.toContain("astro-devtools_project_context");
  expect(names).not.toContain("astro-devtools_config_get");
});

test("the MCP endpoint answers a tools/call with the running server's data", async () => {
  const request = await connectMcp();
  const result = (await request("tools/call", {
    name: "astro-devtools_overview_get",
    arguments: {},
  })) as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(result.isError ?? false).toBe(false);
  const text = result.content?.find((entry) => entry.type === "text")?.text ?? "";
  // This is the same handler that rpc.test.ts reaches over the authorized
  // websocket, so a real version here proves the MCP host serves the shared
  // definitions.
  const info = JSON.parse(text) as { astroVersion?: string };
  expect(info.astroVersion).toMatch(/^\d+\.\d+\.\d+/);
});
