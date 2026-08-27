/**
 * What counts as a name (2026-08-27). Pure, so it can be shared by the write path that fills a
 * name in and the dashboard action that lets an owner correct it — and tested without a database.
 */

/** Values a caller never actually said — the model filling a required field with a placeholder. */
const NOT_A_NAME = new Set([
  "unknown",
  "unknown caller",
  "customer",
  "caller",
  "n/a",
  "na",
  "none",
  "null",
  "guest",
  "anonymous",
  "test",
]);

/** Trim to something worth storing, or null. Pure. */
export function cleanLeadName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return null;
  if (NOT_A_NAME.has(name.toLowerCase())) return null;
  // A "name" with no letter in it is a transcription artifact, not a person.
  if (!/\p{L}/u.test(name)) return null;
  return name;
}
