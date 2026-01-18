"use server";

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getStripeClient, ensureStripeCustomer } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { getBaseUrl } from "@/lib/utils/url";
import { logEvent } from "@/lib/observability/logEvent";
import { vapiFetch } from "@/lib/vapi/server";
import Stripe from "stripe";

/**
 * Form action: Bootstrap workspace (Step 0)
 */
export async function bootstrapWorkspaceAction(formData: FormData) {
  const workspaceName = formData.get("workspaceName")?.toString() || "";
  const fullName = formData.get("fullName")?.toString() || "";
  const phone = formData.get("phone")?.toString() || null;
  
  console.log("[onboarding submit] step 0 (workspace bootstrap)");
  
  if (!workspaceName.trim() || !fullName.trim()) {
    return { ok: false, error: "Workspace name and full name are required." };
  }
  
  const result = await bootstrapOrgAndProfile(workspaceName.trim(), fullName.trim(), phone?.trim() || null);
  return result;
}

/**
 * Form action: Save workspace and profile (Step 0 - existing org)
 */
export async function saveWorkspaceAction(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  const workspaceName = formData.get("workspaceName")?.toString() || "";
  const fullName = formData.get("fullName")?.toString() || "";
  const phone = formData.get("phone")?.toString() || null;
  
  console.log("[onboarding submit] step 0 (workspace save)");
  
  if (!orgId || !workspaceName.trim() || !fullName.trim()) {
    return { ok: false, error: "All fields are required." };
  }
  
  const result = await saveWorkspaceAndProfile(orgId, workspaceName.trim(), fullName.trim(), phone?.trim() || null);
  return result;
}

/**
 * Form action: Save goal and language preferences (Step 1)
 */
export async function saveGoalAndLanguageAction(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  const goal = formData.get("goal")?.toString() || "support";
  const language = formData.get("language")?.toString() || "en";
  
  console.log("[onboarding submit] step 1 (goal + language)");
  
  if (!orgId) {
    return { ok: false, error: "Organization ID is missing." };
  }
  
  const result = await saveOnboardingPreferences(orgId, { goal, language });
  return result;
}

/**
 * Form action: Advance to plan selection (Step 3 -> Step 4)
 */
export async function advanceToPlanAction(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  
  console.log("[onboarding submit] step 3 (phone intent -> plan)");
  
  if (!orgId) {
    return { ok: false, error: "Organization ID is missing." };
  }
  
  const result = await setOnboardingStepToPlan(orgId);
  return result;
}

/**
 * Get onboarding state for current user's org.
 * Always fetches fresh data from DB (no caching).
 */
