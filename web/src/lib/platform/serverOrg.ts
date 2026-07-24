import "server-only";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  for (const col of ["id", "auth_user_id"] as const) {
    const { data, error } = await supabase
      .from("profiles")
      .select("org_id")
      .eq(col, user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ org_id: string | null }>();
    if (!error && data?.org_id) return data.org_id;
  }
  return null;
}
