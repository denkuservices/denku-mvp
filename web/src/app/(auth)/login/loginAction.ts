"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function loginAction(formData: FormData) {
  const email = mustString(formData.get("email"), "email");
  const password = mustString(formData.get("password"), "password");

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  // Check onboarding completion status
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get org_id
  const { data: profiles } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  let redirectTo = "/dashboard";
  if (profiles && profiles.length > 0 && profiles[0].org_id) {
    const orgId = profiles[0].org_id;
    // Check plan active status (plan is active if org_plan_limits.plan_code exists)
    const { data: planLimits } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_code: string | null }>();

    const planActive = !!planLimits?.plan_code;
    if (!planActive) {
      redirectTo = "/onboarding";
    }
  }

  redirect(redirectTo);
}
