"use server";

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getPlanState } from "@/lib/billing/planState";
import { getStripeClient, ensureStripeCustomer } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { getBaseUrl } from "@/lib/utils/url";
import { logEvent } from "@/lib/observability/logEvent";
import { vapiFetch } from "@/lib/vapi/server";
import { ensureAssistantConfig } from "@/lib/vapi/assistantConfig";
import { toLanguageCode } from "@/lib/language/registry";
import { linkAgentToPhoneNumber } from "@/lib/vapi/agentPhoneLink";
import { assignEmployeeToChannel } from "@/lib/platform/assignEmployee";
import Stripe from "stripe";
import { CHANNELS, CHANNEL_ORDER } from "@/lib/platform/channels";
import { byoNumbersEnabled } from "@/lib/platform/flags";
import { canReplyOn } from "@/lib/platform/transports/registry";
import {
  isVoicePlanCode,
  isChatAddonKey,
  CHAT_ADDON_SLOTS,
  VOICE_PLAN_CODES,
} from "@/lib/billing/chatPlanKeys";
import { notifyAiLive } from "@/lib/notifications/activationNotifications";

/**
 * Form action: Bootstrap workspace (Step 0)
 */
export async function bootstrapWorkspaceAction(formData: FormData) {
  const workspaceName = formData.get("workspaceName")?.toString() || "";
  const fullName = formData.get("fullName")?.toString() || "";
  const phone = formData.get("phone")?.toString() || null;
  const website = formData.get("website")?.toString().trim() || null;

  console.log("[onboarding submit] step 0 (workspace bootstrap)");

  if (!workspaceName.trim() || !fullName.trim()) {
    return { ok: false, error: "Workspace name and full name are required." };
  }

  const result = await bootstrapOrgAndProfile(workspaceName.trim(), fullName.trim(), phone?.trim() || null);

  /*
   * The website is saved on THIS path too, not only on `saveWorkspaceAction`.
   *
   * Which of the two runs depends on whether an org already existed when the page rendered —
   * something the customer cannot see and has no reason to care about. When bootstrap won the
   * race, the site they had just typed was silently discarded, and the one field that teaches
   * the AI anything about their business arrived empty.
   */
  if (result.ok && website) {
    await supabaseAdmin
      .from("organization_settings")
      .update({ website_url: website })
      .eq("org_id", result.orgId);
  }

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
  const website = formData.get("website")?.toString().trim() || null;

  console.log("[onboarding submit] step 0 (workspace save)");
  
  if (!orgId || !workspaceName.trim() || !fullName.trim()) {
    return { ok: false, error: "All fields are required." };
  }
  
  const result = await saveWorkspaceAndProfile(orgId, workspaceName.trim(), fullName.trim(), phone?.trim() || null);

  /*
   * The website is stored here and READ later, in the background.
   *
   * Fetching it inline would put an eight-second timeout in front of the Continue button for a
   * field that is optional — so the value is recorded now and `researchWebsiteAction` is fired
   * from the browser once the customer has moved on.
   */
  if (result.ok && website) {
    await supabaseAdmin
      .from("organization_settings")
      .update({ website_url: website })
      .eq("org_id", orgId);
  }

  return result;
}

/**
 * Form action: Save goal and language preferences (Step 1)
 */
export async function saveGoalAndLanguageAction(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  const goal = formData.get("goal")?.toString() || "support";
  // Optional on purpose. It makes the AI specific to this business rather than generic, but a
  // customer who skips it still gets a working employee — so it must never block the step.
  const businessDescription =
    formData.get("businessDescription")?.toString().trim().slice(0, 1000) || null;
  /**
   * The language the employee is born speaking.
   *
   * Normalized through the registry rather than trusted: this value ends up on the Vapi assistant
   * (transcriber + voice) and on the `agents` row, and a code with nothing behind it would produce
   * an employee that claims a language it cannot speak. An unknown value becomes null, which the
   * readers already treat as English — the same behaviour as before this field existed.
   */
  const language = toLanguageCode(formData.get("language")?.toString() ?? null);

  console.log("[onboarding submit] step 1 (goal)", { language });

  if (!orgId) {
    return { ok: false, error: "Organization ID is missing." };
  }

  const result = await saveOnboardingPreferences(orgId, { goal, businessDescription, language });
  return result;
}

/**
 * What the customer asked for at the phone step.
 *
 * The answer used to be discarded: the step wrote an area code and nothing else, so
 * "I don't need a phone line" and "claim me a US number in 415" left the workspace in exactly
 * the same state. Every screen after it then had to infer the intent from the plan — and the
 * plan does not exist yet when the step is answered.
 *
 * NULL (not asked yet) reads as `"new"` everywhere, so a workspace already mid-flow behaves
 * exactly as it did before this column existed.
 */
export type PhoneProvisioningMode = "new" | "byo" | "none";

function toPhoneProvisioningMode(raw: string | null | undefined): PhoneProvisioningMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "byo" || v === "none" ? v : "new";
}

/**
 * Which PRODUCT the customer chose, asked before anything is priced.
 *
 * A different question from `PhoneProvisioningMode`, and asked one screen earlier. The wizard used
 * to open with "what area code?" and then show a single plan screen carrying voice plans, chat
 * tiers and a skip button together — and since the three large cards on that screen are voice
 * plans, "the plans" read as phone service to everyone. A customer who had just said they wanted
 * chat picked one and was rented a US number, monthly, for a product they had declined (R-153).
 *
 * So: what do you want → what size → (voice only) which number. This is the first answer, and it
 * decides which plans are ever SHOWN. `phone_provisioning_mode` is then asked only inside the
 * voice branch; `chat` and `free` imply `none` there, and both are written together.
 */
export type OnboardingProductIntent = "voice" | "chat" | "free";

/**
 * NULL is preserved rather than defaulted, unlike `toPhoneProvisioningMode`.
 *
 * "Not asked" and "asked, answered chat" must stay distinguishable, because activation REFUSES to
 * provision a phone line for a `chat`/`free` intent. Collapsing an unset column onto one of the
 * three values would apply that refusal to every workspace that started before this column
 * existed — a paying voice customer, mid-flow, denied the number they bought. Unknown means
 * unknown, and every reader falls back to its old behaviour.
 */
function toProductIntent(raw: string | null | undefined): OnboardingProductIntent | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "voice" || v === "chat" || v === "free" ? v : null;
}

/**
 * Record what the customer picked, from anywhere that learns it.
 *
 * Never throws and never blocks its caller: this is a preference, and refusing to open a checkout
 * because we could not write it would cost a sale to protect a hint. The one place it is
 * load-bearing — activation's refusal to provision — treats a missing value as "not asked", so a
 * failed write degrades to the old behaviour rather than to the wrong branch.
 */
