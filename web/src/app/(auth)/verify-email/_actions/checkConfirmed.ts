"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Check if current user's email is confirmed.
 * If confirmed, redirects to /onboarding or /dashboard based on onboarding status.
 * Returns confirmation status if not confirmed.
 */
export async function checkConfirmedAction(): Promise<{
  confirmed: boolean;
  email?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { confirmed: false };
  }

  const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;

  if (emailConfirmed) {
    // Get org_id for onboarding check
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
    } else {
      // No org yet, go to onboarding
      redirectTo = "/onboarding";
    }

    redirect(redirectTo);
  }

  return {
    confirmed: false,
    email: user.email || undefined,
  };
}

