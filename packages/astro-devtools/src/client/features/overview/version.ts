/** Format package versions consistently across the Overview panel. */

/** Prefix a non-empty version with `v`; missing or blank versions stay absent. */
export function formatVersion(version: string | undefined): string | undefined {
  const normalizedVersion = version?.trim();
  return normalizedVersion ? `v${normalizedVersion}` : undefined;
}