export async function getOnboardingState() {
  noStore(); // Prevent Next.js caching - always fetch fresh state from DB
  const supabase = await createSupabaseServerClient();
  
  // 1) Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2) Get org_id using helper
  const orgId = await getActiveOrgId();
  if (!orgId) {
    // No org yet - return initial state for bootstrap flow
    // This is expected in OTP-first flow where org is created during onboarding
    return {
      orgId: null,
      orgName: "",
      role: null,
      onboardingStep: 0,
      onboardingGoal: null,
      onboardingLanguage: null,
      profileFullName: null,
      profilePhone: null,
      workspaceStatus: "active" as const,
      pausedReason: null,
      planCode: null,
      isPlanActive: false,
      plans: [],
      hasPhoneNumber: false,
      phoneNumber: null,
      needsOrgSetup: true,
    };
  }

  // 3) Get profile role
  const { data: profiles } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const role = profiles?.[0]?.role || null;

  // 4) Get organization name from organizations_legacy
  const { data: org } = await supabaseAdmin
    .from("organizations_legacy")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();

  const orgName = org?.name || "";

  // 4) Get organization_settings (includes phone number artifacts after activation)
  let { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  // 5) Ensure organization_settings row exists (FK-safe)
  if (!settings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
    // Refetch after insert
    const { data: newSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    settings = newSettings;
  }

  // 6) Get workspace status and paused_reason
  const workspaceStatus = (settings as any)?.workspace_status || "active";
  const pausedReason = (settings as any)?.paused_reason || null;

  // 7) Get current plan (check org_plan_limits - canonical source for active plan)
  // Plan is active if org_plan_limits.plan_code exists
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  const planCode = planLimits?.plan_code || null;
  const isPlanActive = !!planCode;

  // 8) Get onboarding step (safe fallback if column doesn't exist or is null)
  // DB step mapping: 0 = initial, 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
  // UI step mapping: 0 = Workspace, 1 = Goal+Language, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
  const rawStep = (settings as any)?.onboarding_step ?? 0;
  
  // 9) Workspace/profile setup happens during bootstrap (UI step 0), sets DB step to 1 (Goal)
  let resolvedStep = rawStep;
  
  // 10) CRITICAL: Never downgrade onboarding_step - only read what's in DB
  // getOnboardingState() must only READ state, never modify it or redirect
  // This prevents step from being downgraded back to Plan (step 3) if plan is active
  let onboardingStep = resolvedStep;

  // 11) Map DB step to UI step for client
  // DB: 0=initial, 1=Goal, 2=Language, 3=Phone Intent, 4=Plan, 5=Activating, 6=Live
  // UI: 0=Workspace, 1=Goal+Language, 2=Phone Intent, 3=Plan, 4=Activating, 5=Live
  let uiStep: number;
  if (onboardingStep === 0) {
    uiStep = 0; // Workspace
  } else if (onboardingStep === 1 || onboardingStep === 2) {
    uiStep = 1; // Goal+Language (DB steps 1 or 2 both map to UI step 1)
  } else if (onboardingStep === 3) {
    uiStep = 2; // Phone Intent
  } else if (onboardingStep === 4) {
    uiStep = 3; // Plan
  } else if (onboardingStep === 5) {
    uiStep = 4; // Activating
  } else if (onboardingStep >= 6) {
    uiStep = 5; // Live
    // Note: Redirect to dashboard is handled in onboarding/page.tsx, not here
    // getOnboardingState() must NEVER redirect - it only returns state
  } else {
    uiStep = 0; // Fallback to Workspace
  }

  // 11) Fetch plans catalog for inline plan selection
  const { data: plansData } = await supabaseAdmin
    .from("billing_plan_catalog")
    .select("plan_code, display_name, monthly_fee_usd, included_minutes, overage_rate_usd_per_min, concurrency_limit, included_phone_numbers")
    .in("plan_code", ["starter", "growth", "scale"])
    .order("plan_code");

  const plans = plansData || [];

  // 12) Get saved onboarding preferences (goal, language, country, area_code, selected_number_type)
  const onboardingGoal = (settings as any)?.onboarding_goal || null;
  const onboardingLanguage = (settings as any)?.onboarding_language || null;
  const onboardingCountry = (settings as any)?.onboarding_country || null;
  const onboardingAreaCode = (settings as any)?.onboarding_area_code || null;
  const onboardingSelectedNumberType = (settings as any)?.onboarding_selected_number_type || null;
  
  // 13) Get profile data (full_name, phone) for Step 0 pre-fill
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("full_name, phone")
    .eq("auth_user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle<{ full_name: string | null; phone: string | null }>();
  
  const profileFullName = profileData?.full_name || null;
  const profilePhone = profileData?.phone || null;

  // 14) Get phone number from organization_settings (authoritative source for Main Line)
  // Phone number artifacts are stored in organization_settings after activation completes
  const phoneNumberE164 = (settings as any)?.phone_number_e164 || null;
  const vapiPhoneNumberId = (settings as any)?.vapi_phone_number_id || null;
  const vapiAssistantId = (settings as any)?.vapi_assistant_id || null;
  const mainAgentId = (settings as any)?.main_agent_id || null;
  const hasPhoneNumber = !!vapiPhoneNumberId;

  return {
    orgId,
    orgName,
    role,
    onboardingStep: uiStep as number, // Return UI step, not DB step
    onboardingGoal: onboardingGoal as string | null,
    onboardingLanguage: onboardingLanguage as string | null,
    onboardingCountry: onboardingCountry as string | null,
    onboardingAreaCode: onboardingAreaCode as string | null,
    onboardingSelectedNumberType: onboardingSelectedNumberType as string | null,
    profileFullName: profileFullName as string | null,
    profilePhone: profilePhone as string | null,
    workspaceStatus: workspaceStatus as "active" | "paused",
    pausedReason: pausedReason as "manual" | "hard_cap" | "past_due" | null,
    planCode,
    isPlanActive,
    plans: plans.map((p) => ({
      plan_code: p.plan_code,
      display_name: p.display_name,
      monthly_fee_usd: p.monthly_fee_usd,
      included_minutes: p.included_minutes,
      overage_rate_usd_per_min: p.overage_rate_usd_per_min,
      concurrency_limit: p.concurrency_limit,
      included_phone_numbers: p.included_phone_numbers,
    })),
    hasPhoneNumber,
    phoneNumber: phoneNumberE164, // Return E164 phone number from organization_settings (DB truth)
    phoneNumberE164, // Also include as separate field for clarity
    vapiPhoneNumberId, // From organization_settings
    vapiAssistantId, // From organization_settings
    needsOrgSetup: false,
  };
}

/**
 * Update onboarding step in DB (idempotent, FK-safe).
 * Used by Next/Back buttons and checkout success flow.
 */
export async function updateOnboardingStep(orgId: string, step: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  // Ensure FK parent exists in organizations_legacy
  const { data: existingOrg } = await supabaseAdmin
    .from("organizations_legacy")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  
  if (!existingOrg) {
    await supabaseAdmin
      .from("organizations_legacy")
      .insert({ id: orgId, name: null, created_at: new Date().toISOString() });
  }

  // Ensure settings row exists
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  
  if (!existingSettings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // Update onboarding_step
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({ onboarding_step: step })
    .eq("org_id", orgId);

  if (error) {
    console.error("[updateOnboardingStep] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, step };
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
  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  // Ensure FK parent exists in organizations_legacy
  // Check if exists first, then insert if missing
  const { data: existingOrg } = await supabaseAdmin
    .from("organizations_legacy")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  
  if (!existingOrg) {
    await supabaseAdmin
      .from("organizations_legacy")
      .insert({ id: orgId, name: null, created_at: new Date().toISOString() });
  }

  // Ensure settings row exists
  // Check if exists first, then insert if missing
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  
  if (!existingSettings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // Update organization_settings with preferences
  // DB step mapping: 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
  // Since Goal and Language are combined in UI, Goal+Language submit advances to Phone Intent (step 3)
  // User requirement: "Goal submit should set onboarding_step = 2 (Language)" and "Language submit should set onboarding_step = 3 (Phone intent)"
  // Combined: Goal+Language -> step 3 (Phone Intent)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 3, // Move to step 3 (Phone Intent) - completing both Goal and Language
      onboarding_goal: preferences.goal,
      onboarding_language: preferences.language,
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("[saveOnboardingPreferences] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true }; // Advance to Phone Intent step (onboardingStep updated in DB)
}

/**
 * Bootstrap org + profile for OTP-first users (no org yet).
 * Creates org, profile linkage, and org settings atomically.
 * Idempotent: if org already exists, updates profile and returns existing org.
 */
export async function bootstrapOrgAndProfile(
  workspaceName: string,
  fullName: string,
  phone: string | null
): Promise<{ ok: true; orgId: string; onboardingStep: number } | { ok: false; error: string; debug?: { constraint?: string } }> {
  console.log("[bootstrapOrgAndProfile] CALLED");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Please log in again." };
  }

  // Normalize phone input at the start: trim, clean, and ensure NULL (not empty string)
  // This is critical for UNIQUE(phone_number) constraint - NULL values don't conflict
  const trimmedPhone = phone?.trim();
  const normalizedPhone = trimmedPhone && trimmedPhone.length > 0
    ? trimmedPhone.replace(/[^\d+]/g, "").slice(0, 32) || null
    : null;
  
  if (process.env.NODE_ENV !== "production") {
    console.log("[bootstrapOrgAndProfile] normalizedPhone", normalizedPhone);
  }

  // Idempotency check: if user already has an org, return it
  const existingOrgId = await getActiveOrgId();
  if (existingOrgId) {
    // Update profile fields if needed, but return existing org

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: normalizedPhone,
      })
      .eq("auth_user_id", user.id)
      .eq("org_id", existingOrgId);

    if (profileError) {
      console.error("[bootstrapOrgAndProfile] Error updating profile:", profileError);
      // Continue anyway - profile update is optional
    }

    // Get existing onboarding step
    const { data: settings } = await supabaseAdmin
      .from("organization_settings")
      .select("onboarding_step")
      .eq("org_id", existingOrgId)
      .maybeSingle();

    const existingStep = (settings as any)?.onboarding_step ?? 0;

    return { ok: true, orgId: existingOrgId, onboardingStep: existingStep };
  }

  // Create new org
  const orgId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // 1) Create org in public.orgs (canonical)
    const { error: orgError } = await supabaseAdmin
      .from("orgs")
      .insert({
        id: orgId,
        name: workspaceName.trim(),
        created_at: now,
        created_by: user.id, // NOT NULL
      });

    if (orgError) {
      console.error("[bootstrapOrgAndProfile] Error creating org:", orgError);
      return { ok: false, error: "Could not create workspace. Please try again." };
    }

    // 2) Create organizations_legacy (FK parent for organization_settings)
    // CRITICAL: This must happen BEFORE inserting organization_settings (FK constraint)
    // Ensure organizations_legacy row exists with same id as orgs.id
    // IMPORTANT: UNIQUE(phone_number) constraint requires NULL (not empty string) when phone is optional
    // Multiple NULL values are allowed in UNIQUE columns (NULL != NULL), but empty strings violate UNIQUE
    const { error: legacyError } = await supabaseAdmin
      .from("organizations_legacy")
      .upsert(
        {
          id: orgId, // Same id as orgs.id
          name: workspaceName.trim(),
          created_at: now,
          phone_number: normalizedPhone, // NULL when no phone (not empty string) - satisfies UNIQUE constraint
        },
        { onConflict: "id" } // Idempotent: ignore if already exists
      );

    if (legacyError) {
      console.error("[bootstrapOrgAndProfile] Error creating organizations_legacy:", legacyError);
      
      // Check if this is a phone number unique constraint violation
      const errorMessage = legacyError.message || "";
      const isPhoneDuplicate = errorMessage.includes("organizations_phone_number_key") || 
                               legacyError.code === "23505" && errorMessage.includes("phone_number");
      
      if (isPhoneDuplicate) {
        return { 
          ok: false, 
          error: "Could not create workspace. Please try again.",
          debug: { constraint: "organizations_phone_number_key" }
        };
      }
      
      return { ok: false, error: "Could not create workspace. Please try again." };
    }

    // 3) Create/upsert profile with org_id linkage
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id, // profiles.id = auth_user_id
          auth_user_id: user.id,
          email: user.email || "",
          org_id: orgId,
          full_name: fullName.trim(),
          phone: normalizedPhone,
          role: "owner", // First user is owner
        },
        { onConflict: "id" }
      );

    if (profileError) {
      console.error("[bootstrapOrgAndProfile] Error creating profile:", profileError);
      return { ok: false, error: "Could not create workspace. Please try again." };
    }

    // 4) Create organization_settings row with onboarding_step = 1 (Goal)
    // FK constraint: org_id must exist in organizations_legacy (we ensured this in step 2)
    // UI step mapping: 0 = Workspace, 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
    // After bootstrap (UI step 0) completes, DB step becomes 1 (Goal)
    const { error: settingsError } = await supabaseAdmin
      .from("organization_settings")
      .insert({
        org_id: orgId,
        onboarding_step: 1, // Advance to Goal step (DB step 1) after bootstrap
      });

    if (settingsError) {
      console.error("[bootstrapOrgAndProfile] Error creating organization_settings:", settingsError);
      return { ok: false, error: "Could not create workspace. Please try again." };
    }

    await logEvent({
      tag: "[ONBOARDING][BOOTSTRAP_ORG]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "info",
      org_id: orgId,
      details: {
        hasUserId: !!user.id,
        userId: user.id?.slice(0, 8),
        orgName: workspaceName.trim(),
      },
    });

    return { ok: true, orgId, onboardingStep: 1 }; // Advance to Goal step
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[bootstrapOrgAndProfile] Unexpected error:", errorMsg);
    return { ok: false, error: `Failed to bootstrap workspace: ${errorMsg}` };
  }
}

/**
 * Save workspace + profile data (Step 0).
 * Creates/updates org and profile with workspace_name, full_name, phone.
 * Idempotent: safe to call multiple times.
 * NOTE: This requires orgId to already exist. Use bootstrapOrgAndProfile() for new users.
 */
export async function saveWorkspaceAndProfile(
  orgId: string,
  workspaceName: string,
  fullName: string,
  phone: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  // Normalize phone (remove non-digits, keep + prefix if present)
  const normalizedPhone = phone
    ? phone.trim().replace(/[^\d+]/g, "").slice(0, 32) || null
    : null;

  const now = new Date().toISOString();

  // 1) Ensure org exists in public.orgs (canonical org table) and organizations_legacy (FK parent)
  // Idempotent: upsert will update name if changed, but won't create duplicates
  await supabaseAdmin
    .from("orgs")
    .upsert(
      {
        id: orgId,
        name: workspaceName.trim(),
        created_at: now,
        created_by: user.id, // NOT NULL - set to authenticated user's id
      },
      { onConflict: "id" }
    );

  // Update name explicitly (upsert may not update on conflict)
  await supabaseAdmin
    .from("orgs")
    .update({ name: workspaceName.trim() })
    .eq("id", orgId);

  // Also ensure organizations_legacy exists for FK integrity
  await supabaseAdmin
    .from("organizations_legacy")
    .upsert(
      {
        id: orgId,
        name: workspaceName.trim(),
        created_at: now,
        phone_number: "", // Empty string for NOT NULL column - will be set during onboarding activation
      },
      { onConflict: "id" }
    );

  await supabaseAdmin
    .from("organizations_legacy")
    .update({ name: workspaceName.trim() })
    .eq("id", orgId);

  // 2) Upsert profile with full_name, phone, org_id
  // Idempotent: upsert will update fields if changed
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: user.id, // profiles.id = auth_user_id
        auth_user_id: user.id,
        email: user.email || "",
        org_id: orgId,
        full_name: fullName.trim(),
        phone: normalizedPhone,
        role: "owner", // First user is owner
      },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("[saveWorkspaceAndProfile] Error upserting profile:", profileError);
    return { ok: false, error: `Failed to save profile: ${profileError.message}` };
  }

  // 3) Ensure organization_settings row exists
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existingSettings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // 4) Update onboarding_step to 1 (move to Language step)
  const { error: stepError } = await supabaseAdmin
    .from("organization_settings")
    .update({ onboarding_step: 1 })
    .eq("org_id", orgId);

  if (stepError) {
    console.error("[saveWorkspaceAndProfile] Error updating step:", stepError);
    return { ok: false, error: `Failed to update step: ${stepError.message}` };
  }

  return { ok: true }; // Advance to Goal step (onboardingStep updated in DB)
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

  // Strict plan check: plan is active only if org_plan_limits.plan_code exists
  // Do NOT check org_plan_overrides - that's just a preference, not active plan
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  if (!planLimits?.plan_code) {
    return { ok: false, error: "NO_PLAN" };
  }

  // Ensure settings row exists
  // Check if exists first, then insert if missing
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  
  if (!existingSettings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // TODO: Wire actual phone number provisioning here
  // Provision phone number via VAPI, create "Main Line" agent, bind number to agent
  // DB step mapping: 5 = Activating, 6 = Live
  // After activation completes, move to step 6 (Live) and mark as completed
  const { error: updateError } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 6, // Step 6 = Live
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  if (updateError) {
    console.error("[activatePhoneNumber] Error updating settings:", updateError);
    return { ok: false, error: updateError.message };
  }

  return { ok: true, phoneNumber: "+1234567890" }; // Placeholder
}

type VapiCreateAssistantResponse = { id: string };
type VapiCreatePhoneNumberResponse = { id: string; number?: string; phoneNumber?: string };

/**
 * Run activation pipeline: provision phone, create Main Line agent, bind number to agent.
 * Server action that executes the full activation flow for onboarding.
 * Called automatically when user reaches Step 4 (Activating).
 */
export async function runActivation(): Promise<
  { ok: true; phoneNumberE164: string | null; vapiPhoneNumberId: string; vapiAssistantId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Get org_id
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<{ org_id: string | null }>();

  if (!profile?.org_id) {
    return { ok: false, error: "No organization found. Please complete workspace setup first." };
  }

  const orgId = profile.org_id;

  // Check plan is active (org_plan_limits.plan_code must exist)
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  if (!planLimits?.plan_code) {
    return { ok: false, error: "Plan not active yet. Please wait for payment confirmation." };
  }

  // Check workspace status and check for existing activation artifacts (idempotency)
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason, onboarding_language, vapi_phone_number_id, vapi_assistant_id, main_agent_id, phone_number_e164")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
      onboarding_language: string | null;
      vapi_phone_number_id?: string | null;
      vapi_assistant_id?: string | null;
      main_agent_id?: string | null;
      phone_number_e164?: string | null;
    }>();

  if (settings?.workspace_status === "paused") {
    const pausedReason = settings.paused_reason;
    if (pausedReason === "hard_cap" || pausedReason === "past_due") {
      return { ok: false, error: "Billing issue. Update payment method to continue." };
    }
    return { ok: false, error: "Workspace is paused. Please resume to continue." };
  }

  // Idempotency check: If activation partially succeeded, resume from existing artifacts
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("vapi_phone_number_id, vapi_assistant_id, main_agent_id, phone_number_e164")
    .eq("org_id", orgId)
    .maybeSingle<{
      vapi_phone_number_id: string | null;
      vapi_assistant_id: string | null;
      main_agent_id: string | null;
      phone_number_e164: string | null;
    }>();

  let phone: VapiCreatePhoneNumberResponse;
  let phoneNumberE164: string | null = null;
  let assistant: VapiCreateAssistantResponse;
  let agentId: string | null = null;

  try {
    // 1) Provision phone number via VAPI (skip if already provisioned)
    if (existingSettings?.vapi_phone_number_id) {
      // Resume: reuse existing phone number ID
      phone = { id: existingSettings.vapi_phone_number_id };
      phoneNumberE164 = existingSettings.phone_number_e164;
      console.log("[runActivation] Resuming with existing phone number:", phone.id);
    } else {
      // Provision new phone number
      const provisioningPayload = {
        provider: "vapi" as const,
      };
      
      if (process.env.NODE_ENV !== "production") {
        console.log("[runActivation] provisioning payload keys:", Object.keys(provisioningPayload));
      }

      try {
        phone = await vapiFetch<VapiCreatePhoneNumberResponse>("/phone-number", {
          method: "POST",
          body: JSON.stringify(provisioningPayload),
        });
        
        // Log successful provisioning response to see which field contains phone number
        if (process.env.NODE_ENV !== "production") {
          console.log("[runActivation] Phone provisioning response:", {
            id: phone?.id,
            number: phone?.number,
            phoneNumber: phone?.phoneNumber,
            keys: phone ? Object.keys(phone) : [],
          });
        }
      } catch (vapiErr) {
        // Catch VAPI 400 errors and return calm user message
        const errorText = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
        console.error("[runActivation] VAPI phone provisioning error:", errorText);
        
        // Check if it's a 400 error (bad request)
        if (errorText.includes("400") || errorText.includes("should not exist") || errorText.includes("must be")) {
          return { ok: false, error: "We couldn't provision your number. Please try again in a minute." };
        }
        
        // For other errors, return generic message
        return { ok: false, error: "We couldn't provision your number. Please try again in a minute." };
      }

      if (!phone?.id) {
        return { ok: false, error: "Failed to provision phone number. Please try again." };
      }

      // Get phone number (E.164 format) if available from response
      // VAPI might return it as 'number' or 'phoneNumber'
      phoneNumberE164 = phone.number || phone.phoneNumber || null;
      
      // If phone number not in response, try fetching it from Vapi using the phone id
      if (!phoneNumberE164 && phone.id) {
        try {
          const phoneDetails = await vapiFetch<{ number?: string; phoneNumber?: string }>(`/phone-number/${phone.id}`);
          phoneNumberE164 = phoneDetails?.number || phoneDetails?.phoneNumber || null;
          
          if (phoneNumberE164) {
            console.log("[runActivation] Retrieved phone number from Vapi details:", phoneNumberE164);
          }
        } catch (fetchErr) {
          console.warn("[runActivation] Could not fetch phone number details from Vapi:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        }
      }
    }

    // 2) Create "Main Line" assistant via VAPI (skip if already created)
    const language = settings?.onboarding_language || "en";
    if (existingSettings?.vapi_assistant_id) {
      // Resume: reuse existing assistant ID
      assistant = { id: existingSettings.vapi_assistant_id };
      console.log("[runActivation] Resuming with existing assistant:", assistant.id);
    } else {
      // Create assistant with ONLY name field (metadata removed - not supported by Vapi)
      assistant = await vapiFetch<VapiCreateAssistantResponse>("/assistant", {
        method: "POST",
        body: JSON.stringify({
          name: "Main Line",
        }),
      });

      if (!assistant?.id) {
        return { ok: false, error: "Failed to create Main Line agent. Please try again." };
      }
    }

    // 3) Bind phone number to assistant (idempotent - safe to call multiple times)
    // CRITICAL: Only send assistantId - do NOT include any phone number fields
    // Vapi expects: { assistantId: string } for binding
    const bindPath = `/phone-number/${phone.id}`;
    
    // Validate phone.id is a valid UUID string (not a phone number E164)
    if (typeof phone.id !== "string" || !phone.id) {
      throw new Error(`Invalid phone.id: expected non-empty string UUID, got ${typeof phone.id}`);
    }
    
    // Validate assistantId is a string (UUID)
    if (typeof assistant.id !== "string" || !assistant.id) {
      throw new Error(`Invalid assistant.id: expected non-empty string UUID, got ${typeof assistant.id}`);
    }
    
    // Build bind payload with ONLY assistantId (no phone fields, no metadata)
    const bindPayload: { assistantId: string } = { assistantId: assistant.id };
    
    // HARD GUARD: Prevent any phone fields or metadata from being sent in binding request
    // This ensures we never send phone/number/metadata fields which cause Vapi TypeError
    // Only key-based validation (value regex incorrectly flags UUIDs)
    const forbiddenKeys = ["phone", "phoneNumber", "phone_number", "number", "metadata"];
    const payloadKeys = Object.keys(bindPayload);
    const hasForbiddenKey = payloadKeys.some((key) => 
      forbiddenKeys.some((forbidden) => key.toLowerCase().includes(forbidden.toLowerCase()))
    );
    
    if (hasForbiddenKey) {
      throw new Error("BUG: Do not send phone fields or metadata when binding a line. Use assistantId only.");
    }
    
    try {
      await vapiFetch(bindPath, {
        method: "PATCH",
        body: JSON.stringify(bindPayload),
      });
    } catch (bindErr) {
      const errorText = bindErr instanceof Error ? bindErr.message : String(bindErr);
      console.error("[runActivation] VAPI phone binding error:", errorText, {
        path: bindPath,
        payload: bindPayload,
        phoneId: phone.id,
        assistantId: assistant.id,
      });
      
      // Check if it's a phone number validation error
      if (errorText.includes("phone number must either be a string") || errorText.includes("TypeError")) {
        return { ok: false, error: "We couldn't bind your phone number. Please try again in a minute." };
      }
      
      // Re-throw other errors
      throw bindErr;
    }

    // 4) Insert agent record into agents table (skip if main_agent_id exists)
    if (existingSettings?.main_agent_id) {
      // Resume: reuse existing agent
      agentId = existingSettings.main_agent_id;
      console.log("[runActivation] Resuming with existing agent:", agentId);
    } else {
      // Create new agent record (DO NOT include phone_number - that column doesn't exist)
      const { data: newAgent, error: agentError } = await supabaseAdmin
        .from("agents")
        .insert({
          org_id: orgId,
          name: "Main Line",
          language,
          voice: "jennifer",
          timezone: "America/New_York",
          created_by: user.id,
          vapi_assistant_id: assistant.id,
          vapi_phone_number_id: phone.id,
          // NOTE: phone_number column does NOT exist in agents table - removed
        })
        .select("id")
        .single<{ id: string }>();

      if (agentError) {
        console.error("[runActivation] Error inserting agent:", agentError);
        // Do NOT set onboarding_step=6 if agent insert fails
        return { ok: false, error: "We couldn't finish setting up your Main Line. Please try again." };
      }

      agentId = newAgent.id;
    }

    // 5) Persist phone number artifacts to organization_settings (upsert by org_id)
    // Only include columns that exist in the table
    const { error: settingsError } = await supabaseAdmin
      .from("organization_settings")
      .upsert(
        {
          org_id: orgId,
          vapi_phone_number_id: phone.id,
          phone_number_e164: phoneNumberE164, // May be null if Vapi didn't return it
          vapi_assistant_id: assistant.id,
          main_agent_id: agentId,
        },
        { onConflict: "org_id" }
      );

    if (settingsError) {
      console.error("[runActivation] Error upserting organization_settings:", settingsError);
      // DO NOT advance onboarding step if settings upsert fails
      return { ok: false, error: "Activation failed. Please try again." };
    }

    // 6) Enforce "no live without number": Only set onboarding_step=6 when phone_number_e164 exists
    if (!phoneNumberE164 || phoneNumberE164.trim() === "") {
      // Phone number not available - keep at step 5 (Activating) and return error
      console.warn("[runActivation] Phone number E164 is missing, keeping onboarding_step at 5");
      return { 
        ok: false, 
        error: "We created your line, but couldn't retrieve the phone number. Retrying…" 
      };
    }

    // 7) Only AFTER successful DB writes AND phone number exists: Update onboarding_step to 6 (Live)
    const { error: stepError } = await supabaseAdmin
      .from("organization_settings")
      .update({
        onboarding_step: 6, // Step 6 = Live (DB step)
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("org_id", orgId);

    if (stepError) {
      console.error("[runActivation] Error updating onboarding step:", stepError);
      // Log error but still return success since activation artifacts were persisted
      // Step update can be retried, but artifacts are critical
    }

    // Log activation completion with artifacts
    console.log("[ACTIVATION][DONE]", {
      org_id: orgId,
      vapiPhoneNumberId: phone.id,
      vapiAssistantId: assistant.id,
      phoneNumberE164: phoneNumberE164 || null,
    });

    return { 
      ok: true, 
      phoneNumberE164: phoneNumberE164 || null,
      vapiPhoneNumberId: phone.id,
      vapiAssistantId: assistant.id,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Activation failed. Please try again.";
    console.error("[runActivation] Unexpected error:", err);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Start Stripe checkout for plan purchase during onboarding.
 * Server action that creates Stripe checkout session directly (no API route).
 * Returns checkout session URL for redirect.
 */
export async function startPlanCheckout(planCode: "starter" | "growth" | "scale") {
  try {
    // 1) Authenticate user with Supabase server client (cookies-based)
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    const hasUser = !!user;
    const userId = user?.id ? `${user.id.substring(0, 8)}...` : null;

    if (authError || !user) {
      logEvent({
        tag: "[ONBOARDING][CHECKOUT_START]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        severity: "warn",
        details: {
          hasUser: false,
          userId: null,
          orgId: null,
          planCode: planCode,
          error: authError?.message || "No user",
        },
      });
      return { ok: false, error: "UNAUTH" };
    }

    // 2) Resolve orgId from profiles using authenticated user id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    const orgId = profiles && profiles.length > 0 ? profiles[0].org_id : null;
    const orgIdMasked = orgId ? `${orgId.substring(0, 8)}...` : null;

    if (!orgId) {
      logEvent({
        tag: "[ONBOARDING][CHECKOUT_START]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        severity: "warn",
        details: {
          hasUser: true,
          userId: userId,
          orgId: null,
          planCode: planCode,
          error: "NO_ORG",
        },
      });
      return { ok: false, error: "NO_ORG" };
    }

    // 3) Validate plan_code
    if (!["starter", "growth", "scale"].includes(planCode)) {
      return { ok: false, error: "Invalid plan_code" };
    }

    // 4) Check workspace status - block if billing paused
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
      }>();

    const workspaceStatus = orgSettings?.workspace_status || "active";
    const pausedReason = orgSettings?.paused_reason || null;

    if (workspaceStatus === "paused" && (pausedReason === "hard_cap" || pausedReason === "past_due")) {
      return { ok: false, error: "BILLING_PAUSED", reason: pausedReason };
    }

    // 5) Get plan details from billing_plan_catalog
    const { data: planData } = await supabaseAdmin
      .from("billing_plan_catalog")
      .select("plan_code, display_name, monthly_fee_usd")
      .eq("plan_code", planCode)
      .maybeSingle<{
        plan_code: string;
        display_name: string;
        monthly_fee_usd: number;
      }>();

    if (!planData) {
      return { ok: false, error: "Plan not found" };
    }

    // 6) Initialize Stripe client
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch (stripeErr) {
      const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Stripe initialization failed";
      logEvent({
        tag: "[ONBOARDING][CHECKOUT_START]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          hasUser: true,
          userId: userId,
          orgId: orgIdMasked,
          planCode: planCode,
          error: errorMsg,
        },
      });
      return { ok: false, error: "Payment service unavailable" };
    }

    // 7) Ensure Stripe customer exists
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, orgId);
    } catch (customerErr) {
      const errorMsg = customerErr instanceof Error ? customerErr.message : "Customer creation failed";
      logEvent({
        tag: "[ONBOARDING][CHECKOUT_START]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          hasUser: true,
          userId: userId,
          orgId: orgIdMasked,
          planCode: planCode,
          error: errorMsg,
        },
      });
      return { ok: false, error: "Failed to setup customer account" };
    }

    // 8) Get APP_URL for return URLs
    // Include session_id in success_url so we can fetch session server-side as fallback if webhook delays
    const appUrl = getBaseUrl();
    const successUrl = `${appUrl}/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/onboarding?checkout=cancel`;

    // 9) Create Stripe Checkout Session
    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode: "subscription", // Recurring subscription
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${planData.display_name} Plan`,
                description: `Monthly subscription for ${planData.display_name} plan`,
              },
              unit_amount: Math.round(planData.monthly_fee_usd * 100), // Convert to cents
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          org_id: orgId,
          plan_code: planCode,
          kind: "onboarding_plan_purchase",
        },
        allow_promotion_codes: true,
      });
    } catch (checkoutErr) {
      const errorMsg = checkoutErr instanceof Error ? checkoutErr.message : "Checkout session creation failed";
      logEvent({
        tag: "[ONBOARDING][CHECKOUT_START]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: {
          hasUser: true,
          userId: userId,
          orgId: orgIdMasked,
          planCode: planCode,
          error: errorMsg,
          stripe_customer_id: stripeCustomerId,
        },
      });
      return { ok: false, error: "Failed to create checkout session" };
    }

    // 10) Log success
    logEvent({
      tag: "[ONBOARDING][CHECKOUT_START]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        hasUser: true,
        userId: userId,
        orgId: orgIdMasked,
        planCode: planCode,
        checkout_session_id: checkoutSession.id,
        amount: planData.monthly_fee_usd,
      },
    });

    // 11) Return checkout URL
    if (!checkoutSession.url) {
      return { ok: false, error: "Checkout session created but no URL returned" };
    }

    return { ok: true, url: checkoutSession.url };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[ONBOARDING][CHECKOUT_START]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        hasUser: false,
        userId: null,
        orgId: null,
        planCode: planCode,
        error: errorMsg,
      },
    });
    return { ok: false, error: errorMsg };
  }
}

/**
 * Handle checkout success - set plan if checkout completed successfully.
 * Called after redirect from Stripe checkout.
 * NOTE: Actual plan setting should be done via Stripe webhook (checkout.session.completed),
 * but this provides optimistic UI update.
 */
export async function handleCheckoutSuccess(checkoutSessionId?: string) {
  // This is a placeholder - actual plan setting happens via Stripe webhook
  // We just refresh the state to check if plan is active
  const state = await getOnboardingState();
  return { ok: true, isPlanActive: state.isPlanActive };
}

/**
 * Set onboarding step to plan selection (step 3).
 * Used when user needs to select a plan before activation.
 */
export async function setOnboardingStepToPlan(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Verify user has access to this org
  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  // Ensure FK parent exists in organizations_legacy
  const { data: existingOrg } = await supabaseAdmin
    .from("organizations_legacy")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  
  if (!existingOrg) {
    await supabaseAdmin
      .from("organizations_legacy")
      .insert({ id: orgId, name: null, created_at: new Date().toISOString() });
  }

  // Ensure settings row exists
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  
  if (!existingSettings) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // Set step to 4 (choose plan)
  // UI step mapping: 0 = Workspace, 1 = Goal+Language, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
  // Called from Phone Intent step (UI step 2), advances to Plan step (DB step 4)
  // User requirement: "Phone intent submit should set onboarding_step = 4 (Plan)"
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 4, // Step 4 = choose plan
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("[setOnboardingStepToPlan] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true }; // Advance to Plan step (onboardingStep updated in DB)
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
  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  // Ensure FK parent exists in organizations_legacy
  // Check if exists first, then insert if missing
  const { data: existingOrgForComplete } = await supabaseAdmin
    .from("organizations_legacy")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  
  if (!existingOrgForComplete) {
    await supabaseAdmin
      .from("organizations_legacy")
      .insert({ id: orgId, name: null, created_at: new Date().toISOString() });
  }

  // Ensure settings row exists
  // Check if exists first, then insert if missing
  const { data: existingSettingsForComplete } = await supabaseAdmin
    .from("organization_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  
  if (!existingSettingsForComplete) {
    await supabaseAdmin
      .from("organization_settings")
      .insert({ org_id: orgId });
  }

  // Step mapping: 0 = goal, 1 = phone number, 2 = choose plan, 3 = activate, 4 = live
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 4, // Step 4 = live
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("[completeOnboarding] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
