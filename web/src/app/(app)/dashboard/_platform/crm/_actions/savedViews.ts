"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isSavedViewSurface,
  normalizeViewName,
  normalizeViewQuery,
  SAVED_VIEWS_PER_SURFACE,
  type SavedViewSurface,
} from "@/lib/platform/savedViews";

/**
 * Saving, sharing and removing a view.
 *
 * Any member may save one: keeping a filter you use every morning is ordinary work, not an
 * administrative act. What a member may NOT do is touch someone else's — including a shared one,
 * which stays its creator's to rename or withdraw. Sharing publishes your working set to the
 * workspace; it does not hand it over.
 *
 * Every write is scoped by `org_id` AND `created_by`, so a forged id from another tenant or
 * another colleague matches no row rather than crossing a boundary.
 */

export type SavedViewResult = { ok: true; id?: string } | { ok: false; error: string };

async function caller() {
  const viewer = await getViewer();
  if (!viewer.orgId || !viewer.profileId) return null;
  return { orgId: viewer.orgId, profileId: viewer.profileId };
}

export async function createSavedView(input: {
  surface: string;
  name: string;
  query: string;
  shared?: boolean;
}): Promise<SavedViewResult> {
  const who = await caller();
  if (!who) return { ok: false, error: "Please sign in again." };

  if (!isSavedViewSurface(input.surface)) return { ok: false, error: "Unknown list." };

  const name = normalizeViewName(input.name);
  if (!name) return { ok: false, error: "Give the view a name." };

  const query = normalizeViewQuery(input.query);
  if (!query) {
    // A view of "everything" is the list itself, and saving one puts a row in the bar that does
    // nothing when clicked.
    return { ok: false, error: "Set at least one filter before saving a view." };
  }

  const { count } = await supabaseAdmin
    .from("saved_views")
    .select("*", { count: "exact", head: true })
    .eq("org_id", who.orgId)
    .eq("surface", input.surface)
    .eq("created_by", who.profileId);

  if ((count ?? 0) >= SAVED_VIEWS_PER_SURFACE) {
    return {
      ok: false,
      error: `You can keep ${SAVED_VIEWS_PER_SURFACE} views on this list. Remove one to add another.`,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("saved_views")
    .insert({
      org_id: who.orgId,
      surface: input.surface as SavedViewSurface,
      name,
      query,
      shared: Boolean(input.shared),
      created_by: who.profileId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    // The unique index is on (org, surface, owner, lower(name)).
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "You already have a view with that name." };
    }
    return { ok: false, error: "Could not save that view." };
  }

  revalidatePath("/dashboard/crm/requests");
  return { ok: true, id: data.id };
}

export async function deleteSavedView(id: string): Promise<SavedViewResult> {
  const who = await caller();
  if (!who) return { ok: false, error: "Please sign in again." };

  const { error } = await supabaseAdmin
    .from("saved_views")
    .delete()
    .eq("id", id)
    .eq("org_id", who.orgId)
    // A shared view remains its creator's. Someone else removing it would take a filter away
    // from everyone who had started relying on it.
    .eq("created_by", who.profileId);

  if (error) return { ok: false, error: "Could not remove that view." };

  revalidatePath("/dashboard/crm/requests");
  return { ok: true };
}

export async function setSavedViewShared(id: string, shared: boolean): Promise<SavedViewResult> {
  const who = await caller();
  if (!who) return { ok: false, error: "Please sign in again." };

  const { error } = await supabaseAdmin
    .from("saved_views")
    .update({ shared, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", who.orgId)
    .eq("created_by", who.profileId);

  if (error) return { ok: false, error: "Could not change that view." };

  revalidatePath("/dashboard/crm/requests");
  return { ok: true };
}
