"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getStripeClient, ensureStripeCustomer } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { getBaseUrl } from "@/lib/utils/url";
import { logEvent } from "@/lib/observability/logEvent";
import Stripe from "stripe";

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

  // 2) Get org_id using helper
  const orgId = await getActiveOrgId();
  if (!orgId) {
    throw new Error("No organization found for this user.");
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

  // 4) Get organization_settings
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
  // Step mapping: 0 = goal, 1 = phone number, 2 = choose plan (if no plan), 3 = activate, 4 = live
  const rawStep = (settings as any)?.onboarding_step ?? 0;
  
  // 9) Auto-advance logic: If plan is active AND step < 3, set step=3 and persist
  let onboardingStep = rawStep;
  if (isPlanActive && rawStep < 3) {
    onboardingStep = 3; // Activate step
    // Persist step=3 to DB immediately (idempotent)
    await supabaseAdmin
      .from("organization_settings")
      .update({ onboarding_step: 3 })
      .eq("org_id", orgId);
  }

  // 10) If plan is active and step >= 3, redirect to dashboard (paid org should not be in onboarding)
  // But allow step 3-4 to complete onboarding
  if (isPlanActive && onboardingStep >= 4) {
    redirect("/dashboard");
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
    onboardingCountry: onboardingCountry as string | null,
    onboardingAreaCode: onboardingAreaCode as string | null,
    onboardingSelectedNumberType: onboardingSelectedNumberType as string | null,
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
    hasPhoneNumber: !!hasPhoneNumber,
    phoneNumber: agents?.[0]?.phone_number || null,
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
  // Step mapping: 0 = goal, 1 = number, 2 = go-live
  // After saving goal, move to step 1 (number selection)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 1, // Move to step 1 (number selection)
      onboarding_goal: preferences.goal,
      onboarding_language: preferences.language,
    })
    .eq("org_id", orgId);

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
    // Insert new org with name
    const { error: insertError } = await supabaseAdmin
      .from("organizations_legacy")
      .insert({ id: orgId, name, created_at: new Date().toISOString() });
    
    if (insertError) {
      console.error("[saveWorkspaceName] Error creating org:", insertError);
      return { ok: false, error: insertError.message };
    }
  } else {
    // Update org name in organizations_legacy
    const { error: updateError } = await supabaseAdmin
      .from("organizations_legacy")
      .update({ name })
      .eq("id", orgId);
    
    if (updateError) {
      console.error("[saveWorkspaceName] Error updating org name:", updateError);
      return { ok: false, error: updateError.message };
    }
  }
  
  return { ok: true };

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
  // Step mapping: 0 = goal, 1 = phone number, 2 = choose plan, 3 = activate, 4 = live
  // After activation, move to step 4 (live) and mark as completed
  const { error: updateError } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 4, // Step 4 = live
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  if (updateError) {
    console.error("[activatePhoneNumber] Error updating settings:", updateError);
    return { ok: false, error: updateError.message };
  }

  return { ok: true, phoneNumber: "+1234567890" }; // Placeholder
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
    const appUrl = getBaseUrl();
    const successUrl = `${appUrl}/onboarding?checkout=success`;
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
 * Set onboarding step to plan selection (step 2).
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

  // Set step to 2 (choose plan)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 2, // Step 2 = choose plan
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("[setOnboardingStepToPlan] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
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
