import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateAccountProfile } from "../../_actions/account";
import { revalidatePath } from "next/cache";
import { AccountProfileForm } from "./_components/AccountProfileForm";
import { resolveOrgId } from "@/lib/analytics/params";

export default async function AccountProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userEmail = auth?.user?.email ?? null;

  let fullName: string | null = null;
  let phone: string | null = null;

  if (auth?.user?.id) {
    console.log("[AccountProfilePage] user.id:", auth.user.id, "user.email:", auth.user.email);
    
    // Step 1: Try load profile by auth_user_id
    let { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle<{ full_name: string | null; phone: string | null }>();

    console.log("[AccountProfilePage] Found by auth_user_id:", !!profile);

    // Step 2: If not found, try by email (case-insensitive)
    if (!profile && auth.user.email) {
      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("full_name, phone, auth_user_id, email")
        .ilike("email", auth.user.email)
        .maybeSingle<{ full_name: string | null; phone: string | null; auth_user_id: string | null; email: string | null }>();

      console.log("[AccountProfilePage] Found by email:", !!profileByEmail);

      // Step 3: If found by email and auth_user_id is null or mismatched, claim it
      if (profileByEmail) {
        const needsClaim = profileByEmail.auth_user_id === null || profileByEmail.auth_user_id !== auth.user.id;
        if (needsClaim) {
          console.log("[AccountProfilePage] Claiming profile by email");
          await supabase
            .from("profiles")
            .update({ auth_user_id: auth.user.id })
            .eq("email", profileByEmail.email);

          // Reload by auth_user_id after claiming
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

    // Step 4: If still not found, create new profile
    if (!profile && auth.user.email) {
      console.log("[AccountProfilePage] Creating new profile");
      let orgId: string | null = null;
      try {
        orgId = await resolveOrgId();
        console.log("[AccountProfilePage] Resolved orgId:", orgId);
      } catch {
        // If org resolution fails, continue without org_id
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
        // If insert didn't return, try loading again
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

    // Always include fields if they exist in FormData (even if empty string)
    const full_name = fullNameRaw !== null ? fullNameRaw.toString() : undefined;
    const phone = phoneRaw !== null ? phoneRaw.toString() : undefined;

    const result = await updateAccountProfile({
      full_name,
      phone,
    });

    if (result.ok) {
      revalidatePath("/dashboard/settings/account/profile");
    }

    return result;
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
      <AccountProfileForm
        fullName={fullName ?? ""}
        phone={phone ?? ""}
        email={userEmail ?? "—"}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