async function recordProductIntent(
  orgId: string,
  intent: OnboardingProductIntent,
  extra: { phoneProvisioningMode?: PhoneProvisioningMode } = {}
): Promise<void> {
  try {
    const patch: Record<string, string | null> = { onboarding_product_intent: intent };
    if (extra.phoneProvisioningMode) {
      patch.phone_provisioning_mode = extra.phoneProvisioningMode;
      // An area code is a preference about a US number we would buy. Keeping it alongside a
      // `none` intent is how a stale value survives a change of mind and buys a line anyway.
      if (extra.phoneProvisioningMode === "none") patch.phone_desired_area_code = null;
    }
    const { error } = await supabaseAdmin.from("orgs").update(patch).eq("id", orgId);
    if (error) {
      console.warn("[recordProductIntent] could not record intent:", error.message);
    }
  } catch (err) {
    console.warn(
      "[recordProductIntent] could not record intent:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * The AI employee a workspace gets when NO phone line is involved.
 *
 * Every workspace needs an employee, whatever it bought. The first version of the chat short-cut
 * skipped both the phone line and the employee, and a real signup found the cost:
 * `resolveReplyEmployee` returned null, so the reply engine went silent — messages arrived, the
 * paid slot claimed itself, the Inbox filled up, and the customer's AI never answered anyone.
 * Skipping the line was right; skipping the employee was not.
 *
 * A free-preview workspace gets one for the same reason one step later: nothing answers today,
 * but the day its owner buys a chat tier from the billing page, that page grants entitlement and
 * creates no employee — so without this they would buy chat and still be answered by silence.
 *
 * **Touches nothing outside Postgres.** No Vapi assistant, no phone number, no Stripe call — which
 * is what makes it safe to call from a path where the customer has paid nothing. Idempotent: an
 * existing agent is reused, so a re-run cannot create a second one.
 */
async function ensureNonVoiceEmployee(
  orgId: string,
  createdBy: string
): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
  const { data: existingAgent } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let agentId = existingAgent?.id ?? null;

  if (!agentId) {
    const [{ data: org }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
      supabaseAdmin
        .from("organization_settings")
        .select("onboarding_language, onboarding_goal, business_description")
        .eq("org_id", orgId)
        .maybeSingle<{
          onboarding_language: string | null;
          onboarding_goal: string | null;
          business_description: string | null;
        }>(),
    ]);

    const context = seedBusinessContext(org?.name, settings?.business_description);

    const { data: newAgent, error: agentError } = await supabaseAdmin
      .from("agents")
      .insert({
        org_id: orgId,
        // Named for what it does here. "Main Line" is the voice employee's name and would read as
        // a phone line to a customer who deliberately did not buy one.
        name: org?.name?.trim() ? `${org.name.trim()} Assistant` : "Assistant",
        language: settings?.onboarding_language ?? "en",
        timezone: "America/New_York",
        created_by: createdBy,
        agent_type: agentTypeForGoal(settings?.onboarding_goal),
        ...(context ? { business_context: context } : {}),
        // No vapi_assistant_id and no vapi_phone_number_id, on purpose: nothing was provisioned,
        // and writing ids for artifacts that do not exist would break the reconcile paths that
        // trust those columns.
      })
      .select("id")
      .single<{ id: string }>();

    if (agentError || !newAgent?.id) {
      console.error("[ensureNonVoiceEmployee] agent creation failed", agentError?.message);
      return { ok: false, error: "Could not finish setting up your AI. Please try again." };
    }
    agentId = newAgent.id;
  }

  await supabaseAdmin
    .from("organization_settings")
    .update({ main_agent_id: agentId })
    .eq("org_id", orgId);

  return { ok: true, agentId };
}

/**
 * Form action: the customer picks a product — calls, messages, or neither yet.
 *
 * This is the screen that used to ask for an area code. It writes the answer and advances to the
 * plan step, which then shows ONLY that product's plans. Nothing is charged and nothing is
 * provisioned here.
 */
export async function saveProductIntentAction(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  const intent = toProductIntent(formData.get("productIntent")?.toString());

  console.log("[onboarding submit] step 2 (product intent -> plan)", { intent });

  if (!orgId) {
    return { ok: false, error: "Organization ID is missing." };
  }
  if (!intent) {
    // The form always sends one of the three. An empty value means the customer submitted without
    // choosing, and moving them on would pick a product for them.
    return { ok: false, error: "Choose what your AI should answer." };
  }

  const resolvedOrgId = await getActiveOrgId();
  if (!resolvedOrgId || resolvedOrgId !== orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  /**
   * Chat and free imply "no phone line" — written here rather than left for later, because every
   * screen after this one asks "is a line coming?" and the honest answer is already known. Voice
   * deliberately writes NOTHING about the line: which KIND of line is the next question, and
   * guessing `new` now would survive a customer who goes on to choose BYON.
   */
  await recordProductIntent(orgId, intent, {
    phoneProvisioningMode: intent === "voice" ? undefined : "none",
  });

  return await setOnboardingStepToPlan(orgId);
}

/**
 * Form action: Save phone preferences (country + area code) and advance to plan selection
 */
export async function savePhonePreferences(formData: FormData) {
  const orgId = formData.get("orgId")?.toString();
  const country = formData.get("country")?.toString() || "US";
  const areaCode = formData.get("areaCode")?.toString()?.trim() || null;
  const mode = toPhoneProvisioningMode(formData.get("phoneMode")?.toString());

  console.log("[onboarding submit] step 2 (phone intent -> plan)", { country, areaCode, mode });

  if (!orgId) {
    return { ok: false, error: "Organization ID is missing." };
  }

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

  // Normalize area code: if provided, ensure it's exactly 3 digits.
  // A number the customer already owns has no US area code to desire — carrying one over would
  // survive a later change of mind and hand them a 415 line they never asked for.
  const normalizedAreaCode =
    mode === "new" && areaCode && areaCode.length === 3 ? areaCode : null;

  // Update orgs table with phone preferences
  const { error: orgError } = await supabaseAdmin
    .from("orgs")
    .update({
      phone_country_code: country,
      phone_desired_area_code: normalizedAreaCode,
      phone_provisioning_mode: mode,
    })
    .eq("id", orgId);

  if (orgError) {
    console.error("[savePhonePreferences] Error updating orgs:", orgError);
    // If columns don't exist, log but continue (columns will be added via migration)
    if (orgError.code === "PGRST204" || orgError.message?.includes("column") || orgError.message?.includes("does not exist")) {
      console.warn("[savePhonePreferences] phone_country_code/phone_desired_area_code columns may not exist yet, continuing");
    } else {
      return { ok: false, error: orgError.message };
    }
  }

  // Advance to plan step
  const result = await setOnboardingStepToPlan(orgId);
  return result;
}

/*
 * `advanceToPlanAction` was here.
 *
 * It backed the "I don't need a phone line — I want chat" link that sat under the area-code form,
 * and it is gone because the screen it belonged to is gone: the product is now chosen from three
 * cards on its own step, by `saveProductIntentAction`. Removed rather than left exported —
 * an unused server action is still a reachable endpoint, and this one wrote to `orgs`.
 */

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
      businessDescription: null,
      websiteUrl: null,
      chatPlans: [],
      chatChannelOptions: [],
      connectedChatChannels: [],
      emailInboundAddress: null,
      hasPhoneNumber: false,
      hasConnectedLine: false,
      connectedLineE164: null,
      phoneProvisioningMode: "new" as const,
      productIntent: null as OnboardingProductIntent | null,
      byoNumbersEnabled: byoNumbersEnabled(),
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

  // 4) Get organization name from orgs (canonical org table).
  // R-134: this read used to target organizations_legacy, which was DROPped in
  // production by 20260405185521 — so it always returned nothing and the
  // onboarding UI rendered an EMPTY workspace name. orgs.name is the source of
  // truth (settings/_actions/workspace.ts writes it there).
  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("id, name, phone_provisioning_mode, onboarding_product_intent")
    .eq("id", orgId)
    .maybeSingle();

  const orgName = org?.name || "";

  /**
   * What the customer asked for at the phone step. NULL means they have not reached it yet, and
   * reads as `"new"` — the behaviour every workspace had before the column existed.
   */
  const phoneProvisioningMode = toPhoneProvisioningMode(
    (org as { phone_provisioning_mode?: string | null } | null)?.phone_provisioning_mode
  );

  /**
   * Which product they picked — calls, messages, or neither yet. Decides which plans the plan step
   * is even allowed to show. NULL stays NULL: a workspace that started before this question
   * existed has not answered it, and the wizard falls back to showing both rather than guessing.
   */
  const productIntent = toProductIntent(
    (org as { onboarding_product_intent?: string | null } | null)?.onboarding_product_intent
  );

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

  /**
   * 7) What has this workspace bought?
   *
   * Two different questions that used to share one answer. `planCode` is the VOICE plan and stays
   * null for a chat customer — the wizard uses it to decide whether there is a phone line coming.
   * `isPlanActive` asks whether anything was bought at all, which is what moves the wizard on;
   * reading it off `plan_code` sent a chat customer back to the plan step they had just paid on.
   */
  const planState = await getPlanState(orgId);
  const planCode = planState.voicePlanCode;
  const isPlanActive = planState.hasAnyPlan;

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
    .in("plan_code", [...VOICE_PLAN_CODES])
    .order("plan_code");

  const plans = plansData || [];

  // 11b) The chat tiers, for a customer who wants an AI that answers messages and no phone line.
  //
  // `stripe_price_id IS NOT NULL` is a deliberate part of the query, not an afterthought: a tier
  // whose Stripe price is unconfigured cannot be charged for, so it must not be offered. That is
  // the same fail-closed rule the add-on route and `startChatCheckout` apply — enforced here too,
  // so the customer never sees a button that would refuse them.
  const { data: chatPlansData } = await supabaseAdmin
    .from("billing_addon_catalog")
    .select("addon_key, label, price_usd_month")
    .in("addon_key", Object.keys(CHAT_ADDON_SLOTS))
    .eq("is_active", true)
    .not("stripe_price_id", "is", null)
    .order("price_usd_month");

  // Which channels a chat slot can actually be spent on. `canReplyOn` — not the registry's
  // `capabilities.outbound` — is the honest measure: messenger, WhatsApp, SMS and web chat all
  // declare outbound while having no transport behind them, so listing those would offer a
  // customer a channel their AI cannot answer on.
  const chatChannelOptions = CHANNEL_ORDER.filter(
    (c) => CHANNELS[c].kind === "chat" && canReplyOn(c)
  ).map((c) => ({ id: c as string, label: CHANNELS[c].label }));

  // Which channels this workspace has already connected, so the last step can show what is
  // done rather than asking again. `status = 'connected'` is the value both connection
  // libraries write; an errored or revoked connection reads as not connected, which is the
  // honest answer — the AI cannot answer through it.
  const [telegramConns, emailConns] = await Promise.all([
    supabaseAdmin
      .from("telegram_connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "connected")
      .limit(1),
    supabaseAdmin
      .from("email_connections")
      .select("id, inbound_address")
      .eq("org_id", orgId)
      .eq("status", "connected")
      .limit(1),
  ]);

  const connectedChatChannels: string[] = [];
  if ((telegramConns.data || []).length > 0) connectedChatChannels.push("telegram");
  if ((emailConns.data || []).length > 0) connectedChatChannels.push("email");
  // The address Denku issued for them to forward to — the one thing the email card must show
  // after connecting, because the customer has to go and set the forward up themselves.
  const emailInboundAddress =
    (emailConns.data?.[0] as { inbound_address?: string } | undefined)?.inbound_address ?? null;

  const chatPlans = (chatPlansData || []).map((row) => ({
    addon_key: row.addon_key as string,
    label: row.label as string,
    price_usd_month: Number(row.price_usd_month),
    channels: CHAT_ADDON_SLOTS[row.addon_key as string] ?? 1,
  }));

  // 12) Get saved onboarding preferences (goal, language, country, area_code, selected_number_type)
  const onboardingGoal = (settings as any)?.onboarding_goal || null;
  const businessDescription = (settings as any)?.business_description || null;
  const websiteUrl = (settings as any)?.website_url || null;
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
  const phoneNumberSipUri = (settings as any)?.phone_number_sip_uri || null;
  const vapiPhoneNumberId = (settings as any)?.vapi_phone_number_id || null;
  const vapiAssistantId = (settings as any)?.vapi_assistant_id || null;
  const mainAgentId = (settings as any)?.main_agent_id || null;
  const hasPhoneNumber = !!vapiPhoneNumberId;

  /**
   * Does this workspace have a line at all — bought OR connected?
   *
   * `vapiPhoneNumberId` on `organization_settings` only ever holds a line WE provisioned. A number
   * the customer brought over their own carrier lands in `phone_lines` and nowhere else, so the
   * Live step would keep asking them to connect a number they had already connected.
   */
  const { data: connectedLine } = await supabaseAdmin
    .from("phone_lines")
    .select("phone_number_e164")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ phone_number_e164: string | null }>();

  const hasConnectedLine = !!connectedLine;
  const connectedLineE164 = connectedLine?.phone_number_e164 ?? null;

  return {
    orgId,
    orgName,
    role,
    onboardingStep: uiStep as number, // Return UI step, not DB step
    onboardingGoal: onboardingGoal as string | null,
    businessDescription: businessDescription as string | null,
    websiteUrl: websiteUrl as string | null,
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
    chatPlans,
    chatChannelOptions,
    connectedChatChannels,
    emailInboundAddress,
    hasPhoneNumber,
    hasConnectedLine,
    connectedLineE164,
    phoneProvisioningMode,
    productIntent,
    /**
     * Whether connecting a number the customer already owns is switched on in this environment.
     * The card is rendered from this rather than hardcoded, so an environment where the flag is
     * off never offers a path that `/api/phone-lines/connect` would refuse with a 404.
     */
    byoNumbersEnabled: byoNumbersEnabled(),
    phoneNumber: phoneNumberE164, // Return E164 phone number from organization_settings (DB truth)
    phoneNumberE164, // Also include as separate field for clarity
    phoneNumberSipUri, // SIP URI for provider="vapi" lines
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
  preferences: { goal: string; businessDescription?: string | null; language?: string | null }
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
  // DB step mapping: 1 = Goal, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
  // Goal submit advances to Phone Intent (step 3)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 3, // Move to step 3 (Phone Intent) after Goal selection
      onboarding_goal: preferences.goal,
      // Only overwrite when something was typed, so going Back and forward again does not
      // erase a description the customer already gave.
      ...(preferences.businessDescription
        ? { business_description: preferences.businessDescription }
        : {}),
      /**
       * The column activation has always read and nobody ever wrote.
       *
       * `runActivation` puts this on the Vapi assistant AND on the `agents` row, and
       * `resolveWorkspaceLineDefaults` reads it when a BYO number is connected — all three fell
       * through to English because the wizard had no language question. Written only when the
       * registry recognised the value, so a malformed submit leaves the previous answer alone
       * instead of resetting the workspace to English.
       */
      ...(preferences.language ? { onboarding_language: preferences.language } : {}),
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

    /*
     * THE FIRST CONTINUE MUST MOVE.
     *
     * This branch runs whenever an org already exists — which, after a normal signup, it always
     * does. It used to return the step it found, still 0, so the form re-rendered the very same
     * screen: the customer's first click did nothing, and only the second one (by then routed to
     * `saveWorkspaceAction`, because the client had learned the org id) advanced them. A button
     * that needs pressing twice reads as a broken product on the first screen of the product.
     *
     * The workspace step has now genuinely been completed by the time we get here — the name and
     * profile were just written above — so the step moves with it. Forward-only, like every other
     * write in this machine: a workspace already past Goal is never dragged back to it.
     */
    if (existingStep < 1) {
      const { error: stepError } = await supabaseAdmin
        .from("organization_settings")
        .upsert({ org_id: existingOrgId, onboarding_step: 1 }, { onConflict: "org_id" });

      if (stepError) {
        console.error("[bootstrapOrgAndProfile] Error advancing onboarding_step:", stepError);
        return { ok: false, error: "Could not save your workspace. Please try again." };
      }

      return { ok: true, orgId: existingOrgId, onboardingStep: 1 };
    }

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
 * Activate phone number for onboarding.
 *
 * This server action keeps the legacy UI contract (`{ ok, phoneNumber }`)
 * but delegates the real provisioning work to `runActivation()`, which is
 * our idempotent activation pipeline.
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

  /**
   * A phone number needs a VOICE plan specifically — not merely "a plan".
   *
   * This is the one gate that must NOT widen now that chat is a product of its own. Chat carries
   * no minutes, no concurrency and no included numbers, so a chat customer reaching this would
   * buy a US line, monthly, against capacity they do not have. `hasAnyPlan` would have let them.
   *
   * Deliberately still ignores `org_plan_overrides`: that is a preference, not a purchase.
   */
  const planState = await getPlanState(orgId);
  if (!planState.voicePlanCode) {
    return { ok: false, error: "NO_PLAN" };
  }

  if (country !== "US") {
    return { ok: false, error: "Only US phone numbers are supported right now." };
  }

  const normalizedAreaCode =
    typeof areaCode === "string" && /^\d{3}$/.test(areaCode.trim())
      ? areaCode.trim()
      : null;

  // Persist latest phone preferences so the activation pipeline provisions
  // against the number the user just selected in onboarding.
  const { error: orgUpdateError } = await supabaseAdmin
    .from("orgs")
    .update({
      phone_country_code: "US",
      phone_desired_area_code: normalizedAreaCode,
    })
    .eq("id", orgId);

  if (
    orgUpdateError &&
    orgUpdateError.code !== "PGRST204" &&
    !orgUpdateError.message?.includes("column") &&
    !orgUpdateError.message?.includes("does not exist")
  ) {
    console.error("[activatePhoneNumber] Error saving phone preferences:", orgUpdateError);
    return { ok: false, error: "Failed to save phone preferences." };
  }

  // Ensure onboarding shows Activating while the real pipeline runs.
  const { error: stepError } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        onboarding_step: 5,
      },
      { onConflict: "org_id" }
    );

  if (stepError) {
    console.error("[activatePhoneNumber] Error setting onboarding step to activating:", stepError);
    return { ok: false, error: "Failed to start activation." };
  }

  const activationResult = await runActivation();

  if (!activationResult.ok) {
    return activationResult;
  }

  return { ok: true, phoneNumber: activationResult.phoneNumberE164 ?? null };
}

