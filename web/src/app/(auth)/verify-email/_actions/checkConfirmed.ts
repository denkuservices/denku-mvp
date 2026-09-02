"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyPaidPlan } from "@/lib/billing/planState";

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
      // "Active" means bought something — voice, chat, or both. A chat-only customer used to be
      // read as having no plan here and sent back to onboarding. See lib/billing/planState.ts.
      const planActive = await hasAnyPaidPlan(orgId);
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

