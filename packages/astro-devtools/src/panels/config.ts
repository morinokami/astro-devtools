import type { AstroConfig, RemotePattern } from "astro";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ConfigEntry } from "../types.ts";

import { detectPackageVersion } from "../package-info.ts";
import { toI18nInfo } from "./routes.ts";

/** Summarize resolved settings without exposing environment variable values. */
export function summarizeConfig(config: AstroConfig): ConfigEntry[] {
  const entries: ConfigEntry[] = [
    { key: "root", value: fileURLToPath(config.root) },
    { key: "srcDir", value: relativeToRoot(config.root, config.srcDir) },
    { key: "publicDir", value: relativeToRoot(config.root, config.publicDir) },
    { key: "outDir", value: relativeToRoot(config.root, config.outDir) },
    { key: "site", value: config.site ?? "(not set)" },
    { key: "base", value: config.base },
    { key: "trailingSlash", value: config.trailingSlash },
    // Keep related URL and server-output settings next to each other.
    { key: "build.format", value: config.build.format },
    { key: "output", value: config.output },
    { key: "adapter", value: config.adapter?.name ?? "(none)" },
    {
      // Include an installed version when the integration name resolves to a package.
      key: "integrations",
      value:
        config.integrations.length === 0
          ? "(none)"
          : config.integrations
              .map((integration) => {
                const version = detectPackageVersion(integration.name, config.root);
                return version ? `${integration.name}@${version}` : integration.name;
              })
              .join(", "),
    },
  ];

  const i18n = toI18nInfo(config.i18n);
  if (i18n) {
    entries.push({ key: "i18n.locales", value: i18n.locales.join(", ") });
    entries.push({ key: "i18n.defaultLocale", value: i18n.defaultLocale });
    // These routing options affect locale URL paths even at their default values.
    entries.push({
      key: "i18n.routing",
      value: i18n.manualRouting
        ? "manual"
        : `prefixDefaultLocale: ${i18n.prefixDefaultLocale}, redirectToDefaultLocale: ${i18n.redirectToDefaultLocale}`,
    });
    const fallbacks = Object.entries(i18n.fallback ?? {});
    if (fallbacks.length > 0) {
      entries.push({
        key: "i18n.fallback",
        value: `${fallbacks.map(([from, to]) => `${from} → ${to}`).join(", ")} (${i18n.fallbackType})`,
      });
    }
  }

  // Astro defaults this setting to true.
  entries.push({
    key: "security.checkOrigin",
    value: String(config.security?.checkOrigin ?? true),
  });

  /** Append a comma-separated entry, or nothing at all when the list is empty. */
  const pushList = (key: string, values: string[]): void => {
    if (values.length > 0) entries.push({ key, value: values.join(", ") });
  };
  pushList("image.domains", config.image?.domains ?? []);
  pushList("image.remotePatterns", (config.image?.remotePatterns ?? []).map(formatRemotePattern));

  entries.push({ key: "devToolbar.enabled", value: String(config.devToolbar.enabled) });

  pushList("env (keys only)", Object.keys(config.env?.schema ?? {}));
  pushList("experimental (enabled)", enabledExperimentalFlags(config.experimental));

  return entries;
}

function relativeToRoot(root: URL, dir: URL): string {
  const relative = path.relative(fileURLToPath(root), fileURLToPath(dir));
  return relative === "" ? "." : relative;
}

/** Format an image remote pattern as a compact URL-like string. */
function formatRemotePattern(pattern: RemotePattern): string {
  const protocol = pattern.protocol ? `${pattern.protocol}://` : "";
  const port = pattern.port ? `:${pattern.port}` : "";
  return `${protocol}${pattern.hostname ?? "**"}${port}${pattern.pathname ?? ""}`;
}

/**
 * String-valued flags Astro fills into every resolved config; a flag still
 * at its default was not enabled by the user.
 */
const EXPERIMENTAL_STRING_DEFAULTS: Record<string, string> = {
  collectionStorage: "single-file",
};

/** Return the experimental flags that are enabled: `true`, a non-default string choice, or non-empty options. */
function enabledExperimentalFlags(experimental: object | undefined): string[] {
  return Object.entries(experimental ?? {})
    .filter(([key, value]) => {
      if (value === true) return true;
      if (typeof value === "string") {
        return value !== "" && value !== EXPERIMENTAL_STRING_DEFAULTS[key];
      }
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object" && value !== null) return Object.keys(value).length > 0;
      return false;
    })
    .map(([key, value]) => (typeof value === "string" ? `${key}: ${value}` : key));
}

/** Config file names in Astro's search order. */
const CONFIG_FILE_NAMES = [
  "astro.config.mjs",
  "astro.config.js",
  "astro.config.ts",
  "astro.config.mts",
];

/**
 * Find the first standard Astro config file in the project root;
 * `recordProjectInfo` stores it as `configFile` for the Config panel's
 * editor link.
 */
export function detectConfigFile(root: URL): string | undefined {
  return CONFIG_FILE_NAMES.find((name) => existsSync(new URL(name, root)));
}
