import type { AstroConfig } from "astro";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { detectConfigFile, summarizeConfig } from "../../src/panels/config.ts";

function fakeConfig(overrides: Record<string, unknown> = {}): AstroConfig {
  return {
    root: new URL("file:///tmp/project/"),
    srcDir: new URL("file:///tmp/project/src/"),
    publicDir: new URL("file:///tmp/project/public/"),
    outDir: new URL("file:///tmp/project/dist/"),
    output: "static",
    site: undefined,
    base: "/",
    trailingSlash: "ignore",
    build: { format: "directory" },
    adapter: undefined,
    integrations: [{ name: "astro-devtools", hooks: {} }],
    devToolbar: { enabled: true },
    ...overrides,
  } as unknown as AstroConfig;
}

const entryFor = (key: string, config: AstroConfig) =>
  summarizeConfig(config).find((entry) => entry.key === key);

describe("summarizeConfig", () => {
  it("makes directory paths relative to the project root", () => {
    const config = fakeConfig();

    expect(entryFor("srcDir", config)?.value).toBe("src");
    expect(entryFor("outDir", config)?.value).toBe("dist");
  });

  it("lists integrations with their installed versions", () => {
    const config = fakeConfig({
      integrations: [
        { name: "astro", hooks: {} },
        { name: "surely-not-an-installed-package", hooks: {} },
      ],
    });

    expect(entryFor("integrations", config)?.value).toMatch(
      /^astro@\d+\.\d+\.\d+\S*, surely-not-an-installed-package$/,
    );
  });

  it("shows a placeholder for a project without integrations", () => {
    expect(entryFor("integrations", fakeConfig({ integrations: [] }))?.value).toBe("(none)");
  });

  it("falls back to placeholders for unset values", () => {
    const config = fakeConfig();

    expect(entryFor("site", config)?.value).toBe("(not set)");
    expect(entryFor("adapter", config)?.value).toBe("(none)");
  });

  it("lists env keys without values", () => {
    const config = fakeConfig({
      env: { schema: { API_URL: {}, SECRET_TOKEN: {} } },
    });
    const entry = entryFor("env (keys only)", config);

    expect(entry?.value).toBe("API_URL, SECRET_TOKEN");
  });

  it("shows the build.format that shapes static output URLs", () => {
    expect(entryFor("build.format", fakeConfig())?.value).toBe("directory");
  });

  it("omits the i18n rows for a project without i18n", () => {
    expect(entryFor("i18n.locales", fakeConfig())).toBeUndefined();
  });

  it("summarizes the i18n config with its fallback mapping", () => {
    const config = fakeConfig({
      i18n: {
        locales: ["en", { path: "ja", codes: ["ja"] }],
        defaultLocale: "en",
        fallback: { ja: "en" },
      },
    });

    expect(entryFor("i18n.locales", config)?.value).toBe("en, ja");
    expect(entryFor("i18n.defaultLocale", config)?.value).toBe("en");
    expect(entryFor("i18n.fallback", config)?.value).toBe("ja → en (redirect)");
  });

  it("shows the i18n routing options even at their defaults", () => {
    const defaults = fakeConfig({ i18n: { locales: ["en"], defaultLocale: "en" } });

    expect(entryFor("i18n.routing", defaults)?.value).toBe(
      "prefixDefaultLocale: false, redirectToDefaultLocale: false",
    );

    const manual = fakeConfig({
      i18n: { locales: ["en"], defaultLocale: "en", routing: "manual" },
    });

    expect(entryFor("i18n.routing", manual)?.value).toBe("manual");
  });

  it("shows the resolved checkOrigin, defaulting to astro's true", () => {
    expect(entryFor("security.checkOrigin", fakeConfig())?.value).toBe("true");

    const disabled = fakeConfig({ security: { checkOrigin: false } });

    expect(entryFor("security.checkOrigin", disabled)?.value).toBe("false");
  });

  it("lists allowed image sources only when some are configured", () => {
    expect(entryFor("image.domains", fakeConfig())).toBeUndefined();
    expect(entryFor("image.remotePatterns", fakeConfig())).toBeUndefined();

    const config = fakeConfig({
      image: {
        domains: ["images.example.com", "cdn.example.com"],
        remotePatterns: [
          { protocol: "https", hostname: "**.amazonaws.com" },
          { hostname: "media.example.com", port: "8080", pathname: "/uploads/**" },
        ],
      },
    });

    expect(entryFor("image.domains", config)?.value).toBe("images.example.com, cdn.example.com");
    expect(entryFor("image.remotePatterns", config)?.value).toBe(
      "https://**.amazonaws.com, media.example.com:8080/uploads/**",
    );
  });

  it("lists only the experimental flags that are turned on", () => {
    const config = fakeConfig({
      experimental: {
        clientPrerender: true,
        contentIntellisense: false,
        collectionStorage: "single-file",
        fonts: [{ provider: "local" }],
      },
    });

    expect(entryFor("experimental (enabled)", config)?.value).toBe("clientPrerender, fonts");
  });

  it("shows a string-valued flag, with its value, once it leaves its default", () => {
    const config = fakeConfig({
      experimental: { clientPrerender: false, collectionStorage: "chunked" },
    });

    expect(entryFor("experimental (enabled)", config)?.value).toBe("collectionStorage: chunked");
  });

  it("omits the experimental row when nothing is enabled", () => {
    const config = fakeConfig({
      experimental: { clientPrerender: false, collectionStorage: "single-file" },
    });

    expect(entryFor("experimental (enabled)", config)).toBeUndefined();
  });
});

describe("detectConfigFile", () => {
  const tempDirs: string[] = [];
  const tempRoot = (files: string[]): URL => {
    const dir = mkdtempSync(path.join(tmpdir(), "astro-devtools-config-"));
    tempDirs.push(dir);
    for (const file of files) writeFileSync(path.join(dir, file), "");
    return pathToFileURL(`${dir}/`);
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("finds a lone config file regardless of its candidate rank", () => {
    // `.ts` sits mid-list, so this also proves the search does not stop
    // at the first candidate name.
    expect(detectConfigFile(tempRoot(["astro.config.ts"]))).toBe("astro.config.ts");
  });

  it("prefers the name astro itself would load first", () => {
    expect(detectConfigFile(tempRoot(["astro.config.ts", "astro.config.mjs"]))).toBe(
      "astro.config.mjs",
    );
  });

  it("returns undefined when no config file sits at a standard location", () => {
    expect(detectConfigFile(tempRoot([]))).toBeUndefined();
  });
});
