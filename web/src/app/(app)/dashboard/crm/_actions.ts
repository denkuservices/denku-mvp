"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addContactNote, deleteContactNote } from "@/lib/platform/contactNotes";
import { isLifecycleStage } from "@/lib/platform/lifecycle";

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
