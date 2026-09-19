/**
 * Text helpers for the panels' labels and announcements, so a rule they all
 * need — how a count reads — is written once.
 */

/** The noun for a count: `island` for exactly one, `islands` otherwise. */
export function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** A count with its noun: `1 island`, `2 islands`. */
export function countOf(count: number, noun: string): string {
  return `${count} ${pluralize(count, noun)}`;
}
