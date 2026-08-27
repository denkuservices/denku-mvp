"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addContactNote, deleteContactNote } from "@/lib/platform/contactNotes";
import { isLifecycleStage } from "@/lib/platform/lifecycle";
import { cleanLeadName } from "@/lib/leads/name";

/**
 * CRM actions (Phase 4) — lifecycle changes and timeline notes.
 *
 * Recording what you know about a customer is ordinary support work, so any member of the org
 * may do it. Every write resolves the org from the session and scopes the query to it, so a
 * forged id from another tenant matches nothing rather than crossing a boundary.
 */

type Caller = { ok: true; orgId: string; userId: string } | { ok: false; error: string };

async function requireOrgMember(): Promise<Caller> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ org_id: string | null }>();

  if (!profile?.org_id) return { ok: false, error: "No organization" };
  return { ok: true, orgId: profile.org_id, userId: user.id };
}

/**
 * Move a contact along the lifecycle. Writes `leads.status` — the existing lifecycle column —
 * rather than a parallel field.
 */
export async function setContactLifecycleAction(
  contactRef: string,
  stage: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!contactRef) return { ok: false, error: "Missing contact" };
  if (!isLifecycleStage(stage)) return { ok: false, error: "Unknown lifecycle stage" };

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq("org_id", auth.orgId)
    .eq("id", contactRef);

  if (error) {
    console.error("[CRM][LIFECYCLE][FAILED]", { orgId: auth.orgId, error: error.message });
    return { ok: false, error: "That didn't save. Please try again." };
  }

  revalidatePath(`/dashboard/crm/contacts/${contactRef}`);
  revalidatePath("/dashboard/crm/contacts");
  return { ok: true };
}

/** Add a timestamped, authored note to the contact's timeline. */
export async function addContactNoteAction(
  contactRef: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const res = await addContactNote({
    orgId: auth.orgId,
    contactRef,
    body,
    authorId: auth.userId,
  });

  if (res.ok) revalidatePath(`/dashboard/crm/contacts/${contactRef}`);
  return res;
}

/** Remove a note. Org-scoped, so an id from another tenant matches nothing. */
export async function deleteContactNoteAction(
  contactRef: string,
  noteId: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };

  const res = await deleteContactNote(auth.orgId, noteId);
  if (res.ok) revalidatePath(`/dashboard/crm/contacts/${contactRef}`);
  return res;
}


/**
 * Correct the contact's name (2026-08-27).
 *
 * Speech-to-text mishears proper nouns — a caller who said "Gaye" was transcribed as "Joya" —
 * and asking every caller to spell their name to fix it would irritate the many to serve the few.
 * The person who can fix the spelling cheaply is the owner, who has the recording in front of
 * them. Because the contact is keyed on the phone number, one correction here holds forever: the
 * AI never overwrites a name that is already set (see `fillMissingLeadName`), so the next call
 * greets them properly.
 *
 * An empty value clears the name back to "unknown", which also re-arms the AI to fill it in.
 */
export async function setContactNameAction(
  contactRef: string,
  rawName: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!contactRef) return { ok: false, error: "Missing contact" };

  const trimmed = rawName.trim();
  const name = trimmed.length === 0 ? null : cleanLeadName(trimmed);
  if (trimmed.length > 0 && !name) {
    return { ok: false, error: "That doesn't look like a name." };
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("org_id", auth.orgId)
    .eq("id", contactRef);

  if (error) {
    console.error("[CRM][NAME][FAILED]", { orgId: auth.orgId, error: error.message });
    return { ok: false, error: "That didn't save. Please try again." };
  }

  revalidatePath(`/dashboard/crm/contacts/${contactRef}`);
  revalidatePath("/dashboard/crm/contacts");
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}
