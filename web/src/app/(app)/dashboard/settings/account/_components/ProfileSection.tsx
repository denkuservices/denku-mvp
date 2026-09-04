import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { resolveOrgId } from "@/lib/analytics/params";
import { updateAccountProfile } from "../../_actions/account";
import { AccountProfileForm } from "../profile/_components/AccountProfileForm";

/**
 * Profile — the "who am I" half of Account.
 *
 * Moved out of `account/profile/page.tsx`, not rewritten: Profile and Security were two routes,
 * two tab links and a layout of their own for two short cards that answer one question. They are
 * sections of one page now (Settings 9 → 4), and the old routes redirect.
 *
 * The self-healing profile lookup below is carried over verbatim — it repairs the two-org-creation-
 * paths damage (CLAUDE.md landmine #4) by claiming a profile row whose `auth_user_id` was never
 * set. The `console.log`s that traced it were removed: they printed the user's id and email into
 * server logs on every page view.
 */
export default async function ProfileSection() {
  const supabase = await createSupabaseServerClient();
  const auth = { user: await getCachedUser() };
  const userEmail = auth?.user?.email ?? null;

  let fullName: string | null = null;
  let phone: string | null = null;

  if (auth?.user?.id) {
    // 1) By auth_user_id — the safe key, unaffected by duplicate rows.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("full_name, phone, updated_at, created_at")
      .eq("auth_user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    let profile: { full_name: string | null; phone: string | null } | null =
      profiles && profiles.length > 0
        ? { full_name: profiles[0].full_name, phone: profiles[0].phone }
        : null;

    // 2) Fall back to email, case-insensitively.
    if (!profile && auth.user.email) {
      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("full_name, phone, auth_user_id, email")
        .ilike("email", auth.user.email)
        .maybeSingle<{ full_name: string | null; phone: string | null; auth_user_id: string | null; email: string | null }>();

      if (profileByEmail) {
        // 3) Claim it when the row exists but was never linked to this login.
        const needsClaim =
          profileByEmail.auth_user_id === null || profileByEmail.auth_user_id !== auth.user.id;
        if (needsClaim) {
          await supabase
            .from("profiles")
            .update({ auth_user_id: auth.user.id })
            .eq("email", profileByEmail.email);

          const { data: claimedProfile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("auth_user_id", auth.user.id)
            .maybeSingle<{ full_name: string | null; phone: string | null }>();

          profile = claimedProfile ?? null;
        } else {
          profile = { full_name: profileByEmail.full_name, phone: profileByEmail.phone };
        }
      }
    }

    // 4) Still nothing — create one.
    if (!profile && auth.user.email) {
      let orgId: string | null = null;
      try {
        orgId = await resolveOrgId();
      } catch {
        // Org resolution can fail for a brand-new signup; the row is still worth creating.
      }

      const { data: newProfile } = await supabase
        .from("profiles")
        .insert({
          auth_user_id: auth.user.id,
          email: auth.user.email,
          org_id: orgId,
          role: "viewer",
        })
        .select("full_name, phone")
        .single();

      if (newProfile) {
        profile = newProfile;
      } else {
        const { data: reloadedProfile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle();
        profile = reloadedProfile ?? null;
      }
    }

    fullName = profile?.full_name ?? null;
    phone = profile?.phone ?? null;
  }

  async function handleSubmit(formData: FormData) {
    "use server";

    const fullNameRaw = formData.get("full_name");
    const phoneRaw = formData.get("phone");

    const result = await updateAccountProfile({
      full_name: fullNameRaw !== null ? fullNameRaw.toString() : undefined,
      phone: phoneRaw !== null ? phoneRaw.toString() : undefined,
    });

    if (result.ok) revalidatePath("/dashboard/settings/account");

    return result;
  }

  return (
    <AccountProfileForm
      fullName={fullName ?? ""}
      phone={phone ?? ""}
      email={userEmail ?? "—"}
      onSubmit={handleSubmit}
    />
  );
}
