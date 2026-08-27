import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve the current user's org for platform (Sprint 5) server pages.
 *
 * `profiles` carries both `id` and `auth_user_id` (uuid) across this project's history, and
 * different code paths key on one or the other. This resolver tries both (id first, matching
 * the existing dashboard pages) so the new surfaces don't add a third inconsistent variant.
 * Returns null when unresolved (pages render an empty state rather than throwing).
 */
export async function resolveActiveOrgId(): Promise<string | null> {
  return (await resolveViewer()).orgId;
}

/**
 * The org AND the person looking at it.
 *
 * Some platform state is per-viewer rather than per-org — the Inbox's unread watermarks are the
 * first of them (`lib/platform/reads.ts`): whether the owner has read a conversation says
 * nothing about their colleague. Those surfaces need both ids from the one auth round-trip, so
 * the resolution lives here rather than being re-implemented beside each of them.
 *
 * **Wrapped in React `cache`**, so a layout and the page inside it share ONE auth round-trip
 * instead of two. `auth.getUser()` is an HTTP call to Supabase Auth rather than a token decode —
 * it validates the session against the server — which makes it one of the slowest single things
 * a dashboard request does, and it was being paid twice on every full page load.
 */
export const resolveViewer = cache(async function resolveViewer(): Promise<{
  orgId: string | null;
  userId: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { orgId: null, userId: null };

  for (const col of ["id", "auth_user_id"] as const) {
    const { data, error } = await supabase
      .from("profiles")
      .select("org_id")
      .eq(col, user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ org_id: string | null }>();
    if (!error && data?.org_id) return { orgId: data.org_id, userId: user.id };
  }
  return { orgId: null, userId: user.id };
});
