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
 * Check plan active status for the current user's org.
 * Returns the redirect path based on plan status.
 * 
 * @returns "/onboarding" if plan not active, "/dashboard" if active
 * @throws redirect if plan not active (for server components)
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
    // No org found - redirect to onboarding (plan cannot be active without org)
    redirect("/onboarding");
  }

  const orgId = profiles[0].org_id;

  // 3) Check if plan is active
  const planActive = await isPlanActive(orgId);
  
  if (!planActive) {
    // Plan not active -> redirect to onboarding
    redirect("/onboarding");
  }

  // Plan active -> allow dashboard
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
