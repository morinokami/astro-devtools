/** Format decoded Astro Action results for the response block. */

/** Format JSON and additional devalue types for the result block. */
export function formatActionData(value: unknown): string {
  return formatValue(value, "", new Set());
}

function formatValue(value: unknown, indent: string, seen: Set<object>): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "boolean") return String(value);
  // devalue does not decode functions or symbols, but keep the formatter exhaustive.
  if (typeof value !== "object") return `[${typeof value}]`;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Date(invalid)" : `Date(${value.toISOString()})`;
  }
  if (value instanceof URL) return `URL(${value.href})`;
  if (value instanceof RegExp) return String(value);

  if (seen.has(value)) return "[circular]";
  seen.add(value);
  const childIndent = `${indent}  `;
  /** Wrap already-formatted entries in their brackets: one line each, or nothing when empty. */
  const block = (entries: string[], open: string, close: string): string =>
    entries.length === 0 ? open + close : `${open}\n${entries.join(",\n")}\n${indent}${close}`;
  /** One entry, formatted on its own line at the child indent. */
  const indented = (entry: unknown): string =>
    `${childIndent}${formatValue(entry, childIndent, seen)}`;
  let formattedValue: string;
  if (Array.isArray(value)) {
    formattedValue = block(value.map(indented), "[", "]");
  } else if (value instanceof Map) {
    const entries = [...value].map(
      ([key, entry]) => `${indented(key)} => ${formatValue(entry, childIndent, seen)}`,
    );
    formattedValue = block(entries, `Map(${entries.length}) {`, "}");
  } else if (value instanceof Set) {
    const entries = [...value].map(indented);
    formattedValue = block(entries, `Set(${entries.length}) [`, "]");
  } else {
    const entries = Object.entries(value).map(
      ([key, entry]) =>
        `${childIndent}${JSON.stringify(key)}: ${formatValue(entry, childIndent, seen)}`,
    );
    formattedValue = block(entries, "{", "}");
  }
  seen.delete(value);
  return formattedValue;
}
