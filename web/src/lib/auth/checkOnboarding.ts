"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Check onboarding completion status for the current user's org.
 * Returns the redirect path based on onboarding status.
 * 
 * @returns "/onboarding" if onboarding not completed, "/dashboard" if completed
 * @throws redirect if onboarding not completed (for server components)
 */
export async function checkOnboardingAndRedirect(): Promise<"/dashboard"> {
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
    // No org found - allow access (may be during signup)
    return "/dashboard";
  }

  const orgId = profiles[0].org_id;

  // 3) Get organization_settings
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("onboarding_completed_at")
    .eq("org_id", orgId)
    .maybeSingle();

  // 4) Check if onboarding is completed
  const onboardingCompletedAt = (settings as any)?.onboarding_completed_at;
  
  if (!onboardingCompletedAt) {
    // Onboarding not completed -> redirect to onboarding
    redirect("/onboarding");
  }

  // Onboarding completed -> allow dashboard
  return "/dashboard";
}

/**
 * Check onboarding completion status without redirecting.
 * Used in middleware where we need to return a response instead of throwing redirect.
 * 
 * @returns true if onboarding completed, false otherwise
 */
export async function isOnboardingCompleted(orgId: string): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("onboarding_completed_at")
    .eq("org_id", orgId)
    .maybeSingle();

  const onboardingCompletedAt = (settings as any)?.onboarding_completed_at;
  return !!onboardingCompletedAt;
}
