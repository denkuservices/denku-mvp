import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnectionByOrg, type PublicConnection } from "@/lib/instagram/connections";
import { isInstagramOAuthConfigured } from "@/lib/instagram/config";
import { InstagramConnectionCard } from "./_components/InstagramConnectionCard";

export const dynamic = "force-dynamic";

/**
 * Instagram channel foundation (Sprint 1.5). First-class dashboard surface
 * alongside Voice. Connection status + connect/disconnect only — no messaging UI
 * yet (future epics). Reads only non-secret connection metadata.
 */
export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let connection: PublicConnection | null = null;
  let canManage = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ org_id: string | null; role: string | null }>();

    canManage = profile?.role === "owner" || profile?.role === "admin";
    if (profile?.org_id) connection = await getConnectionByOrg(profile.org_id);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Instagram</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Connect your Instagram Business account. Denku receives its events today; automated
          handling arrives in a future release.
        </p>
      </header>

      {!isInstagramOAuthConfigured() && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Instagram is not configured on this environment yet. Once your administrator finishes
          setup, the Connect button will work.
        </div>
      )}

      <InstagramConnectionCard
        connection={connection}
        canManage={canManage}
        connected={sp?.connected === "1"}
        errorCode={sp?.error ?? null}
      />
    </div>
  );
}
