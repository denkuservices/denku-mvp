"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Check if plan is active for an org.
 * Plan is active if org_plan_limits.plan_code IS NOT NULL.
 * 
 * @param orgId Organization ID
 * @returns true if plan is active, false otherwise
 */
export async function isPlanActive(orgId: string): Promise<boolean> {
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  return !!planLimits?.plan_code;
}

/**
 * Check onboarding completion status for the current user's org.
 * Canonical rule: Dashboard allowed ONLY when onboarding_step >= 6 (Live).
 * Plan status alone does NOT grant dashboard access - must complete activation.
 * 
 * @returns "/dashboard" if onboarding complete (step >= 6), redirects to "/onboarding" otherwise
 * @throws redirect if onboarding not complete (for server components)
 */
export async function checkPlanActiveAndRedirect(): Promise<"/dashboard"> {
  const supabase = await createSupabaseServerClient();
  
  // 1) Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2) Get profile with org_id
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!profiles || profiles.length === 0 || !profiles[0].org_id) {
    // No org found - redirect to onboarding
    redirect("/onboarding");
  }

  const orgId = profiles[0].org_id;

  // 3) Check onboarding_step - canonical rule: Dashboard allowed ONLY when onboarding_step >= 6 (Live)
  // DB step mapping: 0 = initial, 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("organization_settings")
    .select("onboarding_step")
    .eq("org_id", orgId)
    .maybeSingle<{ onboarding_step: number | null }>();

  if (settingsErr) {
    // Error fetching settings - fail open to prevent loops, but log the error
    console.error("[checkPlanActiveAndRedirect] Settings check error (failing open):", settingsErr.message);
    return "/dashboard";
  }

  const onboardingStep = settings?.onboarding_step ?? 0;

  // Only allow dashboard when onboarding_step >= 6 (Live)
  // Do NOT check plan status - plan can be active but activation incomplete
  if (onboardingStep < 6) {
    // Onboarding not complete -> redirect to onboarding
    redirect("/onboarding");
  }

  // Onboarding complete (step >= 6) -> allow dashboard
  return "/dashboard";
}

/**
 * @deprecated Use checkPlanActiveAndRedirect instead.
 * Kept for backwards compatibility but redirects based on plan active status.
 */
export async function checkOnboardingAndRedirect(): Promise<"/dashboard"> {
  return checkPlanActiveAndRedirect();
}

/**
 * @deprecated Use isPlanActive instead.
 * Kept for backwards compatibility.
 */
export async function isOnboardingCompleted(orgId: string): Promise<boolean> {
  return isPlanActive(orgId);
}
