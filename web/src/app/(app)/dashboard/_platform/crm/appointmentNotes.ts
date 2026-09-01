import { parseTranscriptTurns } from "@/lib/platform/adapters/voice";

/**
 * Reading `appointments.notes`, which holds two different kinds of thing.
 *
 * The deterministic booking path writes the WHOLE call transcript into that column, with an
 * internal provenance marker appended. The tool path writes a short human note, or nothing. The
 * detail page rendered both the same way — as one paragraph — which is how an appointment came to
 * be presented as a wall of `AI: … User: …` with a line reading `[System] created_by=deterministic`
 * underneath it.
 *
 * So the shape of the value decides how it is shown. Pure, and in its own module rather than
 * beside the component, so it can be tested without dragging a page's server imports along.
 */

/** Internal provenance the ingest path appends to notes. Not for a reader. */
const SYSTEM_MARKER = /^\s*\[System\][^\n]*$/gim;

export function splitAppointmentNotes(notes: string | null): {
  note: string | null;
  transcript: string | null;
} {
  const cleaned = (notes ?? "").replace(SYSTEM_MARKER, "").trim();
  if (!cleaned) return { note: null, transcript: null };

  // Two or more spoken turns means this IS the conversation, not a note about it.
  const turns = parseTranscriptTurns(cleaned);
  const spoken = turns.filter((t) => t.role !== "system");
  if (spoken.length >= 2) return { note: null, transcript: cleaned };

  return { note: cleaned, transcript: null };
}
