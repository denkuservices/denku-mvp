/**
 * Contact-note rules — pure and dependency-free on purpose.
 *
 * The note composer is a client component and the persistence layer is `server-only`, so the
 * shared vocabulary (length cap + validation) cannot live in `contactNotes.ts`: importing it
 * would drag the service-role client into the client bundle. Keeping the rules here means the
 * field, the server action and the DB CHECK all agree on one definition.
 */

export const NOTE_MAX_LENGTH = 2000;

/**
 * Validate a note body the way the DB CHECK does (`btrim(body) <> ''`), but with a message a
 * person can act on.
 */
export function validateNoteBody(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return { ok: false, error: "A note needs some text." };
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notes are limited to ${NOTE_MAX_LENGTH} characters.` };
  }
  return { ok: true, body: trimmed };
}
