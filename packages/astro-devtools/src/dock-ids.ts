/**
 * Id of the dock group that collects the Astro panels. Published through
 * `astro-devtools/kit`: third-party extensions join the group by setting
 * `groupId` to this value on their own dock entries.
 */
export const ASTRO_DOCK_GROUP_ID = "astro";

/** Dock entry IDs in display order: the Preact panels, then the Docs iframe. */
export const ASTRO_DOCK_ENTRY_IDS = {
  overview: "astro-devtools:overview",
  islands: "astro-devtools:islands",
  routes: "astro-devtools:routes",
  actions: "astro-devtools:actions",
  config: "astro-devtools:config",
  docs: "astro-devtools:docs",
} as const;