type VapiCreateAssistantResponse = { id: string };
type VapiCreatePhoneNumberResponse = { id: string; number?: string; phoneNumber?: string; status?: string };
type VapiPhoneNumberDetails = { id: string; number?: string; phoneNumber?: string; status?: "activating" | "active" | string };

/**
 * Run activation pipeline: provision phone, create Main Line agent, bind number to agent.
 * Server action that executes the full activation flow for onboarding.
 * Called automatically when user reaches Step 4 (Activating).
 */
/**
 * What a brand-new AI employee knows about the business on day one.
 *
 * Both activation paths call this — the voice one and the chat-only one — because the business's
 * facts must be the same whichever channel a customer reaches. A second copy would drift, and
 * the first symptom would be an AI quoting different services on the phone than in Telegram.
 *
 * It is deliberately thin: the workspace name and the one sentence onboarding asked for. The
 * other seven Knowledge fields are left empty rather than guessed, because both system prompts
 * refuse to state a fact that is not in this block — so a guessed opening time would not merely
 * be wrong, it would be spoken to a customer as though the business had said it.
 *
 * Returns null when there is nothing to seed, so the employee is created exactly as it is
 * today rather than carrying an empty object that reads as "context was configured".
 */
function seedBusinessContext(
  orgName: string | null | undefined,
  businessDescription: string | null | undefined
): Record<string, string> | null {
  const name = orgName?.trim();
  const services = businessDescription?.trim();
  if (!name && !services) return null;

  const ctx: Record<string, string> = {};
  if (name) ctx.businessName = name;
  if (services) ctx.services = services;
  return ctx;
}

/**
 * The goal the customer picked at step 1, as the employee's type.
 *
 * `onboarding_goal` was written at signup and read by nothing — we asked what the AI was for and
 * then threw the answer away. It maps straight onto `agents.agent_type`, which the prompt
 * derivation already understands.
 */
function agentTypeForGoal(goal: string | null | undefined): string | null {
  const g = (goal ?? "").trim().toLowerCase();
  return g === "support" || g === "sales" || g === "ops" ? g : null;
}

