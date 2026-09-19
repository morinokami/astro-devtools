/**
 * Prove the MCP bind-address gate after real Astro and Vite configuration
 * hooks. Each server owns a temporary project with no private metadata;
 * discovery and RPC transports must stay absent when a later hook exposes
 * the server without an explicit MCP opt-in. Vite DevTools is switched off
 * through `vite.devtools`, which also proves the MCP endpoint stands on its
 * own without the DevTools host.
 */
import { expect, test } from "@playwright/test";
import { dev } from "astro";
import astroDevtools from "astro-devtools";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { artifactsDir } from "./support/paths.ts";

for (const scenario of [
  {
    name: "later Astro integration exposes the host",
    initialHost: false,
    host: true,
    mcp: undefined,
    enabled: false,
  },
  {
    name: "later Vite config hook exposes the host",
    initialHost: false,
    host: true,
    mcp: undefined,
    enabled: false,
    viteHook: true,
  },
  {
    name: "later integration restores loopback",
    initialHost: true,
    host: false,
    mcp: undefined,
    enabled: true,
  },
  {
    name: "explicit opt-in permits a network host",
    initialHost: false,
    host: true,
    mcp: true,
    enabled: true,
  },
  {
    name: "explicit opt-out disables loopback MCP",
    initialHost: false,
    host: false,
    mcp: false,
    enabled: false,
  },
]) {
  test(`MCP host gate: ${scenario.name}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "astro-devtools-mcp-host-"));
    let server: Awaited<ReturnType<typeof dev>> | undefined;
    try {
      await symlink(
        path.join(import.meta.dirname, "../node_modules"),
        path.join(root, "node_modules"),
        "junction",
      );
      await mkdir(path.join(root, "src/pages"), { recursive: true });
      await writeFile(path.join(root, "src/pages/index.astro"), "<h1>MCP host test</h1>");
      server = await dev({
        root,
        configFile: false,
        logLevel: "silent",
        server: { host: scenario.initialHost, port: 0 },
        vite: {
          devtools: false,
          // Vite's dependency optimizer keeps writing `deps_temp_*` for a few
          // milliseconds after `server.stop()` resolves. With the default
          // `<root>/node_modules/.vite` those late writes recreate
          // `node_modules` under the root being removed (ENOTEMPTY) or, while
          // the symlink still exists, pile up in the playground's own cache.
          cacheDir: path.join(artifactsDir, "mcp-host-vite-cache", path.basename(root)),
        },
        integrations: [
          astroDevtools({ inject: false, mcp: scenario.mcp }),
          {
            name: "late-host-change",
            hooks: {
              "astro:config:setup": ({ updateConfig }) => {
                updateConfig(
                  scenario.viteHook
                    ? {
                        vite: {
                          plugins: [
                            {
                              name: "late-vite-host-change",
                              config: () => ({ server: { host: scenario.host } }),
                            },
                          ],
                        },
                      }
                    : { server: { host: scenario.host } },
                );
              },
            },
          },
        ],
      });
      const base = `http://localhost:${server.address.port}`;
      const discovery = await fetch(`${base}/__astro-devtools/__connection.json`);
      expect(discovery.status).toBe(scenario.enabled ? 200 : 404);
      if (scenario.enabled) {
        expect(await discovery.json()).toMatchObject({ mcp: { path: "__mcp" } });
      } else {
        for (const endpoint of ["__mcp", "__sse", "__ws"]) {
          const response = await fetch(`${base}/__astro-devtools/${endpoint}`);
          expect(response.status).toBe(404);
        }
      }
    } finally {
      await server?.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
}
