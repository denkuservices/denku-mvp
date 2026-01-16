"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Get onboarding state for current user's org.
 */
export async function getOnboardingState() {
  const supabase = await createSupabaseServerClient();
  
  // 1) Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2) Get profile with org_id
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!profiles || profiles.length === 0 || !profiles[0].org_id) {
    throw new Error("No organization found for this user.");
  }

  const orgId = profiles[0].org_id;
  const role = profiles[0].role;

  // 3) Get organization name
  const { data: org } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .single();

  const orgName = org?.name || "";

  // 4) Get organization_settings
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  // 5) Check if onboarding is completed
  const onboardingCompletedAt = (settings as any)?.onboarding_completed_at;
  if (onboardingCompletedAt) {
    redirect("/dashboard");
  }

  // 6) Get workspace status and paused_reason
  const workspaceStatus = (settings as any)?.workspace_status || "active";
  const pausedReason = (settings as any)?.paused_reason || null;

  // 7) Get current plan (check org_plan_overrides or default)
  const { data: planOverride } = await supabaseAdmin
    .from("org_plan_overrides")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  const planCode = planOverride?.plan_code || null;

  // 8) Get onboarding step (safe fallback if column doesn't exist or is null)
  // Step mapping: 0 = goal, 1 = number, 2 = go-live
  const onboardingStep = (settings as any)?.onboarding_step ?? 0;

  // 9) Get saved onboarding preferences (goal and language)
  const onboardingGoal = (settings as any)?.onboarding_goal || null;
  const onboardingLanguage = (settings as any)?.onboarding_language || null;

  // 10) Check if phone number exists (check agents table)
  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, vapi_phone_number_id, phone_number")
    .eq("org_id", orgId)
    .limit(1);

  const hasPhoneNumber = agents && agents.length > 0 && (agents[0].vapi_phone_number_id || agents[0].phone_number);

  return {
    orgId,
    orgName,
    role,
    onboardingStep: onboardingStep as number,
    onboardingGoal: onboardingGoal as string | null,
    onboardingLanguage: onboardingLanguage as string | null,
    workspaceStatus: workspaceStatus as "active" | "paused",
    pausedReason: pausedReason as "manual" | "hard_cap" | "past_due" | null,
    planCode,
    hasPhoneNumber: !!hasPhoneNumber,
    phoneNumber: agents?.[0]?.phone_number || null,
  };
}

/**
 * Save onboarding preferences (goal + language).
 */
export async function saveOnboardingPreferences(
  orgId: string,
  preferences: { goal: string; language: string }
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "Unauthorized" };
  }

  // Update organization_settings with preferences
  // Step mapping: 0 = goal, 1 = number, 2 = go-live
  // After saving goal, move to step 1 (number selection)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert({
      org_id: orgId,
      onboarding_step: 1, // Move to step 1 (number selection)
      onboarding_goal: preferences.goal,
      onboarding_language: preferences.language,
    }, {
      onConflict: "org_id",
    });

  if (error) {
    console.error("[saveOnboardingPreferences] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Save workspace name (if not already set).
 */
export async function saveWorkspaceName(orgId: string, name: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "Unauthorized" };
  }

  // Update org name
  const { error } = await supabaseAdmin
    .from("orgs")
    .update({ name })
    .eq("id", orgId);

  if (error) {
    console.error("[saveWorkspaceName] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Activate phone number (placeholder - will be wired in next task).
 */
export async function activatePhoneNumber(
  orgId: string,
  country: string,
  areaCode?: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "Unauthorized" };
  }

  // Check workspace status
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle();

  const workspaceStatus = (settings as any)?.workspace_status || "active";
  const pausedReason = (settings as any)?.paused_reason || null;

  if (workspaceStatus === "paused" && (pausedReason === "hard_cap" || pausedReason === "past_due")) {
    return { ok: false, error: "BILLING_PAUSED" };
  }

  // Check if plan exists
  const { data: planOverride } = await supabaseAdmin
    .from("org_plan_overrides")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!planOverride?.plan_code) {
    return { ok: false, error: "NO_PLAN" };
  }

  // TODO: Wire actual phone number provisioning here
  // For now, this is a placeholder that marks onboarding as complete
  // Step mapping: 0 = goal, 1 = number, 2 = go-live
  // After activation, move to step 2 (go-live) and mark as completed
  const { error: updateError } = await supabaseAdmin
    .from("organization_settings")
    .upsert({
      org_id: orgId,
      onboarding_step: 2, // Step 2 = go-live
      onboarding_completed_at: new Date().toISOString(),
    }, {
      onConflict: "org_id",
    });

  if (updateError) {
    console.error("[activatePhoneNumber] Error updating settings:", updateError);
    return { ok: false, error: updateError.message };
  }

  return { ok: true, phoneNumber: "+1234567890" }; // Placeholder
}

/**
 * Complete onboarding (mark as done).
 */
export async function completeOnboarding(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "Unauthorized" };
  }

  // Step mapping: 0 = goal, 1 = number, 2 = go-live
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .upsert({
      org_id: orgId,
      onboarding_step: 2, // Step 2 = go-live
      onboarding_completed_at: new Date().toISOString(),
    }, {
      onConflict: "org_id",
    });

  if (error) {
    console.error("[completeOnboarding] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