export async function runActivation(): Promise<
  | {
      ok: true;
      phoneNumberE164: string | null;
      phoneNumberSipUri: string | null;
      // Null for a chat-only workspace: there is no line to provision and no assistant to
      // answer it. Every other plan still returns both.
      vapiPhoneNumberId: string | null;
      vapiAssistantId: string | null;
    }
  | { ok: false; error: string }
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

  /**
   * Something must have been bought — voice, chat, or both.
   *
   * Asked of `planState` rather than of `plan_code`, because a chat customer has no voice plan at
   * all now that `chat_only` is retired, and reading the column directly would refuse to activate
   * the workspace they just paid for.
   */
  const planState = await getPlanState(orgId);

  if (!planState.hasAnyPlan) {
    return { ok: false, error: "Plan not active yet. Please wait for payment confirmation." };
  }

  /**
   * A workspace that already finished onboarding has nothing to activate — and re-activating it
   * SPENDS MONEY.
   *
   * This guard exists because it happened. A chat purchase returned the customer to `/onboarding`
   * instead of the page they bought from; the wizard ran activation on a workspace that had been
   * live for months; and because the org had a voice plan, activation did what it is for and
   * bought a brand-new US phone line — plus an extra AI Employee to assign it to. Nothing was
   * broken. Every step did its job. The workspace simply should never have been here.
   *
   * The routing bug is fixed above, but a mistake in ANY caller must not be able to buy a phone
   * number again, so the refusal lives here too. Step 6 is Live; there is no work left at 6.
   *
   * Reported as success, not as an error: the caller asked for a live workspace and there is one.
   */
  const { data: onboardingState } = await supabaseAdmin
    .from("organization_settings")
    .select("onboarding_step")
    .eq("org_id", orgId)
    .maybeSingle<{ onboarding_step: number | null }>();

  if ((onboardingState?.onboarding_step ?? 0) >= 6) {
    logEvent({
      tag: "[ONBOARDING][ACTIVATION][ALREADY_LIVE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: { reason: "activation asked for a workspace that is already live — refused" },
    });
    // Shaped like a successful activation with nothing provisioned, so every caller reads it the
    // same way an already-finished run reads.
    return {
      ok: true as const,
      phoneNumberE164: null,
      phoneNumberSipUri: null,
      vapiPhoneNumberId: null,
      vapiAssistantId: null,
    };
  }

  /**
   * What the customer chose, and what kind of line they asked for. Read once, here, because BOTH
   * questions gate the branch below and one of them can override a paid plan.
   */
  const { data: intentOrg } = await supabaseAdmin
    .from("orgs")
    .select("phone_provisioning_mode, onboarding_product_intent")
    .eq("id", orgId)
    .maybeSingle<{
      phone_provisioning_mode: string | null;
      onboarding_product_intent: string | null;
    }>();

  const phoneMode = toPhoneProvisioningMode(intentOrg?.phone_provisioning_mode);
  const productIntent = toProductIntent(intentOrg?.onboarding_product_intent);

  /**
   * **A customer is never given a product they did not pick.**
   *
   * `declinedVoice` is the hard stop. A workspace whose owner chose "messages" or "look around
   * first" does not get a phone line — not even if `org_plan_limits` says it holds a voice plan.
   * That combination cannot arise from the wizard any more (the voice plans are only rendered
   * inside the voice branch, and both checkout actions re-stamp the intent from what was actually
   * bought), which is exactly why treating it as an error rather than a preference is safe: if it
   * happens, something is wrong, and the wrong thing to do is quietly rent someone a US number.
   *
   * This replaces the older "the plan wins, log a warning, provision anyway" rule. That rule was
   * written when the wizard could genuinely produce the contradiction and refusing would have left
   * a paying customer with no line. It cannot now.
   *
   * NULL intent is NOT a decline — a workspace that started before this question existed has not
   * answered it, and falls through to the plan-based behaviour it has always had.
   */
  const declinedVoice = productIntent === "chat" || productIntent === "free";

  if (declinedVoice && planState.voicePlanCode) {
    logEvent({
      tag: "[ONBOARDING][ACTIVATION][INTENT_MISMATCH]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: {
        reason: "workspace holds a voice plan against a non-voice intent — refusing to provision",
        product_intent: productIntent,
        voice_plan_code: planState.voicePlanCode,
      },
    });
  }

  /**
   * A workspace with no VOICE plan — or one whose owner declined voice — has nothing to provision.
   *
   * Activation exists to create a Vapi assistant and provision a phone number. A chat customer
   * has neither minutes nor concurrency nor numbers — running any of that would buy a US phone
   * line, every month, for someone who bought chat. So this path skips straight to Live.
   *
   * The condition used to be `plan_code === "chat_only"`, which was the same test wearing a
   * fiction: it asked whether the workspace was on a $0 voice plan invented to mean "no voice".
   * Asking for the absence of a voice plan says the same thing and survives the fiction's
   * retirement.
   *
   * The wizard needs no special handling for it: the phone-status poll on the Live step is
   * guarded on `vapiPhoneNumberId`, which stays null here, so it never starts and never waits
   * for an E164 that will never arrive.
   *
   * Idempotent like the rest of activation — `completeOnboarding` writes step 6, and steps only
   * ever move forward.
   */
  if (!planState.voicePlanCode || declinedVoice) {
    /**
     * Still an AI EMPLOYEE — just no Vapi assistant and no phone number. Unlike the voice path's
     * agent, this one is NOT optional: without it the reply engine has nobody to answer as, and
     * finishing setup would hand the customer a product that stays silent.
     */
    const employee = await ensureNonVoiceEmployee(orgId, user.id);
    if (!employee.ok) {
      return { ok: false, error: employee.error };
    }

    const completed = await completeOnboarding(orgId);
    if (!completed.ok) {
      return { ok: false, error: completed.error || "Could not finish setup. Please try again." };
    }

    logEvent({
      tag: "[ONBOARDING][ACTIVATION][NO_VOICE_LINE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        // Two different reasons land here and they are worth telling apart in the log: no voice
        // plan was bought, or one was bought against an intent that declined voice (which is a
        // defect, and is logged as an error above as well).
        reason: declinedVoice
          ? "owner did not choose voice — no phone line provisioned"
          : "no voice plan — no phone line to provision",
        product_intent: productIntent,
        voice_plan_code: planState.voicePlanCode,
      },
    });

    return {
      ok: true,
      phoneNumberE164: null,
      phoneNumberSipUri: null,
      vapiPhoneNumberId: null,
      vapiAssistantId: null,
    };
  }

  /**
   * Past this point the workspace holds a voice plan AND its owner chose voice, so a line is being
   * built. `phoneMode` (read above) decides which KIND: `"byo"` means they already own a number
   * and will point their carrier at us, so buying them a US one would rent a second number they
   * never asked for and bill it every month.
   */

  // Check workspace status and check for existing activation artifacts (idempotency)
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason, onboarding_language, onboarding_goal, business_description, vapi_phone_number_id, vapi_assistant_id, main_agent_id, phone_number_e164")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
      onboarding_language: string | null;
      onboarding_goal?: string | null;
      business_description?: string | null;
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
    .select("vapi_phone_number_id, vapi_assistant_id, main_agent_id, phone_number_e164, phone_number_sip_uri")
    .eq("org_id", orgId)
    .maybeSingle<{
      vapi_phone_number_id: string | null;
      vapi_assistant_id: string | null;
      main_agent_id: string | null;
      phone_number_e164: string | null;
      phone_number_sip_uri?: string | null;
    }>();

  let phone: VapiCreatePhoneNumberResponse | null = null;
  let phoneNumberE164: string | null = null;
  let assistant: VapiCreateAssistantResponse;
  let agentId: string | null = null;

  try {
    // A) Resolve org_id and ensure plan is ACTIVE (already done above)
    
    // 1) Ensure Main Line assistant exists (DB lookup by org_id; if missing create in Vapi; persist vapi_assistant_id)
    if (existingSettings?.vapi_assistant_id) {
      // Idempotent: reuse existing assistant ID from DB
      assistant = { id: existingSettings.vapi_assistant_id };
      console.log("[runActivation] Resuming with existing assistant from DB:", assistant.id);
    } else {
      // Get workspace name for interpolation
      const { data: org } = await supabaseAdmin
        .from("orgs")
        .select("name")
        .eq("id", orgId)
        .maybeSingle<{ name: string | null }>();
      
      const workspaceName = org?.name?.trim() || "your company"; // Safe fallback

      // Create assistant in Vapi with Main Line defaults.
      // Note: Do NOT send top-level "tools" field (it causes 400). Tools + the canonical
      // webhook server.url are attached right after creation via ensureAssistantConfig (R-050/R-077).
      const assistantPayload = {
        name: "Main Line",
        firstMessage: `Hi — thanks for calling ${workspaceName}. How can I help today?`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are the phone assistant for ${workspaceName}.
Be concise, friendly, and solution-oriented.
If the caller has an issue to track or needs help from a human, create a ticket using the create_ticket tool.
If the caller wants to book time or an appointment, use the create_appointment tool.
Always confirm the caller's name, phone number, and a short summary before submitting.`,
            },
          ],
        },
      };

      assistant = await vapiFetch<VapiCreateAssistantResponse>("/assistant", {
        method: "POST",
        body: JSON.stringify(assistantPayload),
      });

      if (!assistant?.id) {
        return { ok: false, error: "Failed to create Main Line agent. Please try again." };
      }
      
      // Persist vapi_assistant_id to DB immediately (idempotent)
      const { error: persistAssistantError } = await supabaseAdmin
        .from("organization_settings")
        .upsert({ org_id: orgId, vapi_assistant_id: assistant.id }, { onConflict: "org_id" });
      
      if (persistAssistantError) {
        console.error("[runActivation] Error persisting vapi_assistant_id:", persistAssistantError);
        // Continue anyway - assistant was created in Vapi
      }
      
      console.log("[runActivation] Created and persisted new assistant:", assistant.id);
    }

    // Attach tools (create_ticket / create_appointment) and the canonical webhook
    // server.url via the shared config helper (R-050 + R-077). Non-fatal: the
    // deterministic post-call fallback still produces artifacts if this hiccups, and
    // the reconciliation endpoint can re-apply later.
    const configResult = await ensureAssistantConfig({
      assistantId: assistant.id,
      language: settings?.onboarding_language ?? "en", // R-051: drives voice + transcriber
    });
    if (!configResult.ok) {
      console.error("[runActivation] ensureAssistantConfig failed (non-fatal, continuing):", configResult.error);
    }

    /**
     * 1b) The customer already owns their number.
     *
     * Everything above this point is the same for every voice workspace — an assistant exists and
     * is configured. What differs is the LINE, and here there is nothing for us to buy: the
     * customer will point their carrier's SIP trunk at us from `/dashboard/channels/phone-numbers`
     * (or from the last onboarding step, which offers the same flow). Falling through would rent
     * them a US number on top of the one they already pay for.
     *
     * So this path finishes setup with an employee and no line, and the Live step asks them to
     * connect theirs. `completeOnboarding` is the same call the chat-only path makes, and steps
     * only ever move forward, so a re-run is a no-op.
     *
     * Deliberately AFTER the resume check below in spirit but before it in code: if a line was
     * already provisioned for this org (a customer who changed their mind mid-flow), the resume
     * branch below owns it and this must not run.
     */
    if (phoneMode === "byo" && !existingSettings?.vapi_phone_number_id) {
      let byoAgentId = existingSettings?.main_agent_id ?? null;

      if (!byoAgentId) {
        const { data: byoOrg } = await supabaseAdmin
          .from("orgs")
          .select("name")
          .eq("id", orgId)
          .maybeSingle<{ name: string | null }>();
        const byoContext = seedBusinessContext(byoOrg?.name, settings?.business_description);

        const { data: byoAgent, error: byoAgentError } = await supabaseAdmin
          .from("agents")
          .insert({
            org_id: orgId,
            name: "Main Line",
            language: settings?.onboarding_language ?? "en",
            voice: "jennifer",
            timezone: "America/New_York",
            created_by: user.id,
            vapi_assistant_id: assistant.id,
            // No vapi_phone_number_id: there is no line yet. `connectByoNumber` writes the link
            // when the customer's own number is connected.
            agent_type: agentTypeForGoal(settings?.onboarding_goal),
            ...(byoContext ? { business_context: byoContext } : {}),
          })
          .select("id")
          .single<{ id: string }>();

        if (byoAgentError || !byoAgent?.id) {
          // Same rule as the chat-only path: without an employee there is nothing to connect the
          // customer's number TO, so finishing here would hand them a dead end.
          console.error("[runActivation] BYO agent creation failed", byoAgentError?.message);
          return { ok: false, error: "Could not finish setting up your AI. Please try again." };
        }
        byoAgentId = byoAgent.id;
      }

      const { error: byoSettingsError } = await supabaseAdmin
        .from("organization_settings")
        .upsert(
          { org_id: orgId, vapi_assistant_id: assistant.id, main_agent_id: byoAgentId },
          { onConflict: "org_id" }
        );
      if (byoSettingsError) {
        console.error("[runActivation] Error persisting BYO activation artifacts:", byoSettingsError);
      }

      const byoCompleted = await completeOnboarding(orgId);
      if (!byoCompleted.ok) {
        return { ok: false, error: byoCompleted.error || "Could not finish setup. Please try again." };
      }

      logEvent({
        tag: "[ONBOARDING][ACTIVATION][BYO_NUMBER_PENDING]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: { reason: "customer brings their own number — no US line provisioned" },
      });

      return {
        ok: true as const,
        phoneNumberE164: null,
        phoneNumberSipUri: null,
        vapiPhoneNumberId: null,
        vapiAssistantId: assistant.id,
      };
    }

    // 2) Provision PSTN number using: POST /phone-number { provider:'vapi', numberDesiredAreaCode:'321', assistantId:<vapi_assistant_id> }
    if (existingSettings?.vapi_phone_number_id) {
      // Resume: reuse existing phone number ID
      phone = { id: existingSettings.vapi_phone_number_id };
      phoneNumberE164 = existingSettings.phone_number_e164 || null;
      console.log("[runActivation] Resuming with existing phone number:", phone.id);
      
      // If phone number exists but E164 is missing, fetch it
      if (!phoneNumberE164 && phone.id) {
        try {
          const phoneDetails = await vapiFetch<VapiPhoneNumberDetails>(`/phone-number/${phone.id}`);
          phoneNumberE164 = phoneDetails?.number ?? phoneDetails?.phoneNumber ?? null;
        } catch (fetchErr) {
          console.warn("[runActivation] Could not fetch existing phone details:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        }
      }
    } else {
      // Get stored area code from orgs table (with fallback to "321")
      const { data: org } = await supabaseAdmin
        .from("orgs")
        .select("phone_desired_area_code")
        .eq("id", orgId)
        .maybeSingle<{ phone_desired_area_code: string | null }>();
      
      let desiredAreaCode = org?.phone_desired_area_code?.trim() || null;
      
      // Validate area code is 3 digits (safety check)
      if (desiredAreaCode && desiredAreaCode.length !== 3) {
        console.warn("[runActivation] Invalid area code length, using fallback:", desiredAreaCode);
        desiredAreaCode = null;
      }
      
      // Use stored area code if valid, otherwise fallback to "321"
      const areaCodeToUse = desiredAreaCode || "321";
      
      // Provision new phone number WITH assistantId at CREATE time (no PATCH binding needed)
      const provisioningPayload = {
        provider: "vapi" as const,
        numberDesiredAreaCode: areaCodeToUse,
        assistantId: assistant.id, // Bind at creation time
      };
      
      console.log("[runActivation] Provisioning PSTN phone with assistantId:", {
        areaCode: provisioningPayload.numberDesiredAreaCode,
        assistantId: assistant.id,
        isUserProvided: !!desiredAreaCode,
      });

      let provisioningAttempt = 0;
      const maxAttempts = 2;
      let lastError: Error | null = null;

      // Retry logic: if user-provided area code fails, retry with "321"
      while (provisioningAttempt < maxAttempts) {
        try {
          phone = await vapiFetch<VapiCreatePhoneNumberResponse>("/phone-number", {
            method: "POST",
            body: JSON.stringify(provisioningPayload),
          });
          
          console.log("[runActivation] Phone provisioning response:", {
            id: phone?.id,
            number: phone?.number,
            phoneNumber: phone?.phoneNumber,
            status: phone?.status,
            attempt: provisioningAttempt + 1,
          });
          
          // Success - break out of retry loop
          break;
        } catch (vapiErr) {
          lastError = vapiErr instanceof Error ? vapiErr : new Error(String(vapiErr));
          const errorText = lastError.message;
          
          console.error(`[runActivation] VAPI phone provisioning error (attempt ${provisioningAttempt + 1}):`, errorText);
          
          // If this was the first attempt with user-provided area code and it failed, retry with "321"
          if (provisioningAttempt === 0 && desiredAreaCode && areaCodeToUse === desiredAreaCode) {
            console.log("[runActivation] Retrying with fallback area code 321");
            provisioningPayload.numberDesiredAreaCode = "321";
            provisioningAttempt++;
            continue;
          }
          
          // Otherwise, return error
          if (errorText.includes("400") || errorText.includes("should not exist") || errorText.includes("must be")) {
            return { ok: false, error: "We couldn't provision your number. Please try again in a minute." };
          }
          
          return { ok: false, error: "We couldn't provision your number. Please try again in a minute." };
        }
      }
      
      // If we exhausted retries, return error
      if (!phone?.id) {
        return { ok: false, error: "Failed to provision phone number. Please try again." };
      }

      // E) Handle status: If status === "activating", poll until "active" or get details
      // Get phone details immediately to check status and get phone_number_e164
      let phoneStatus = phone.status;
      let pollAttempts = 0;
      const maxPolls = 10; // Poll up to 10 times (5 seconds with 500ms delay)
      
      while (phoneStatus === "activating" && pollAttempts < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before next poll
        pollAttempts++;
        
        try {
          const phoneDetails = await vapiFetch<VapiPhoneNumberDetails>(`/phone-number/${phone.id}`);
          phoneStatus = phoneDetails?.status || "activating";
          
          // Try to get phone number E164 from details
          if (phoneDetails?.number || phoneDetails?.phoneNumber) {
            phoneNumberE164 = phoneDetails.number ?? phoneDetails.phoneNumber ?? null;
          }
          
          if (phoneStatus === "active") {
            console.log("[runActivation] Phone number is now active after polling:", { id: phone.id, attempts: pollAttempts });
            break;
          }
        } catch (pollErr) {
          console.warn("[runActivation] Error polling phone status:", pollErr instanceof Error ? pollErr.message : String(pollErr));
        }
      }
      
      // Get final phone details (E164 should be available after status is "active")
      if (!phoneNumberE164) {
        try {
          const phoneDetails = await vapiFetch<VapiPhoneNumberDetails>(`/phone-number/${phone.id}`);
          phoneNumberE164 = phoneDetails?.number ?? phoneDetails?.phoneNumber ?? null;
          
          console.log("[runActivation] Phone details after provisioning:", {
            id: phoneDetails?.id,
            number: phoneNumberE164,
            status: phoneDetails?.status,
          });
        } catch (fetchErr) {
          console.warn("[runActivation] Could not fetch phone details from Vapi:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        }
      }
      
      // If status is still "activating" after polling, allow UI to continue (phone will activate in background)
      if (phoneStatus === "activating") {
        console.log("[runActivation] Phone number is still activating after polls, allowing UI to continue");
      }
    }

    // 3) Persist vapi_phone_number_id + phone_number_e164 + vapi_assistant_id
    if (!phone?.id) {
      return { ok: false, error: "Phone number ID is missing. Please try again." };
    }

    // Build upsert payload - only include columns that exist
    const settingsPayload: Record<string, unknown> = {
      org_id: orgId,
      vapi_phone_number_id: phone.id,
      vapi_assistant_id: assistant.id,
      phone_number_e164: phoneNumberE164, // May be null if still "activating"
    };
    
    // Only include main_agent_id if agentId exists AND column exists (defensive)
    if (existingSettings?.main_agent_id) {
      agentId = existingSettings.main_agent_id;
    } else {
      // Try to create agent record, but don't fail if it errors (optional)
      try {
        const { data: seedOrg } = await supabaseAdmin
          .from("orgs")
          .select("name")
          .eq("id", orgId)
          .maybeSingle<{ name: string | null }>();
        const voiceContext = seedBusinessContext(seedOrg?.name, settings?.business_description);

        const { data: newAgent } = await supabaseAdmin
          .from("agents")
          .insert({
            org_id: orgId,
            name: "Main Line",
            language: settings?.onboarding_language ?? "en",
            voice: "jennifer",
            timezone: "America/New_York",
            created_by: user.id,
            vapi_assistant_id: assistant.id,
            vapi_phone_number_id: phone.id,
            // Seeded from the same two answers as the chat employee. Voice shipped with an empty
            // business context too, so every Denku AI has been starting out unable to state a
            // single fact about the business it answers for.
            agent_type: agentTypeForGoal(settings?.onboarding_goal),
            ...(voiceContext ? { business_context: voiceContext } : {}),
          })
          .select("id")
          .single<{ id: string }>();
        
        if (newAgent?.id) {
          agentId = newAgent.id;
          settingsPayload.main_agent_id = agentId;
        }
      } catch (agentErr) {
        // Agent creation is optional - don't block activation
        console.warn("[runActivation] Agent creation optional, continuing:", agentErr instanceof Error ? agentErr.message : String(agentErr));
      }
    }

    // Keep the main agent's number link current. The insert branch above already sets
    // vapi_phone_number_id, but the resume branch reuses an existing main_agent_id that may
    // predate the number (activation is resumable from a partial state). An agent without
    // this column is invisible to workspace-pause unbinding — see lib/vapi/agentPhoneLink.ts.
    if (agentId) {
      const mainAgentLink = await linkAgentToPhoneNumber({
        orgId,
        agentId,
        vapiPhoneNumberId: phone.id,
      });
      if (!mainAgentLink.ok) {
        console.error(
          "[runActivation] Failed to link main agent to phone number (non-fatal):",
          mainAgentLink.error
        );
      }
    }

    // 4) Proceed to LIVE when phone_number_e164 present (poll until active optional)
    if (!phoneNumberE164 || phoneNumberE164.trim() === "") {
      // Phone number E164 not available yet - keep at step 5 (Activating)
      // UI will show "Activating" and can poll/retry
      console.log("[runActivation] Phone number E164 not yet available, keeping onboarding_step at 5");
      return { 
        ok: false, 
        error: "Provisioned line, waiting for number assignment" 
      };
    }

    /*
     * 4a) Insert into phone_lines table (idempotent: ignore conflicts).
     *
     * `assigned_agent_id` is the employee we just created, NOT null.
     *
     * It was null, and that single word was the difference between a finished setup and a broken
     * one. Vapi was wired correctly — assistant created, number bound to it at creation — so the
     * line genuinely answered. But Denku's own model was not: every surface that asks "who
     * answers this channel" reads `phone_lines.assigned_agent_id`, so the customer arrived at
     * their new dashboard to two warnings ("Voice: No employee assigned", "No AI Employee is
     * connected to a channel") about a channel that was, in fact, already answering. Following
     * either warning led to a page with no way to assign anyone.
     *
     * Writing it here is not a UI fix. The line and the employee were created by the same
     * transaction of intent; recording that is the honest state.
     */
    try {
      const now = new Date().toISOString();
      const { error: phoneLineError } = await supabaseAdmin
        .from("phone_lines")
        .insert({
          org_id: orgId,
          vapi_phone_number_id: phone.id,
          phone_number_e164: phoneNumberE164,
          status: "live",
          line_type: "support",
          assigned_agent_id: agentId,
          created_at: now,
          updated_at: now,
        });

      if (phoneLineError) {
        // Check if error is due to unique constraint violation (conflict on org_id, vapi_phone_number_id)
        const errorMsg = phoneLineError.message || String(phoneLineError);
        const isConflict = errorMsg.includes("duplicate key") || 
                          errorMsg.includes("unique constraint") ||
                          errorMsg.includes("already exists");
        
        if (isConflict) {
          // Conflict expected - do nothing (idempotent)
          console.log("[runActivation] Phone line already exists in phone_lines (idempotent):", {
            org_id: orgId,
            vapi_phone_number_id: phone.id,
          });
        } else {
          // Other error - log but don't fail activation (non-critical)
          console.warn("[runActivation] Error inserting phone_lines (non-fatal):", errorMsg);
        }
      } else {
        console.log("[runActivation] Inserted phone line into phone_lines table:", {
          org_id: orgId,
          vapi_phone_number_id: phone.id,
          phone_number_e164: phoneNumberE164,
        });
      }
    } catch (phoneLineErr) {
      // Non-fatal: log and continue (don't block activation)
      const errorMsg = phoneLineErr instanceof Error ? phoneLineErr.message : String(phoneLineErr);
      const isConflict = errorMsg.includes("duplicate key") || 
                        errorMsg.includes("unique constraint") ||
                        errorMsg.includes("already exists");
      
      if (isConflict) {
        console.log("[runActivation] Phone line already exists (idempotent)");
      } else {
        console.warn("[runActivation] Exception inserting phone_lines (non-fatal):", errorMsg);
      }
    }

    /*
     * 4b) Make sure the line really is owned by the employee, whichever branch above ran.
     *
     * The insert covers a first activation. This covers the other two ways a line can exist by
     * now: a resumed activation that created the line on an earlier attempt (when the column was
     * still being written as null), and any line already carrying this Vapi number. Both are
     * ordinary — activation is deliberately resumable — and both used to leave the customer with
     * a line nothing owned.
     *
     * Only ever fills a BLANK owner. If a person has since assigned a different employee to this
     * number, that decision outranks a re-run of setup.
     */
    if (agentId) {
      try {
        const { data: lineRow } = await supabaseAdmin
          .from("phone_lines")
          .select("id, assigned_agent_id")
          .eq("org_id", orgId)
          .eq("vapi_phone_number_id", phone.id)
          .maybeSingle<{ id: string; assigned_agent_id: string | null }>();

        if (lineRow && !lineRow.assigned_agent_id) {
          const assigned = await assignEmployeeToChannel({
            orgId,
            channel: "voice",
            connectionId: lineRow.id,
            employeeId: agentId,
          });
          if (!assigned.ok) {
            console.warn("[runActivation] Could not assign employee to line (non-fatal):", assigned.error);
          }
        } else if (lineRow?.assigned_agent_id === agentId) {
          // The insert above already did it — mirror into the platform table all the same, so
          // `employee_channels` is populated on a fresh activation too.
          await assignEmployeeToChannel({
            orgId,
            channel: "voice",
            connectionId: lineRow.id,
            employeeId: agentId,
          });
        }
      } catch (assignErr) {
        console.warn(
          "[runActivation] Exception assigning employee to line (non-fatal):",
          assignErr instanceof Error ? assignErr.message : String(assignErr)
        );
      }
    }

    // F) Include onboarding_step = 6 and onboarding_completed_at in same upsert as phone artifacts (atomic)
    // Idempotent: only update if current step < 6
    const { data: currentSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("onboarding_step")
      .eq("org_id", orgId)
      .maybeSingle<{ onboarding_step: number | null }>();

    const currentStep = currentSettings?.onboarding_step ?? 0;
    
    // If step < 6, include onboarding_step and onboarding_completed_at in the upsert payload
    if (currentStep < 6) {
      settingsPayload.onboarding_step = 6;
      settingsPayload.onboarding_completed_at = new Date().toISOString();
    }

    const { error: settingsError } = await supabaseAdmin
      .from("organization_settings")
      .upsert(settingsPayload, { onConflict: "org_id" });

    if (settingsError) {
      console.error("[runActivation] Error upserting organization_settings:", settingsError);
      
      // If error is due to missing main_agent_id column, retry without it
      if (settingsError.message?.includes("main_agent_id") || settingsError.code === "PGRST204") {
        console.warn("[runActivation] main_agent_id column missing, retrying without it");
        const retryPayload: Record<string, unknown> = {
          org_id: orgId,
          vapi_phone_number_id: phone.id,
          vapi_assistant_id: assistant.id,
          phone_number_e164: phoneNumberE164,
        };
        
        // Include onboarding_step in retry if needed
        if (currentStep < 6) {
          retryPayload.onboarding_step = 6;
          retryPayload.onboarding_completed_at = new Date().toISOString();
        }
        
        const { error: retryError } = await supabaseAdmin
          .from("organization_settings")
          .upsert(retryPayload, { onConflict: "org_id" });
          
        if (retryError) {
          console.error("[runActivation] Error upserting organization_settings (retry):", retryError);
          return { ok: false, error: "Activation failed. Please try again." };
        }
      } else {
        // Other error - fail
        return { ok: false, error: "Activation failed. Please try again." };
      }
    }

    if (currentStep < 6) {
      console.log("[runActivation] Updated onboarding_step to 6 (Live) via upsert");

      // The workspace just went live. Tell the owner, and tell them the number — this is
      // the one moment the product delivers what was bought, and it happened on a screen
      // they may never look at again. Deduped on the org id (activation resumes from
      // partial and can run more than once) and never throws.
      if (phoneNumberE164) {
        await notifyAiLive(orgId, phoneNumberE164);
      }
    } else {
      console.log("[runActivation] onboarding_step already >= 6, skipped in upsert (idempotent)");
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
      phoneNumberSipUri: null, // Not used for PSTN provisioning (kept for backwards compatibility)
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
 * Check phone number status from Vapi.
 * Returns current phone status for polling during activation.
 * Server action that fetches phone status from Vapi API.
 */
export async function checkPhoneStatus(): Promise<
  { ok: true; phoneNumberE164: string | null; vapiPhoneNumberId: string | null; vapiStatus: string | null } | { ok: false; error: string }
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
    return { ok: false, error: "No organization found." };
  }

  const orgId = profile.org_id;

  // Get phone number artifacts from organization_settings
  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("vapi_phone_number_id, phone_number_e164")
    .eq("org_id", orgId)
    .maybeSingle<{
      vapi_phone_number_id: string | null;
      phone_number_e164: string | null;
    }>();

  if (!settings?.vapi_phone_number_id) {
    return { ok: true, phoneNumberE164: null, vapiPhoneNumberId: null, vapiStatus: null };
  }

  // Fetch phone status from Vapi
  try {
    const phoneDetails = await vapiFetch<{ id: string; status?: string; number?: string; phoneNumber?: string }>(
      `/phone-number/${settings.vapi_phone_number_id}`
    );

    const vapiStatus = phoneDetails?.status || null;
    const phoneNumberE164 = phoneDetails?.number ?? phoneDetails?.phoneNumber ?? settings.phone_number_e164 ?? null;

    return {
      ok: true,
      phoneNumberE164,
      vapiPhoneNumberId: settings.vapi_phone_number_id,
      vapiStatus,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to check phone status.";
    console.error("[checkPhoneStatus] Error:", err);
    // Return DB values as fallback if Vapi fetch fails
    return {
      ok: true,
      phoneNumberE164: settings.phone_number_e164,
      vapiPhoneNumberId: settings.vapi_phone_number_id,
      vapiStatus: null, // Unknown status if fetch fails
    };
  }
}

/**
 * Start Stripe checkout for plan purchase during onboarding.
 * Server action that creates Stripe checkout session directly (no API route).
 * Returns checkout session URL for redirect.
 */
/**
 * Start checkout for a voice plan, optionally with a chat tier in the SAME session.
 *
 * Voice and chat used to be sold as an either/or: selecting one cleared the other, so a business
 * that wanted its phone answered *and* its messages answered had to buy the phone plan, finish
 * onboarding, find the billing page and buy chat again — two card entries and two invoices for
 * one decision they had already made on this screen. Nothing in the billing model required that.
 * `org_plan_limits` holds one base plan; chat tiers live in `billing_org_addons`, which is a
 * different table entirely, so a voice plan and a chat tier were always able to coexist.
 *
 * So the session simply carries two line items. `plan_code` is still the base plan and
 * `chat_addon_key` still names the tier — the same two pieces of metadata the three completion
 * paths (webhook, redirect fallback, manual sync) already read. What changed there is only that
 * recording the tier is no longer conditional on the base plan being `chat_only`: the tier was
 * paid for, so it is recorded, whatever it was bought alongside.
 */
export async function startPlanCheckout(
  planCode: "starter" | "growth" | "scale",
  chatAddonKey?: string | null
) {
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
    if (!isVoicePlanCode(planCode)) {
      return { ok: false, error: "Invalid plan_code" };
    }

    /**
     * Stamp the intent from what is actually being BOUGHT.
     *
     * Activation refuses to provision a phone line against a `chat`/`free` intent, and this is
     * what keeps that refusal from ever firing on a genuine voice customer: buying a voice plan
     * IS choosing voice, so the two can only disagree if the database is edited by hand.
     *
     * The phone mode is deliberately left alone — `new` vs `byo` was answered on the screen this
     * button sits on, and overwriting it here would rent a US number to a customer who had just
     * said they own one.
     */
    await recordProductIntent(orgId, "voice");

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

    /*
     * 5b) The optional chat tier bought alongside.
     *
     * Fails CLOSED on a missing `stripe_price_id`, exactly as the chat-only checkout does: an
     * offer we cannot charge for must never reach a checkout page. Refusing the whole session is
     * the right call rather than quietly dropping the chat half — the customer selected two
     * things and would otherwise be charged for one without being told which.
     */
    let chatPrice: { stripe_price_id: string; price_usd_month: number } | null = null;
    if (chatAddonKey) {
      if (!isChatAddonKey(chatAddonKey)) {
        return { ok: false, error: "Invalid chat plan" };
      }

      const { data: addonCatalog } = await supabaseAdmin
        .from("billing_addon_catalog")
        .select("stripe_price_id, price_usd_month")
        .eq("addon_key", chatAddonKey)
        .eq("is_active", true)
        .maybeSingle<{ stripe_price_id: string | null; price_usd_month: number }>();

      if (!addonCatalog?.stripe_price_id) {
        logEvent({
          tag: "[ONBOARDING][CHECKOUT_START][CHAT_CONFIG_ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: { addon_key: chatAddonKey, error: "stripe_price_id not configured" },
        });
        return { ok: false, error: "Chat plans are not available yet. Please contact support." };
      }

      chatPrice = {
        stripe_price_id: addonCatalog.stripe_price_id,
        price_usd_month: addonCatalog.price_usd_month,
      };
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
          ...(chatPrice ? [{ price: chatPrice.stripe_price_id, quantity: 1 }] : []),
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          org_id: orgId,
          plan_code: planCode,
          kind: chatPrice ? "onboarding_plan_and_chat_purchase" : "onboarding_plan_purchase",
          // Only present when a tier was actually bought — the completion paths key on its
          // presence, so an empty string here would try to record a tier that does not exist.
          ...(chatAddonKey && chatPrice ? { chat_addon_key: chatAddonKey } : {}),
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
 * Start checkout for a workspace that wants chat and no phone line.
 *
 * Deliberately NOT `startPlanCheckout("chat_only")`. That action builds a price from
 * `billing_plan_catalog.monthly_fee_usd`, and `chat_only` is $0 — it would create a
 * subscription that charges nothing, and the chat tier would then have to be sold a second
 * time from the billing page. A customer who came to buy chat would have paid for nothing
 * and still not have chat.
 *
 * So the thing being bought here IS the chat tier: the session's line item is the tier's real
 * Stripe price. `chat_only` is only the base plan the workspace lands on, recording that it
 * has no voice — zero minutes, zero concurrency, zero numbers, which is also how the existing
 * lease check keeps voice off for these workspaces without a line of new code.
 *
 * That shape also keeps the later upgrade path working: the subscription now carries an item
 * priced at the chat tier, which is exactly what `/api/billing/addons/update` looks for when
 * it changes or removes a tier.
 *
 * Fails CLOSED on a missing `stripe_price_id` — the same rule as the add-on route. An offer we
 * cannot charge for must not reach a checkout page.
 */
export async function startChatCheckout(addonKey: string, returnTo?: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "UNAUTH" };
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    const orgId = profiles && profiles.length > 0 ? profiles[0].org_id : null;
    if (!orgId) {
      return { ok: false, error: "NO_ORG" };
    }

    if (!isChatAddonKey(addonKey)) {
      return { ok: false, error: "Invalid chat plan" };
    }

    /**
     * Stamp the intent from what is actually being BOUGHT, not only from what was clicked three
     * screens ago.
     *
     * The card chooser writes it too, but this is the write that makes activation's refusal safe:
     * intent and plan can then only disagree if someone edits the database by hand. Chat implies
     * no phone line, so the phone mode is written in the same breath.
     */
    await recordProductIntent(orgId, "chat", { phoneProvisioningMode: "none" });

    // Same pause rule as the voice checkout: never take money from a workspace already in
    // billing trouble.
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
      }>();

    if (
      orgSettings?.workspace_status === "paused" &&
      (orgSettings.paused_reason === "hard_cap" || orgSettings.paused_reason === "past_due")
    ) {
      return { ok: false, error: "BILLING_PAUSED", reason: orgSettings.paused_reason };
    }

    // The tier's real price. Null here means an operator has not finished the Stripe setup,
    // and the honest response is to refuse rather than open a checkout that cannot complete.
    const { data: addonCatalog } = await supabaseAdmin
      .from("billing_addon_catalog")
      .select("stripe_price_id, label, price_usd_month")
      .eq("addon_key", addonKey)
      .eq("is_active", true)
      .maybeSingle<{
        stripe_price_id: string | null;
        label: string;
        price_usd_month: number;
      }>();

    if (!addonCatalog?.stripe_price_id) {
      logEvent({
        tag: "[ONBOARDING][CHAT_CHECKOUT][CONFIG_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { addon_key: addonKey, error: "stripe_price_id not configured" },
      });
      return { ok: false, error: "Chat plans are not available yet. Please contact support." };
    }

    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch {
      return { ok: false, error: "Payment service unavailable" };
    }

    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, orgId);
    } catch {
      return { ok: false, error: "Failed to setup customer account" };
    }

    const appUrl = getBaseUrl();

    /**
     * Where Stripe sends the customer back.
     *
     * An allowlist, not the caller's string: this value is interpolated into a redirect URL, and
     * accepting an arbitrary path is how a redirect becomes someone else's. Two callers, two
     * destinations — the signup wizard and the billing page.
     */
    const returnPath =
      returnTo === "/dashboard/settings/workspace/billing"
        ? "/dashboard/settings/workspace/billing"
        : "/onboarding";


    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: addonCatalog.stripe_price_id, quantity: 1 }],
        /**
         * Back where the customer started, not always onboarding.
         *
         * This action was written for the signup wizard and hardcoded a return to `/onboarding`.
         * When the billing page began calling it, a customer buying chat from their dashboard was
         * dropped into the signup flow — which re-ran activation and, because their workspace had
         * a voice plan, **provisioned a phone number they had not asked for and would be billed
         * for**. One hardcoded URL, one real US line.
         *
         * The path is chosen from a fixed set rather than taken as given: this string ends up in a
         * redirect, and a caller-supplied one is an open redirect waiting to happen.
         */
        success_url: `${appUrl}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}${returnPath}?checkout=cancel`,
        metadata: {
          org_id: orgId,
          /**
           * No `plan_code`, deliberately.
           *
           * This used to send `chat_only` — a $0 voice plan invented so the field would not be
           * empty — and every screen downstream then had to know that one of the plans was not
           * really a plan. A chat purchase buys chat; the workspace has no voice plan, and now
           * says so by having none. `readCompletedCheckout` accepts a session with no plan code
           * as long as it names what WAS bought.
           */
          chat_addon_key: addonKey,
          kind: "onboarding_chat_purchase",
        },
        allow_promotion_codes: true,
      });
    } catch (checkoutErr) {
      const errorMsg =
        checkoutErr instanceof Error ? checkoutErr.message : "Checkout session creation failed";
      logEvent({
        tag: "[ONBOARDING][CHAT_CHECKOUT][SESSION_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { addon_key: addonKey, error: errorMsg },
      });
      return { ok: false, error: "Failed to create checkout session" };
    }

    logEvent({
      tag: "[ONBOARDING][CHAT_CHECKOUT][CREATED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        addon_key: addonKey,
        checkout_session_id: checkoutSession.id,
        amount: addonCatalog.price_usd_month,
      },
    });

    if (!checkoutSession.url) {
      return { ok: false, error: "Checkout session created but no URL returned" };
    }

    return { ok: true, url: checkoutSession.url };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[ONBOARDING][CHAT_CHECKOUT][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: { addon_key: addonKey, error: errorMsg },
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
  // UI step mapping: 0 = Workspace, 1 = Goal+Language, 2 = Product intent, 3 = Plan, 4 = Activating, 5 = Live
  // Called from the product-intent step (UI step 2), advances to Plan step (DB step 4)
  //
  // ⚠️ `.lt("onboarding_step", 4)` is the forward-only invariant, enforced in the WHERE clause.
  // This used to write 4 unconditionally, which was safe only while the single caller sat at step
  // 3. The phone question now lives INSIDE the plan step and saves from there, so an unconditional
  // write could pull a workspace back to "choose a plan" after Stripe's webhook had already moved
  // it to 5 (Activating) — the customer would be asked to buy the plan they had just paid for.
  // A no-op UPDATE is exactly the right outcome for a step that has already been passed.
  //
  // The NULL arm is not defensive padding: `onboarding_step` is nullable with no default, and the
  // "ensure settings row exists" insert directly above leaves it NULL. A bare `.lt()` is false
  // against NULL in SQL, so without this the very row this function just created would never
  // advance, and the customer would sit on the same screen however many times they pressed
  // Continue.
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 4, // Step 4 = choose plan
    })
    .eq("org_id", orgId)
    .or("onboarding_step.is.null,onboarding_step.lt.4");

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

  // DB step mapping: 0 = initial, 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
  // Mark onboarding complete by setting step to 6 (Live)
  const { error } = await supabaseAdmin
    .from("organization_settings")
    .update({
      onboarding_step: 6, // Step 6 = Live (onboarding complete)
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("[completeOnboarding] Error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Continue without plan (preview/freemium mode).
 * Explicitly marks onboarding complete and allows dashboard access without a paid plan.
 * Sets onboarding_step to 6 (Live) and onboarding_completed_at to now().
 * 
 * This is the ONLY way to complete onboarding without a paid plan.
 * Abandoned checkout does NOT complete onboarding - user must explicitly click this button.
 */
export async function continueWithoutPlan(orgId: string) {
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

  // Prepare update payload with onboarding_mode (optional field)
  const updatePayload: {
    onboarding_step: number;
    onboarding_completed_at: string;
    onboarding_mode?: string;
  } = {
    onboarding_step: 6, // Step 6 = Live (onboarding complete)
    onboarding_completed_at: new Date().toISOString(),
    onboarding_mode: "preview", // Optional: set if column exists
  };

  // Mark onboarding complete
  // If onboarding_mode column doesn't exist, Supabase will return an error
  // In that case, retry without onboarding_mode
  let { error } = await supabaseAdmin
    .from("organization_settings")
    .update(updatePayload)
    .eq("org_id", orgId);

  // If error is due to missing column, retry without onboarding_mode
  if (error && (error.message?.includes("column") || error.code === "PGRST204")) {
    const { onboarding_mode, ...payloadWithoutMode } = updatePayload;
    const { error: retryError } = await supabaseAdmin
      .from("organization_settings")
      .update(payloadWithoutMode)
      .eq("org_id", orgId);
    
    if (retryError) {
      error = retryError;
    } else {
      // Success without onboarding_mode - that's OK
      error = null;
    }
  }

  if (error) {
    console.error("[continueWithoutPlan] Error:", error);
    return { ok: false, error: error.message };
  }

  /**
   * Record the choice, and leave an employee behind.
   *
   * `free` is now one of three cards on the product step, not a footnote link, so it has to be as
   * honest as the other two. The intent stops activation ever provisioning a line for this
   * workspace, and `phone_provisioning_mode = 'none'` says the same thing to every screen that
   * asks whether a number is coming.
   *
   * The employee costs nothing (no Vapi, no Stripe) and is what makes the eventual upgrade work:
   * buying a chat tier from the billing page grants entitlement and creates no employee, so a
   * workspace that arrived here without one would pay for chat and still answer nobody.
   *
   * Both are deliberately AFTER the step-6 write and neither can fail the request: the customer
   * asked to get on with it, and their workspace is already complete. A failure here leaves a
   * preference unrecorded, not a customer stranded — and `runActivation` refuses to run at all on
   * a step-6 workspace, so nothing downstream can misread it into a purchase.
   */
  await recordProductIntent(orgId, "free", { phoneProvisioningMode: "none" });

  const employee = await ensureNonVoiceEmployee(orgId, user.id);
  if (!employee.ok) {
    console.error("[continueWithoutPlan] Could not create the preview employee:", employee.error);
  }

  return { ok: true };
}
