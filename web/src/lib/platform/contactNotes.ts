import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateNoteBody } from "@/lib/platform/noteRules";

// Re-exported so server callers have one import. The client composer must import from
// `noteRules` directly — this module is server-only.
export { validateNoteBody, NOTE_MAX_LENGTH } from "@/lib/platform/noteRules";

/**
 * Contact notes (Phase 4) — timestamped, authored observations that form part of the contact
 * timeline.
 *
 * Distinct from `leads.notes`, which is a single overwritable blob describing the lead. A note
 * here answers "who observed what, when", which is the only form that can sit in a timeline.
 *
 * Table is RLS-locked and service-role only, so **every query carries an explicit `org_id`**.
 *
 * **Inert until migrated** (`20260824110000_contact_notes.sql`): the reader fails soft to an
 * empty list so the timeline still renders, and the writer reports a clean failure.
 */

export interface ContactNote {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

export async function listContactNotes(
  orgId: string,
  contactRef: string,
  db: SupabaseClient = supabaseAdmin,
  limit = 100
): Promise<ContactNote[]> {
  if (!orgId || !contactRef) return [];

  const { data, error } = await db
    .from("contact_notes")
    .select("id, body, author_id, created_at")
    .eq("org_id", orgId)
    .eq("contact_ref", contactRef)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[PLATFORM][NOTES][LIST][UNAVAILABLE]", { orgId, error: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    body: String(r.body),
    authorId: (r.author_id as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/** Is the notes table present and answering? Distinguishes "no notes" from "not migrated". */
export async function contactNotesAvailable(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  if (!orgId) return false;
  const { error } = await db
    .from("contact_notes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  return !error;
}

export async function addContactNote(
  params: { orgId: string; contactRef: string; body: string; authorId: string | null },
  db: SupabaseClient = supabaseAdmin
): Promise<{ ok: boolean; error?: string }> {
  const { orgId, contactRef } = params;
  if (!orgId || !contactRef) return { ok: false, error: "Missing contact" };

  const valid = validateNoteBody(params.body);
  if (!valid.ok) return { ok: false, error: valid.error };

  const { error } = await db.from("contact_notes").insert({
    org_id: orgId,
    contact_ref: contactRef,
    body: valid.body,
    author_id: params.authorId,
  });

  if (error) {
    console.error("[PLATFORM][NOTES][WRITE][FAILED]", { orgId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Delete a note. Org-scoped by the query itself, so a note id from another org matches nothing
 * rather than deleting across a tenant boundary.
 */
export async function deleteContactNote(
  orgId: string,
  noteId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !noteId) return { ok: false, error: "Missing note" };
  const { error } = await db.from("contact_notes").delete().eq("org_id", orgId).eq("id", noteId);
  if (error) {
    console.error("[PLATFORM][NOTES][DELETE][FAILED]", { orgId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
