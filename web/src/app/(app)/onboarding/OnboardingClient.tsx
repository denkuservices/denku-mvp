"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  Check,
  Phone,
  ArrowRight,
  Copy,
  CheckCircle2,
  Headphones,
  TrendingUp,
  Settings2,
  ShieldCheck,
  HelpCircle,
  MessageSquare,
  Send,
  Mail,
  MessageCircle,
  Instagram,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  bootstrapWorkspaceAction,
  saveWorkspaceAction,
  saveGoalAndLanguageAction,
  saveProductIntentAction,
  runActivation,
  startPlanCheckout,
  startChatCheckout,
  getOnboardingState,
  checkPhoneStatus,
  savePhonePreferences,
  continueWithoutPlan,
} from "./_actions";
import { formatUsd } from "@/lib/utils";
import { isValidUSAreaCode } from "@/lib/telephony/usAreaCodes";
import { LANGUAGES, LANGUAGE_CODES, toLanguageCode } from "@/lib/language/registry";
import { DenkuLogo } from "@/components/brand/DenkuLogo";
import { ConnectChannelStep } from "./_components/ConnectChannelStep";
import { ConnectOwnNumberDialog } from "./_components/ConnectOwnNumberDialog";
import { researchWebsiteAction } from "./_actions/researchWebsite";


type OnboardingState = {
  orgId: string | null;
  orgName: string;
  role: string | null;
  onboardingStep: number;
  onboardingGoal: string | null;
  /** One sentence about the business, seeded into the employee's knowledge at activation. */
  businessDescription: string | null;
  /** The business's own site, optional, read in the background to seed Knowledge. */
  websiteUrl: string | null;
  onboardingLanguage: string | null;
  profileFullName: string | null;
  profilePhone: string | null;
  workspaceStatus: "active" | "paused";
  pausedReason: "manual" | "hard_cap" | "past_due" | null;
  planCode: string | null;
  isPlanActive: boolean;
  plans: Array<{
    plan_code: string;
    display_name: string;
    monthly_fee_usd: number;
    included_minutes: number;
    overage_rate_usd_per_min: number;
    concurrency_limit: number;
    included_phone_numbers: number;
  }>;
  /** Chat channels already connected, so the last step shows what is done. */
  connectedChatChannels: string[];
  /** The address Denku issued for forwarding, once email is connected. */
  emailInboundAddress: string | null;
  /** The channels a chat slot can actually be spent on — measured by whether the AI can
   *  reply there, not by what the registry declares. */
  chatChannelOptions: Array<{ id: string; label: string }>;
  /** Chat tiers, for a workspace that wants messages answered and no phone line. Empty
   *  when no tier has a configured Stripe price — an offer we cannot charge for is not shown. */
  chatPlans: Array<{
    addon_key: string;
    label: string;
    price_usd_month: number;
    channels: number;
  }>;
  hasPhoneNumber: boolean;
  /** A line exists — one we provisioned OR one the customer connected themselves. */
  hasConnectedLine?: boolean;
  /** The number on that line. The only source for one the customer brought themselves. */
  connectedLineE164?: string | null;
  /** What the customer asked for at the phone step. `"new"` when they have not reached it. */
  phoneProvisioningMode?: "new" | "byo" | "none";
  /**
   * Which product they picked: calls, messages, or neither yet.
   *
   * `null` means the question has not been answered — a workspace that reached the plan step
   * before this question existed. It is NOT a fourth value to branch on: the plan step asks it
   * again rather than guessing, because guessing is what sold a chat customer a phone plan.
   */
  productIntent?: "voice" | "chat" | "free" | null;
  /** Whether this environment offers connecting a number the customer already owns. */
  byoNumbersEnabled?: boolean;
  phoneNumber: string | null;
  phoneNumberE164?: string | null;
  phoneNumberSipUri?: string | null;
  vapiPhoneNumberId?: string | null;
  vapiAssistantId?: string | null;
  needsOrgSetup?: boolean;
};

type OnboardingClientProps = {
  initialState: OnboardingState;
  checkoutStatus?: "success" | "cancel" | null;
};

// UI step mapping: 0 = Workspace, 1 = Goal, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
// DB step mapping: 0 = initial, 1 = Goal, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
//
// ⚠️ The UI step is the DB step MINUS ONE, and this mapping is load-bearing (see
// skills/onboarding-flow.md). The redesign re-narrated these labels and NOTHING else: the step
// machine, its forward-only writes, the `step >= 6` dashboard gate, the dual-path checkout
// activation and resume-from-partial provisioning are all untouched. Renaming a label is safe;
// renumbering a step is not.
/** A glyph per chat channel, so the cards are scannable rather than three lines of prose.
 *  Falls back to a generic message icon, so a channel shipping later still renders. */
const CHANNEL_ICONS: Record<string, typeof MessageSquare> = {
  telegram: Send,
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
};

const STEPS = [
  { id: 0, label: "Your business", desc: "Who your AI works for" },
  { id: 1, label: "The role", desc: "What it handles for you" },
  // Step 2 used to be "Its number" and asked for a US area code before anything had been bought.
  // Asking about a phone line first is what made every customer a voice customer by default; it
  // now asks which product they want, and the phone question lives inside the voice branch of
  // step 3 where it belongs. Renaming a label is safe; renumbering a step is not (see below).
  { id: 2, label: "What it answers", desc: "Calls, messages, or neither yet" },
  { id: 3, label: "Plan", desc: "How much it can handle" },
  { id: 4, label: "Setting up", desc: "Putting it to work" },
  { id: 5, label: "First day", desc: "Your AI starts answering" },
];

// Shared brand styling
const inputClass =
  "w-full rounded-[10px] border border-[#0A1A2F]/12 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/60 outline-none transition-colors focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15 disabled:opacity-60";
const inputErrClass =
  "w-full rounded-[10px] border border-red-400 bg-red-50/40 px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/60 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:opacity-60";
const primaryBtn =
  "rounded-[10px] bg-[#0A1A2F] px-6 h-11 text-sm font-medium text-[#F7F5F1] hover:bg-[#1B6E6E]";
const outlineBtn =
  "rounded-[10px] border border-[#0A1A2F]/12 bg-white px-6 h-11 text-sm font-medium text-[#0A1A2F] hover:border-[#1B6E6E] hover:text-[#1B6E6E]";
const tealBtn = "rounded-[10px] bg-[#1B6E6E] px-6 h-11 text-sm font-medium text-white hover:bg-[#228585]";

/** The role each goal describes, in the language a business owner would use. */
const GOAL_LABELS: Record<"support" | "sales" | "ops", string> = {
  support: "Customer support",
  sales: "Sales & enquiries",
  ops: "Bookings & operations",
};

/**
 * The employee taking shape (Phase 7).
 *
 * Onboarding used to read as a provisioning checklist; this makes it read as hiring someone. It
 * assembles from decisions the customer has ALREADY made — each line appears only once its fact
 * exists, so the card never promises a detail we don't have. Presentational only: it holds no
 * state and triggers nothing.
 */
function EmployeeCard({
  businessName,
  role,
  language,
  phoneNumber,
  isLive,
}: {
  businessName: string | null;
  role: string | null;
  language: string | null;
  phoneNumber: string | null;
  isLive: boolean;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  if (businessName) rows.push({ label: "Works for", value: businessName });
  if (role) rows.push({ label: "Role", value: role });
  // The language in words, never the stored code: "Speaks TR" reads like a setting, and this
  // card is the one place the customer sees the employee described rather than configured.
  if (language) {
    const code = toLanguageCode(language);
    rows.push({ label: "Speaks", value: code ? LANGUAGES[code].label : language });
  }
  if (phoneNumber) rows.push({ label: "Answers", value: phoneNumber });

  // Nothing decided yet — a card of blanks would be worse than no card.
  if (rows.length === 0) return null;

  return (
    <div className="mt-8 rounded-[14px] border border-white/[0.08] bg-white/[0.04] p-4">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${isLive ? "bg-[#3FA3A3]" : "bg-white/25"}`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-[#F7F5F1]/80">
          {isLive ? "Your AI employee · working" : "Your AI employee · in progress"}
        </span>
      </div>
      <dl className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] uppercase tracking-wide text-white/35">{r.label}</dt>
            <dd className="min-w-0 truncate text-xs text-[#F7F5F1]/85">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OnboardingClient({ initialState, checkoutStatus }: OnboardingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState(initialState);

  // Canonical step mapping: 0 = Workspace, 1 = Goal, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
  // Workspace setup happens during bootstrap - onboarding starts at Goal (step 1)
  // IMPORTANT: initialStep is only used ONCE on first render. Do NOT derive currentStep from state.onboardingStep after mount.
  const initialStep = state.needsOrgSetup || !state.orgId ? 0 : (state.onboardingStep ?? 0);
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Guard: Never reset currentStep from initialState after first render
  // The ONLY way currentStep should change after mount is via explicit setCurrentStep() calls after DB updates
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false); // true when starting checkout
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // selected plan_code
  /**
   * Whether this workspace bought chat and no phone line.
   *
   * ⚠️ This used to read `state.planCode === "chat_only"`, and that comparison went silently dead
   * the day `chat_only` was retired (2026-09-02). `planCode` is now the VOICE plan and is simply
   * null for a chat customer, so the test could never be true again — which meant every chat
   * customer was walked through "Claiming your phone number" and landed on the voice Live screen,
   * being told a US line was on its way that was never going to arrive. Nothing was provisioned
   * (activation guards on the voice plan), but the wizard said otherwise for three screens.
   *
   * Asked the way the billing model actually answers it: something was bought, and it was not
   * voice. Before anything is bought both are false, so this stays false — which is right, the
   * question has no answer yet. A legacy `chat_only` row reads the same way, because
   * `getPlanState` already maps that value to "no voice plan".
   */
  const isChatOnly = state.isPlanActive && !state.planCode;

  /**
   * The customer owns their number and will point their carrier at us. Activation claims no US
   * line for them, so the Live step offers the connect flow instead of a number card.
   */
  const isByoNumber = state.phoneProvisioningMode === "byo";

  /**
   * Which branch of the plan step this customer is in — and the reason the branch exists.
   *
   * The plan step used to be one screen carrying everything: three large cards priced
   * $149/$399/$899, chat tiers underneath as a footnote, and a "continue without plan" link at the
   * bottom. The three large cards are PHONE plans, so "the plans" meant phone service to anyone
   * reading the page — and a customer who had just said they wanted chat picked one and was rented
   * a US number, monthly, for a product they had declined. Nothing was broken. They simply never
   * understood which question they were answering (R-153).
   *
   * So the product is chosen first, on its own screen, and this decides which plans are ever
   * SHOWN. A chat customer is never offered a voice plan, so they can never buy one by accident.
   *
   * `null` is not a fourth branch: it means the question has not been answered — a workspace that
   * reached this step before the question existed — and the step asks it rather than guessing.
   */
  const planBranch: "voice" | "chat" | "free" | null = state.productIntent ?? null;

  /**
   * A chat tier — on its own, or alongside a voice plan.
   *
   * This comment used to say the two were mutually exclusive and cleared each other. They have
   * not been since chat and voice became independent products, and a stale comment on the state
   * that decides what a card is charged for is worse than none: the selections are independent,
   * so both can be true at once and the checkout summary is the only thing that says so.
   */
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false); // true when polling for plan activation
  const [paramsCleared, setParamsCleared] = useState(false); // track if query params have been cleared

  // Handle checkout return (success or cancel) - deterministic polling without writes
  React.useEffect(() => {
    // Only process if checkoutStatus is set and params not yet cleared
    if (!checkoutStatus || paramsCleared) return;

    if (checkoutStatus === "success") {
      // Show confirming UI immediately
      setIsConfirming(true);
      setCheckoutMessage("Confirming your plan…");

      // Poll for plan activation (read-only, no writes)
      let pollCount = 0;
      const maxPolls = 60; // 60 seconds timeout (1s intervals)
      let pollInterval: NodeJS.Timeout | null = null;

      const pollForPlanActivation = async () => {
        pollCount++;
        try {
          // Call getOnboardingState() which performs self-heal (writes step=4 if plan active)
          // We only read the result, never write onboarding_step here
          const updatedState = await getOnboardingState();

          // Sync state from server (single source of truth)
          setState(updatedState);
          setCurrentStep(updatedState.onboardingStep);

          if (updatedState.isPlanActive) {
            // Plan is active - getOnboardingState() already self-healed step to 4 (Activating)
            setIsConfirming(false);
            setCheckoutMessage(null);

            // Clear query params (only once)
            if (!paramsCleared) {
              router.replace("/onboarding");
              setParamsCleared(true);
            }

            if (pollInterval) {
              clearInterval(pollInterval);
            }
          } else if (pollCount >= maxPolls) {
            // Timeout - show calm error
            setIsConfirming(false);
            setCheckoutMessage("We're still confirming. Refresh this page, or check again in a moment.");

            // Clear query params even on timeout
            if (!paramsCleared) {
              router.replace("/onboarding");
              setParamsCleared(true);
            }

            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
        } catch (err) {
          if (pollCount >= maxPolls) {
            setIsConfirming(false);
            setCheckoutMessage("Failed to confirm plan. Please refresh the page or try again.");

            // Clear query params on error
            if (!paramsCleared) {
              router.replace("/onboarding");
              setParamsCleared(true);
            }

            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
        }
      };

      // Start polling immediately, then every 1 second
      pollForPlanActivation();
      pollInterval = setInterval(pollForPlanActivation, 1000);

      return () => {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      };
    } else if (checkoutStatus === "cancel") {
      // Cancel flow - show message and clear params
      setCheckoutMessage("Checkout canceled.");

      // Clear query params
      if (!paramsCleared) {
        router.replace("/onboarding");
        setParamsCleared(true);
      }
    }
  }, [checkoutStatus, router, paramsCleared]);

  // Also handle query params from URL (fallback for direct navigation)
  React.useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout && !checkoutStatus) {
      // If checkoutStatus prop not set but URL has param, use it
      if (checkout === "success" && !isConfirming) {
        setIsConfirming(true);
        setCheckoutMessage("Confirming your plan…");
      } else if (checkout === "cancel" && !checkoutMessage) {
        setCheckoutMessage("Checkout canceled.");
      }
    }
  }, [searchParams, checkoutStatus, isConfirming, checkoutMessage]);

  // Step 0: Workspace + Full name + Phone (load from state if available)
  const [workspaceName, setWorkspaceName] = useState(state.orgName || "");
  const [fullName, setFullName] = useState(state.profileFullName || "");
  const [phone, setPhone] = useState(state.profilePhone || "");

  // Step 1: Goal (load from state if available)
  const [goal, setGoal] = useState<"support" | "sales" | "ops">(
    (state.onboardingGoal as "support" | "sales" | "ops") || "support"
  );
  /**
   * The language the AI answers in — asked here, on the step every customer passes through.
   *
   * It was never asked before, and `organization_settings.onboarding_language` was read by
   * activation (`runActivation` writes it onto both the Vapi assistant and the `agents` row) and
   * by `resolveWorkspaceLineDefaults` when a BYO number is connected — while NOTHING wrote it. So
   * every workspace fell through to `?? "en"`: a business in Türkiye finished onboarding and its
   * AI answered its callers in English, and the only fix was to know that Team → Setup existed.
   *
   * Deliberately NOT on the phone step, even though voice is where it hurts most: a chat-only
   * customer skips that form entirely ("I don't need a phone line"), and their agent row reads the
   * same column. One question, before the product splits into voice and chat, answers both.
   *
   * A code ("tr"), not a label — activation passes this value straight to `resolveLanguage`, which
   * accepts either, and codes are what the rest of onboarding already writes.
   */
  const [language, setLanguage] = useState<string>(
    toLanguageCode(state.onboardingLanguage) ?? "en"
  );
  // The one thing onboarding asks about the business itself. Optional — it makes the AI
  // specific rather than generic, but skipping it still yields a working employee.
  const [businessDescription, setBusinessDescription] = useState(
    initialState.businessDescription ?? ""
  );
  const [website, setWebsite] = useState(initialState.websiteUrl ?? "");
  /**
   * Whether a site was given — read from the SAVED state, not the input above.
   *
   * The Goal step runs after the workspace step has been committed, so `state.websiteUrl` is what
   * the server actually stored. Reading the local input instead would keep the promise alive on a
   * back-navigation where nothing was saved.
   */
  const hasWebsite = Boolean(state.websiteUrl?.trim());
  /**
   * What the Proceed button is about to charge for, in words.
   *
   * Stated rather than implied, because voice and chat can now be bought together: with two
   * highlighted cards on screen and one button under them, "which of these am I paying for" is
   * a real question, and the answer belongs on the page and not on the Stripe form after it.
   */
  const checkoutSummary = React.useMemo(() => {
    /**
     * Only the current branch's selection counts.
     *
     * A customer can select a voice plan, press Back, change their answer to messages, and land in
     * the chat branch with `selectedPlan` still holding "growth". Nothing wrong is BOUGHT — each
     * branch's button passes only its own product — but a summary that added both would tell them
     * they were about to be charged $399 for a phone plan they had just walked away from. The
     * branch is the authority on what is being bought, here as everywhere else on this step.
     */
    const plan =
      planBranch !== "chat" && selectedPlan
        ? state.plans.find((p) => p.plan_code === selectedPlan)
        : null;
    const chat =
      planBranch !== "voice" && selectedChat
        ? state.chatPlans.find((t) => t.addon_key === selectedChat)
        : null;
    if (!plan && !chat) return "";

    const parts: string[] = [];
    if (plan) parts.push(`${plan.display_name} · ${formatUsd(plan.monthly_fee_usd)}/mo`);
    if (chat) {
      parts.push(
        `${chat.channels === 1 ? "1 chat channel" : `${chat.channels} chat channels`} · ${formatUsd(chat.price_usd_month)}/mo`
      );
    }

    const total = (plan?.monthly_fee_usd ?? 0) + (chat?.price_usd_month ?? 0);
    // The total is only worth printing when there are two things to add up.
    return parts.length > 1
      ? `${parts.join("  +  ")}  =  ${formatUsd(total)}/month`
      : parts[0];
  }, [planBranch, selectedPlan, selectedChat, state.plans, state.chatPlans]);

  /** Just the host, so the copy shows `theirshop.com` rather than a pasted tracking URL. */
  const websiteHost = React.useMemo(() => {
    const raw = state.websiteUrl?.trim();
    if (!raw) return "";
    try {
      return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    } catch {
      return raw;
    }
  }, [state.websiteUrl]);

  // Step 2: Phone number (AI line)
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeError, setAreaCodeError] = useState<string | null>(null);
  /**
   * Which kind of line, chosen here rather than assumed.
   *
   * "Bring my own" was a greyed-out card labelled "Later" long after the path behind it shipped
   * and answered a real customer's calls — so a business with a number their customers already
   * know had to finish onboarding on a US number they did not want, then go and undo it.
   * Seeded from the DB so a refreshed page remembers the answer.
   */
  const [phoneMode, setPhoneMode] = useState<"new" | "byo">(
    state.phoneProvisioningMode === "byo" ? "byo" : "new"
  );
  /** The connect-your-own-number dialog on the last step. */
  const [byoDialogOpen, setByoDialogOpen] = useState(false);

  /**
   * Step 2: which product. Seeded from the DB so a refresh remembers the answer.
   *
   * Nothing is pre-selected when the question has never been answered. A default here would be a
   * recommendation nobody made, on the one screen whose whole job is to stop the product choosing
   * for the customer.
   */
  const [productChoice, setProductChoice] = useState<"voice" | "chat" | "free" | null>(
    state.productIntent ?? null
  );

  /**
   * Step 3, voice branch: which half of it the customer is on.
   *
   * The voice branch asks two questions in order — how much, then which number — because the
   * second only makes sense once the first is answered, and because putting the phone question
   * before the purchase is exactly what used to make every customer a phone customer. The back
   * button walks this before it walks the step.
   */
  const [voiceSubStep, setVoiceSubStep] = useState<"plans" | "phone">("plans");

  // Step 4: Activation
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [provisionedPhoneNumber, setProvisionedPhoneNumber] = useState<string | null>(null);

  // Step 5: Live - Phone status polling
  const [phoneStatus, setPhoneStatus] = useState<"active" | "activating" | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [showActiveAnimation, setShowActiveAnimation] = useState(false);

  // Form state handlers with refresh after submission
  const handleFormAction = async (prevState: any, formData: FormData) => {
    const action = formData.get("_action")?.toString();
    let result;

    if (action === "bootstrap") {
      result = await bootstrapWorkspaceAction(formData);
    } else if (action === "saveWorkspace") {
      result = await saveWorkspaceAction(formData);
    } else if (action === "saveGoalLanguage") {
      result = await saveGoalAndLanguageAction(formData);
    } else if (action === "saveProductIntent") {
      result = await saveProductIntentAction(formData);
    } else if (action === "savePhonePreferences") {
      result = await savePhonePreferences(formData);
    } else {
      return { ok: false, error: "Unknown action" };
    }

    if (!result.ok) {
      return { ok: false, error: result.error || "Something went wrong." };
    }

    /*
     * Read the website in the background, if one was given.
     *
     * Fired from the browser and deliberately NOT awaited: reading a site costs up to eight
     * seconds between the fetch and the model, and an optional field must never hold up the
     * Continue button. The customer carries on to the next step while it runs, and by the time
     * they reach Knowledge it has already landed.
     *
     * Fire-and-forget is safe here precisely because it is the BROWSER making the request — a
     * serverless function that returns before its own background work finishes may simply be
     * frozen. Failures are swallowed: nothing about this step depends on it.
     */
    if ((action === "saveWorkspace" || action === "bootstrap") && website.trim()) {
      void researchWebsiteAction().catch(() => {});
    }

    // Always refresh from DB (authoritative source of truth)
    const updated = await getOnboardingState();
    setState(updated);
    setCurrentStep(updated.onboardingStep);

    if (process.env.NODE_ENV !== "production") {
      console.log("[onboarding] advanced", updated.onboardingStep);
    }

    return { ok: true };
  };

  const [formState, formAction] = React.useActionState(handleFormAction, { ok: true });

  // Update error state from form state
  React.useEffect(() => {
    if (formState && !formState.ok) {
      // Check for phone duplicate constraint error
      const debug = (formState as any).debug;
      if (debug?.constraint === "organizations_phone_number_key") {
        setPhoneFieldError("This phone number is already in use. Use a different number or leave it blank for now.");
        setError(null); // Don't show generic error for phone duplicate
      } else {
        setPhoneFieldError(null);
        setError(formState.error || "Something went wrong.");
      }
    } else {
      setError(null);
      setPhoneFieldError(null);
    }
  }, [formState]);

  // Auto-run activation when on Step 4 (Activating)
  React.useEffect(() => {
    // Guard: Ensure orgId exists before running activation
    if (!state.orgId) {
      if (currentStep === 4) {
        setActivationError("We couldn't find your workspace. Please refresh and try again.");
      }
      return;
    }

    if (currentStep === 4 && !isActivating && !activationError) {
      setIsActivating(true);
      setActivationError(null);

      runActivation()
        .then((result) => {
          if (result.ok) {
            // Store provisioned phone number if returned (fallback, but DB is source of truth)
            if (result.phoneNumberE164) {
              setProvisionedPhoneNumber(result.phoneNumberE164);
            }
            // Activation succeeded - refresh state to move to Step 5 (Live)
            getOnboardingState()
              .then((updatedState) => {
                setState(updatedState);
                setCurrentStep(updatedState.onboardingStep);
              })
              .catch((err) => {
                console.error("[onboarding] Error refreshing state after activation:", err);
                setActivationError("Activation completed but could not refresh. Please refresh the page.");
              });
          } else {
            setActivationError(result.error || "Activation failed. Please try again.");
          }
        })
        .catch((err) => {
          console.error("[onboarding] Activation error:", err);
          setActivationError("An unexpected error occurred during activation. Please try again.");
        })
        .finally(() => {
          setIsActivating(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, state.orgId]);

  // Phone status polling when on Live step (step 5)
  React.useEffect(() => {
    if (currentStep !== 5 || !state.vapiPhoneNumberId) {
      // Reset state when leaving step 5
      if (currentStep !== 5) {
        setPhoneStatus(null);
        setCountdownRemaining(null);
        setShowActiveAnimation(false);
      }
      return;
    }

    // Initialize countdown to 120 seconds on first entry
    if (countdownRemaining === null) {
      setCountdownRemaining(120);
    }

    // Initial status check
    const initialCheck = async () => {
      try {
        const statusResult = await checkPhoneStatus();
        if (statusResult.ok) {
          const newStatus = statusResult.vapiStatus;
          const newPhoneNumber = statusResult.phoneNumberE164;

          if (newPhoneNumber && !displayPhoneNumber) {
            setProvisionedPhoneNumber(newPhoneNumber);
          }

          if (newStatus === "active") {
            setPhoneStatus("active");
            setCountdownRemaining(0);
            setShowActiveAnimation(true);
            // Reset animation after 2 seconds
            setTimeout(() => {
              setShowActiveAnimation(false);
            }, 2000);
            return; // Don't start polling if already active
          } else if (newStatus === "activating") {
            setPhoneStatus("activating");
          }
        }
      } catch (err) {
        console.error("[onboarding] Error in initial phone status check:", err);
      }
    };

    initialCheck();

    // Poll phone status every 5 seconds (max 180s = 36 polls)
    let pollCount = 0;
    const maxPolls = 36;
    const pollInterval = setInterval(async () => {
      pollCount++;

      try {
        const statusResult = await checkPhoneStatus();
        if (statusResult.ok) {
          const newStatus = statusResult.vapiStatus;
          const newPhoneNumber = statusResult.phoneNumberE164;

          // Update phone number if available
          if (newPhoneNumber && !displayPhoneNumber) {
            setProvisionedPhoneNumber(newPhoneNumber);
          }

          // If status becomes active, stop polling and show active UI
          if (newStatus === "active") {
            setPhoneStatus("active");
            setCountdownRemaining(0);
            setShowActiveAnimation(true);
            // Reset animation after 2 seconds
            setTimeout(() => {
              setShowActiveAnimation(false);
            }, 2000);
            clearInterval(pollInterval);
            return;
          }

          // Update status (activating or null)
          setPhoneStatus(newStatus === "activating" ? "activating" : null);
        }
      } catch (err) {
        console.error("[onboarding] Error polling phone status:", err);
      }

      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, state.vapiPhoneNumberId]);

  // Countdown timer (decrements every 1 second)
  React.useEffect(() => {
    if (currentStep !== 5 || countdownRemaining === null || countdownRemaining <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdownRemaining((prev) => {
        if (prev === null || prev <= 0) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [currentStep, countdownRemaining]);

  // Submit button component with pending state
  function SubmitButton({
    children,
    disabled: externalDisabled,
    className,
    ...props
  }: React.ComponentProps<"button"> & { children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
      <button
        type="submit"
        disabled={pending || externalDisabled}
        className={`inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 h-11 text-sm font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E] disabled:pointer-events-none disabled:opacity-50 ${className || ""}`}
        {...props}
      >
        {pending ? "Please wait…" : children}
        {!pending && typeof children === "string" && !children.includes("wait") && (
          <ArrowRight className="h-4 w-4" />
        )}
      </button>
    );
  }

  /**
   * Leave setup for the dashboard — with a FULL page load, deliberately.
   *
   * `/onboarding` and `/dashboard` share the `(app)` layout, and that layout decides between the
   * dashboard shell and the sidebar-less setup chrome from `getOnboardingComplete()`, read once
   * on the server. A client-side `router.push` reuses the layout instance that was rendered while
   * onboarding was still incomplete — so the customer arrived at their dashboard with the bone
   * setup background, no navigation, and a "Back to setup" button that led nowhere, and had to
   * discover for themselves that reloading fixed it. The first thing they ever see of the
   * product should not be something they have to repair.
   *
   * A hard navigation re-runs the layout on the server, where onboarding is now complete.
   *
   * Still no `completeOnboarding()` call here: activation already set onboarding_step = 6, and
   * this remains pure navigation. Only HOW we navigate changed.
   */
  const handleComplete = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/dashboard");
      return;
    }
    router.push("/dashboard");
  };

  const handleCopyNumber = () => {
    const number = state.phoneNumberE164 ?? state.phoneNumber ?? provisionedPhoneNumber ?? null;
    if (number && typeof window !== "undefined") {
      navigator.clipboard.writeText(number);
    }
  };

  const handleCopySipUri = () => {
    const sipUri = state.phoneNumberSipUri ?? null;
    if (sipUri && typeof window !== "undefined") {
      navigator.clipboard.writeText(sipUri);
    }
  };

  // SSR-safe and null-safe phone number display
  // Prefer phoneNumberE164 from state (DB truth), fallback to phoneNumber or provisionedPhoneNumber
  /**
   * The number to show on the last step.
   *
   * `connectedLineE164` is last and not first: it is the ONLY source for a number the customer
   * brought themselves, because `connectByoNumber` writes `phone_lines` and never touches
   * `organization_settings` (which holds lines WE provisioned). Without it, a customer who had
   * just connected their own number would be shown "Number will appear here once provisioning
   * completes" about a line that was already connected.
   */
  const displayPhoneNumber =
    state.phoneNumberE164 ?? state.phoneNumber ?? provisionedPhoneNumber ?? state.connectedLineE164 ?? null;
  // SIP URI for provider="vapi" lines (may exist when E164 doesn't)
  const displaySipUri = state.phoneNumberSipUri ?? null;

  /**
   * Is there a line that can be called right now?
   *
   * A number we provisioned answers this by polling Vapi for its status. A number the customer
   * brought has no such status to poll — `vapiPhoneNumberId` on `organization_settings` stays
   * null, so the poll never starts, `phoneStatus` stays null, and the screen would sit forever
   * on "the phone network is still publishing your brand-new number". Their number is not new
   * and no network is publishing it; the moment the line row exists it is theirs to call.
   */
  const lineIsReady =
    phoneStatus === "active" ||
    (countdownRemaining !== null && countdownRemaining === 0 && phoneStatus !== "activating") ||
    Boolean(isByoNumber && state.hasConnectedLine);

  const progressPct = Math.min(100, Math.round((currentStep / (STEPS.length - 1)) * 100));

  /**
   * Going back a step — and why it only moves the SCREEN.
   *
   * Someone three steps in who wants to change the workspace name or the goal they picked had no
   * way to do it but to abandon setup, and every answer they had already given was still on this
   * page. So this walks `currentStep` back and nothing else: the DB's `onboarding_step` is never
   * decremented.
   *
   * That is deliberate, not laziness. `onboarding_step` is what the middleware reads to decide
   * whether someone may reach the dashboard at all (>= 6), and it is resumed from on a reload. A
   * back button that lowered it could strand a customer outside their own workspace over a
   * mistyped name. Moving forward re-submits the step normally and writes the same row again, so
   * the two never disagree for longer than a click.
   *
   * The last two steps are excluded on purpose: step 4 is activation actually running against
   * Vapi and Stripe, and step 5 is a workspace that is already live. Neither has a "before" to
   * return to.
   */
  const canGoBack = currentStep > 0 && currentStep < 4;

  /**
   * Where "back" goes from the plan step depends on how far into a branch the customer is.
   *
   * The voice branch has two screens inside one step, so the first press has to walk the SUB-step
   * — otherwise choosing a plan and then wanting a different one means leaving the step entirely
   * and re-answering the product question. Everything else walks the step, as before.
   */
  const backTarget: "voice-plans" | "step" =
    currentStep === 3 && planBranch === "voice" && voiceSubStep === "phone" ? "voice-plans" : "step";

  const backLabel =
    backTarget === "voice-plans"
      ? "Back to plans"
      : `Back${STEPS[currentStep - 1]?.label ? ` to ${STEPS[currentStep - 1].label}` : ""}`;

  const goBack = () => {
    if (!canGoBack) return;
    setError(null);
    if (backTarget === "voice-plans") {
      setVoiceSubStep("plans");
      return;
    }
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  /**
   * The three ways off the plan step. One per branch, deliberately — never one handler that
   * decides at the last moment what to buy.
   *
   * `startPlanCheckout(plan, chatAddonKey)` can sell both products in one session, and the voice
   * branch passes `null` for the second argument in so many words. That is the guarantee the whole
   * redesign rests on: a customer is charged for the product they picked and nothing else, and it
   * is enforced at the call site rather than by hoping a piece of state was cleared.
   */
  const startVoiceCheckout = () => {
    if (!selectedPlan || !state.orgId) return;
    setCheckoutLoading(true);
    setError(null);
    setCheckoutMessage(null);
    startTransition(async () => {
      /**
       * Save the phone answer BEFORE the card is charged.
       *
       * Activation reads `phone_provisioning_mode` to decide whether to claim a US number, and it
       * runs as soon as Stripe's webhook lands — which can be before the customer's browser gets
       * back here. Saving after checkout would be a race whose losing side rents somebody a second
       * phone number.
       */
      const fd = new FormData();
      fd.set("orgId", state.orgId!);
      fd.set("country", country);
      fd.set("phoneMode", phoneMode);
      if (phoneMode === "new" && areaCode) fd.set("areaCode", areaCode);

      const saved = await savePhonePreferences(fd);
      if (!saved.ok) {
        setCheckoutLoading(false);
        setError(saved.error || "We couldn't save your number preference. Please try again.");
        return;
      }

      // `null`: the voice branch sells voice. Chat is bought from its own branch, or later from
      // Billing.
      const result = await startPlanCheckout(selectedPlan as "starter" | "growth" | "scale", null);

      if (result.ok && result.url) {
        window.location.href = result.url;
      } else {
        setCheckoutLoading(false);
        if (result.error === "UNAUTH") {
          setError("Authentication error. Please refresh the page and try again.");
        } else if (result.error === "BILLING_PAUSED") {
          setError("BILLING_PAUSED");
        } else {
          setError(result.error || "Failed to start checkout");
        }
      }
    });
  };

  const startChatOnlyCheckout = () => {
    if (!selectedChat) return;
    setCheckoutLoading(true);
    setError(null);
    setCheckoutMessage(null);
    startTransition(async () => {
      const result = await startChatCheckout(selectedChat);
      if (result.ok && result.url) {
        window.location.href = result.url;
      } else {
        setCheckoutLoading(false);
        if (result.error === "UNAUTH") {
          setError("Authentication error. Please refresh the page and try again.");
        } else if (result.error === "BILLING_PAUSED") {
          setError("BILLING_PAUSED");
        } else {
          setError(result.error || "Failed to start checkout");
        }
      }
    });
  };

  /**
   * Finish with nothing bought.
   *
   * `continueWithoutPlan` writes step 6, records the intent and creates the AI employee — and
   * touches neither Stripe nor Vapi, which is what makes it safe to offer as a card next to two
   * that charge money.
   *
   * Lands on the dashboard rather than the phone-numbers page, which is where this used to go: a
   * customer who has just chosen NOT to buy a phone line should not arrive at a screen about
   * phone lines. A full page load, not a router push, because onboarding just completed and the
   * shared `(app)` layout has to be re-rendered on the server to notice.
   */
  const finishFreePreview = () => {
    if (!state.orgId) {
      setError("Organization ID is missing.");
      return;
    }
    setError(null);
    setCheckoutMessage(null);
    startTransition(async () => {
      const result = await continueWithoutPlan(state.orgId!);
      if (result.ok) {
        window.location.assign("/dashboard");
      } else {
        setError(result.error || "Failed to finish setup");
      }
    });
  };

  /**
   * The product chooser — the screen that decides what the customer is ever shown a price for.
   *
   * **Prices are derived, never typed.** Each card quotes the cheapest real offer in its family,
   * read from the catalogue the checkout will actually charge from. A hardcoded "from $149" is a
   * claim that goes stale silently the day a price changes, on the screen where a customer decides
   * what to buy.
   *
   * Held in a variable rather than written twice because it renders in TWO places: step 2, where
   * everyone answers it, and step 3, for a workspace that reached the plan step before this
   * question existed. Two copies of a screen that sells three different products is how one of
   * them ends up quoting last month's price.
   */
  const cheapestVoiceUsd = state.plans.length
    ? Math.min(...state.plans.map((p) => p.monthly_fee_usd))
    : null;
  const cheapestChatUsd = state.chatPlans.length
    ? Math.min(...state.chatPlans.map((t) => t.price_usd_month))
    : null;

  const productOptions: Array<{
    id: "voice" | "chat" | "free";
    icon: typeof Phone;
    title: string;
    price: string;
    body: string;
    bullets: string[];
    /** Hidden when there is nothing sellable behind it — never offer a door that leads nowhere. */
    available: boolean;
  }> = [
    {
      id: "voice",
      icon: Phone,
      title: "Answer my phone",
      price: cheapestVoiceUsd !== null ? `From ${formatUsd(cheapestVoiceUsd)}/month` : "",
      body: "A line that never rings out. Your AI picks up every call, day or night, and writes down what the caller needed.",
      bullets: [
        "A US number we claim for you — or connect the one you already have",
        "Call minutes included, in your language",
        "Tickets, appointments and leads from every call",
      ],
      available: state.plans.length > 0,
    },
    {
      id: "chat",
      icon: MessageSquare,
      title: "Answer my messages",
      price: cheapestChatUsd !== null ? `From ${formatUsd(cheapestChatUsd)}/month` : "",
      body: "The same AI, answering where your customers already write to you. No phone number and no call minutes.",
      bullets: [
        "Telegram, email, web chat and Instagram",
        "Sold by channel, not by message — no counter to run out of",
        "Same inbox, tickets and appointments",
      ],
      available: state.chatPlans.length > 0,
    },
    {
      id: "free",
      icon: Compass,
      title: "Look around first",
      price: "Free",
      body: "Finish setting up and pick a plan when you're ready. Nothing is charged today.",
      bullets: [
        "Your workspace and AI employee are created",
        "Nothing is answered until you choose a plan",
        "Upgrade any time from Billing",
      ],
      available: true,
    },
  ];

  const productChooser = (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="_action" value="saveProductIntent" />
      <input type="hidden" name="orgId" value={state.orgId || ""} />
      <input type="hidden" name="productIntent" value={productChoice ?? ""} />

      <div className="grid grid-cols-1 gap-4">
        {productOptions
          .filter((option) => option.available)
          .map((option) => {
            const Icon = option.icon;
            const isSelected = productChoice === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setProductChoice(option.id);
                  setError(null);
                }}
                className={`rounded-[16px] border-2 p-5 text-left transition-all ${
                  isSelected
                    ? "border-[#1B6E6E] bg-[#E3EEED]"
                    : "border-[#0A1A2F]/[0.08] bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                      isSelected ? "bg-[#1B6E6E] text-white" : "bg-[#E3EEED] text-[#134F4F]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">
                        {option.title}
                      </h3>
                      {option.price && (
                        <span className="font-brand-mono text-xs text-[#6B7888]">{option.price}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#2C3E54]">{option.body}</p>
                    <ul className="mt-3 space-y-1.5">
                      {option.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-sm text-[#2C3E54]">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1B6E6E]" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B6E6E]" />}
                </div>
              </button>
            );
          })}
      </div>

      <p className="text-sm text-[#6B7888]">
        You can add the other one later from Billing — picking one now doesn&apos;t rule it out.
      </p>

      <div className="flex justify-end pt-1">
        {/* Disabled until something is chosen: submitting an empty answer is how a wizard picks a
            product for a customer, which is the entire defect this screen exists to fix. */}
        <SubmitButton disabled={!productChoice}>Continue</SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="flex min-h-screen">
      {/* LEFT RAIL */}
      <aside className="relative hidden w-[360px] shrink-0 flex-col overflow-hidden bg-[#0A1A2F] px-10 py-12 text-[#F7F5F1] lg:flex">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-[10%] right-[-15%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(27,110,110,0.28)_0%,transparent_65%)]" />
          <div className="absolute bottom-[-10%] left-[-20%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(184,137,90,0.12)_0%,transparent_65%)]" />
          <div
            className="absolute inset-0 opacity-40"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "30px 30px" }}
          />
        </div>

        <div className="relative z-10 flex h-full flex-col">
          {/* Logo */}
          <div className="font-display text-[26px] font-semibold tracking-tight">
            <DenkuLogo size={24} variant="gradient" />
          </div>

          {/* Intro.
              A paragraph of product pitch used to sit under this heading. That is the marketing
              site's job, and by this screen the customer has already bought — so it competed with
              the step's own heading and left every screen carrying two headings and two
              paragraphs before the first field. The welcome stays; the selling goes. */}
          <div className="mt-10">
            <h1 className="font-display text-[28px] font-normal leading-[1.15] tracking-[-0.5px]">
              Let&apos;s build your <em className="italic text-[#3FA3A3]">AI team</em>.
            </h1>
          </div>

          {/* The employee taking shape. Reads only what has already been decided, so it can
              never promise a detail the customer hasn't given us yet. */}
          <EmployeeCard
            businessName={state.orgName || null}
            role={currentStep >= 1 ? GOAL_LABELS[goal] : null}
            // The live choice, on the same terms as the role above it: once the customer is on
            // the step that asks, the card should show what they picked, not what was last saved.
            language={currentStep >= 1 ? language : state.onboardingLanguage}
            phoneNumber={displayPhoneNumber}
            isLive={currentStep >= 5 && phoneStatus === "active"}
          />

          {/* Vertical stepper */}
          <nav className="mt-10 flex-1">
            {STEPS.map((step, idx) => {
              const completed = currentStep > step.id;
              const active = currentStep === step.id;
              const isLast = idx === STEPS.length - 1;
              return (
                <div key={step.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all ${
                        completed
                          ? "bg-[#1B6E6E] text-white"
                          : active
                          ? "border-2 border-[#3FA3A3] bg-[#1B6E6E]/15 text-[#3FA3A3]"
                          : "border border-white/15 text-white/35"
                      }`}
                    >
                      {completed ? <Check className="h-4 w-4" /> : step.id + 1}
                    </div>
                    {!isLast && (
                      <div className={`my-1 w-px flex-1 ${completed ? "bg-[#1B6E6E]" : "bg-white/10"}`} style={{ minHeight: 28 }} />
                    )}
                  </div>
                  <div className={`pb-7 ${isLast ? "" : ""}`}>
                    <div className={`text-sm font-medium ${active ? "text-[#F7F5F1]" : completed ? "text-[#F7F5F1]/80" : "text-white/40"}`}>
                      {step.label}
                    </div>
                    <div className={`mt-0.5 text-xs ${active ? "text-[#F7F5F1]/55" : "text-white/30"}`}>{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Footer reassurance */}
          <div className="relative z-10 mt-6 space-y-4 border-t border-white/[0.08] pt-6">
            <div className="flex items-center gap-2.5 text-xs text-[#F7F5F1]/70">
              <ShieldCheck className="h-4 w-4 text-[#3FA3A3]" />
              Setup takes about 3 minutes
            </div>
            <a href="mailto:hello@denku.io" className="flex items-center gap-2.5 text-xs text-[#F7F5F1]/50 transition-colors hover:text-[#3FA3A3]">
              <HelpCircle className="h-4 w-4" />
              Need a hand? Talk to our team
            </a>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN */}
      <main className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="border-b border-[#0A1A2F]/[0.06] bg-[#F7F5F1]/80 px-5 py-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between">
            <div className="font-display text-[22px] font-semibold tracking-tight text-[#0A1A2F]">
              <DenkuLogo size={24} variant="gradient" />
            </div>
            {/* The stepper rail is desktop-only, so on a phone this line is the ONLY thing
                naming the step. It reads the label from STEPS rather than repeating it, which is
                what the per-step eyebrows used to do — four hardcoded copies free to drift. */}
            <span className="font-brand-mono text-xs text-[#6B7888]">
              Step {Math.min(currentStep + 1, STEPS.length)} of {STEPS.length}
              {STEPS[currentStep]?.label ? ` · ${STEPS[currentStep].label}` : ""}
            </span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#0A1A2F]/[0.08]">
            <div className="h-full rounded-full bg-[#1B6E6E] transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-5 py-10 lg:items-center lg:px-16">
          <div className="w-full max-w-2xl">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                className="mb-5 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-brand-mono text-xs text-[#6B7888] transition hover:bg-[#0A1A2F]/[0.04] hover:text-[#0A1A2F]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {backLabel}
              </button>
            )}

            {error && error !== "BILLING_PAUSED" && error !== "NO_PLAN" && (
              <div className="mb-6 rounded-[12px] border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Step 0: Workspace + Full name + Phone */}
            {currentStep === 0 && (
              <form action={formAction} className="space-y-7">
                <input type="hidden" name="_action" value={state.needsOrgSetup || !state.orgId ? "bootstrap" : "saveWorkspace"} />
                {state.orgId && <input type="hidden" name="orgId" value={state.orgId} />}

                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Who will your AI work for?
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    Your AI employee introduces itself using your business name, so this is the first
                    thing your customers will hear.
                  </p>
                </div>

                <div>
                  <label htmlFor="workspace_name" className="mb-2 block text-sm font-medium text-[#0A1A2F]">
                    Workspace name <span className="text-[#1B6E6E]">*</span>
                  </label>
                  <input
                    id="workspace_name"
                    name="workspaceName"
                    type="text"
                    value={workspaceName}
                    onChange={(e) => {
                      setWorkspaceName(e.target.value);
                      setError(null);
                    }}
                    required
                    className={inputClass}
                    placeholder="Acme Inc."
                  />
                </div>

                <div>
                  <label htmlFor="full_name" className="mb-2 block text-sm font-medium text-[#0A1A2F]">
                    Full name <span className="text-[#1B6E6E]">*</span>
                  </label>
                  <input
                    id="full_name"
                    name="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setError(null);
                    }}
                    required
                    autoComplete="name"
                    className={inputClass}
                    placeholder="Alex Johnson"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="mb-2 block text-sm font-medium text-[#0A1A2F]">
                    Phone number <span className="text-xs text-[#6B7888]">(optional)</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d+()-]/g, "");
                      setPhone(value);
                      setError(null);
                      setPhoneFieldError(null);
                    }}
                    autoComplete="tel"
                    className={phoneFieldError ? inputErrClass : inputClass}
                    placeholder="+1 (555) 123-4567"
                  />
                  {phoneFieldError ? (
                    <p className="mt-1.5 text-xs text-red-600">{phoneFieldError}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-[#6B7888]">For recovery and notifications. You can add this later.</p>
                  )}
                </div>

                {/*
                  Optional, and the highest-value thing on this page.

                  A business's own site usually states its hours, its address and the questions it
                  already answers — every one of which the AI would otherwise have to hand to a
                  human. It is read in the BACKGROUND after this step, never during it: an optional
                  field must not put a network timeout in front of the Continue button.
                */}
                <div>
                  <label htmlFor="website" className="mb-2 block text-sm font-medium text-[#0A1A2F]">
                    Website <span className="text-xs text-[#6B7888]">(optional)</span>
                  </label>
                  <input
                    id="website"
                    name="website"
                    type="text"
                    inputMode="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    autoComplete="url"
                    className={inputClass}
                    placeholder="yourcompany.com"
                  />
                  <p className="mt-1.5 text-xs text-[#6B7888]">
                    We&apos;ll read it to learn your hours, services and common questions, so your AI
                    can answer them instead of passing them on. You review everything before it is
                    saved.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <SubmitButton disabled={!workspaceName.trim() || !fullName.trim()}>Continue</SubmitButton>
                </div>
              </form>
            )}

            {/* Step 1: Goal */}
            {currentStep === 1 && (
              <form action={formAction} className="space-y-7">
                <input type="hidden" name="_action" value="saveGoalLanguage" />
                <input type="hidden" name="orgId" value={state.orgId || ""} />
                <input type="hidden" name="goal" value={goal} />
                <input type="hidden" name="language" value={language} />

                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    What are you hiring it for?
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    This sets how your AI opens a call and what it listens for. You can change its
                    role and fine-tune how it speaks at any time.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Support (ACTIVE, default selected) */}
                  <button
                    type="button"
                    onClick={() => setGoal("support")}
                    className={`flex items-start gap-4 rounded-[14px] border-2 p-5 text-left transition-all ${
                      goal === "support" ? "border-[#1B6E6E] bg-[#E3EEED]" : "border-[#0A1A2F]/10 bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                    }`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${goal === "support" ? "bg-white text-[#134F4F]" : "bg-[#E3EEED] text-[#134F4F]"}`}>
                      <Headphones className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">Customer Support</h3>
                      <p className="mt-1 text-sm text-[#2C3E54]">Answer questions, create tickets, and schedule appointments.</p>
                    </div>
                    {goal === "support" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B6E6E]" />}
                  </button>

                  {/* Sales (DISABLED) */}
                  <button type="button" disabled className="flex cursor-not-allowed items-start gap-4 rounded-[14px] border-2 border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-5 text-left opacity-70">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#EFEBE4] text-[#6B7888]">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-[17px] font-medium text-[#6B7888]">Sales</h3>
                        <span className="rounded-full border border-[#0A1A2F]/10 bg-white px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-wide text-[#6B7888]">Coming soon</span>
                      </div>
                      <p className="mt-1 text-sm text-[#6B7888]">Qualify leads and book demos.</p>
                    </div>
                  </button>

                  {/* Ops (DISABLED) */}
                  <button type="button" disabled className="flex cursor-not-allowed items-start gap-4 rounded-[14px] border-2 border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-5 text-left opacity-70">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#EFEBE4] text-[#6B7888]">
                      <Settings2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-[17px] font-medium text-[#6B7888]">Operations</h3>
                        <span className="rounded-full border border-[#0A1A2F]/10 bg-white px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-wide text-[#6B7888]">Coming soon</span>
                      </div>
                      <p className="mt-1 text-sm text-[#6B7888]">Run workflows and handle operational requests.</p>
                    </div>
                  </button>
                </div>

                {/*
                  Which language it answers in.

                  Derived from `lib/language/registry.ts`, never a hand-written list: the registry
                  is the honest limit — a language reaches it only once an ear that transcribes it
                  and a mouth that speaks it are both proven (R-135). So a language added there
                  appears here in the same commit, and one that was never proven cannot be offered
                  on the screen where the customer is deciding what they are buying.
                */}
                <div className="rounded-[14px] border border-[#0A1A2F]/10 bg-[#FBFAF8] p-5">
                  <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">
                    What language should it answer in?
                  </h3>
                  <p className="mt-1 text-sm text-[#2C3E54]">
                    This is the language your AI speaks and listens in — on calls and in chat. You
                    can change it, or add a second language it understands, in Team → Setup.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {LANGUAGE_CODES.map((code) => {
                      const selected = language === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setLanguage(code)}
                          aria-pressed={selected}
                          className={`flex items-center gap-2 rounded-[10px] border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                            selected
                              ? "border-[#1B6E6E] bg-[#E3EEED] text-[#0A1A2F]"
                              : "border-[#0A1A2F]/10 bg-white text-[#2C3E54] hover:border-[#0A1A2F]/20"
                          }`}
                        >
                          {LANGUAGES[code].label}
                          {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1B6E6E]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/*
                  The single question onboarding asks about the business.

                  Both system prompts refuse to state a fact that is not in the employee's
                  knowledge block, which is the right rule and also means an employee with an
                  empty one answers everything with "I'll pass that to the team". This is the
                  field that changes that. The other seven live in Team → Knowledge, where they
                  can be written after the owner has seen their AI answer someone — a guess typed
                  here, before any of that, would be worse.
                */}
                <div className="rounded-[14px] border border-[#0A1A2F]/10 bg-[#FBFAF8] p-5">
                  <label
                    htmlFor="businessDescription"
                    className="block font-display text-[16px] font-medium text-[#0A1A2F]"
                  >
                    {hasWebsite ? "Anything your website doesn't say?" : "What does your business do?"}
                  </label>
                  {/*
                    The question changes when we were given a website, but the field stays.

                    Asking someone to describe a business whose site we are already reading looks
                    like we ignored what they just typed. But dropping the field entirely would be
                    worse: a scrape can fail, a site can be one JavaScript-rendered page, and
                    plenty of businesses say less about themselves online than they would say in
                    one sentence out loud. So the site becomes the assumed answer and this becomes
                    the correction — which is also the honest description of what happens next,
                    since nothing read from the site is ever saved without the owner confirming it
                    in Knowledge.
                  */}
                  <p className="mt-1 text-sm text-[#2C3E54]">
                    {hasWebsite ? (
                      <>
                        We&apos;re reading{" "}
                        <span className="font-medium text-[#0A1A2F]">{websiteHost}</span> in the
                        background for your services, hours and common questions. Add anything it
                        doesn&apos;t mention — or leave this blank.
                      </>
                    ) : (
                      "A sentence or two. Your AI uses this to answer questions instead of passing them on."
                    )}
                  </p>
                  <textarea
                    id="businessDescription"
                    name="businessDescription"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    /*
                      Generic on purpose, and in the interface's own language.

                      The previous placeholder was a fully-formed sentence about a dental clinic
                      in a specific Istanbul district — vivid enough to read as an answer already
                      filled in, and in a language the surrounding labels do not speak. It taught
                      the reader about someone else's company instead of prompting them about
                      their own.
                    */
                    placeholder={
                      hasWebsite
                        ? "e.g. we also cover the whole metro area, and we're closed on public holidays"
                        : "e.g. we're a family dental practice in New York — cleanings, fillings, implants and whitening"
                    }
                    className="mt-3 w-full resize-none rounded-[10px] border border-[#0A1A2F]/12 bg-white px-4 py-3 text-[15px] text-[#0A1A2F] placeholder:text-[#6B7888]/60 outline-none transition-colors focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15"
                  />
                  <p className="mt-2 text-xs text-[#6B7888]">
                    Optional — you can add this and more in Team → Knowledge later.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <SubmitButton>Continue</SubmitButton>
                </div>
              </form>
            )}

            {/* Step 2: Get Phone Number (AI line) */}
            {/*
              Step 2: what the AI should answer.

              This screen used to ask for a US area code — a question about a phone line, asked
              before the customer had said they wanted one, on the assumption that everybody did.
              That assumption is what made every signup a voice signup by default, and it is why
              someone who came for chat ended up renting a number (R-153). The phone question is
              not gone; it moved to where it makes sense, inside the voice branch of the next step,
              after a voice plan has actually been chosen.
            */}
            {currentStep === 2 && (
              <div className="space-y-7">
                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    What should your AI answer?
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    Pick one to start with. You&apos;ll only be shown plans for what you choose —
                    nothing else is added, and nothing is charged until you say so.
                  </p>
                  {/*
                    Say which language it will answer in, on the screen where the product is being
                    decided.

                    The choice was made one step ago and is not editable here — steps only ever
                    move forward. Restating it is what stops the AI arriving in a language the
                    customer did not expect and only discovers on the first real conversation.
                  */}
                  {(() => {
                    const code = toLanguageCode(language);
                    if (!code) return null;
                    return (
                      <p className="mt-3 text-sm text-[#6B7888]">
                        It will answer in{" "}
                        <span className="font-medium text-[#0A1A2F]">{LANGUAGES[code].label}</span>
                        {" "}— you can change that any time in Team → Setup.
                      </p>
                    );
                  })()}
                </div>

                {/* Billing Paused Block */}
                {state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due") && (
                  <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-6">
                    <p className="mb-2 text-sm font-medium text-amber-900">Billing pause is active</p>
                    <p className="mb-4 text-sm text-amber-800">Resolve billing to carry on with setup.</p>
                    <Button className={outlineBtn} onClick={() => router.push("/dashboard/settings/workspace/billing")}>
                      Go to Billing
                    </Button>
                  </div>
                )}

                {state.workspaceStatus !== "paused" && productChooser}
              </div>
            )}

            {/* Step 3: Choose Plan (if no plan active) */}
            {/*
              Step 3: the plans — for the product the customer picked, and nothing else.

              This was one screen carrying three voice plans, the chat tiers and a skip link all at
              once. The three large cards are voice plans, so "the plans" read as phone service to
              everybody, and a chat customer bought one (R-153). It is now three branches that
              never see each other's prices: choosing chat means a voice plan is not on the screen
              to be clicked by mistake, which is a stronger guarantee than any warning.

              The voice branch has two sub-screens — how much, then which number — because the
              number question only makes sense once there is a plan to attach it to.
            */}
            {currentStep === 3 && (
              <div className="space-y-7">
                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    {planBranch === "voice"
                      ? voiceSubStep === "phone"
                        ? "Which number should it answer?"
                        : "How many calls should it handle?"
                      : planBranch === "chat"
                        ? "How many channels should it answer?"
                        : planBranch === "free"
                          ? "Set up now, choose a plan later"
                          : "What should your AI answer?"}
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    {planBranch === "voice"
                      ? voiceSubStep === "phone"
                        ? "Last question before checkout. We can claim a new US number for you, or your AI can answer the number your customers already know."
                        : "Pick the monthly call volume that fits your business. You're charged now, and you can move up or down at any time."
                      : planBranch === "chat"
                        ? "Sold by channel, not by message — there's no counter to run out of. No phone number and no call minutes."
                        : planBranch === "free"
                          ? "Your workspace and your AI employee get created now. Nothing is charged, and nothing answers your customers until you pick a plan."
                          : "Pick one to start with. You'll only be shown plans for what you choose."}
                  </p>
                </div>

                {/* Confirming Plan UI - shows when checkout=success and plan not active yet */}
                {isConfirming && !state.isPlanActive && (
                  <div className="rounded-[14px] border border-[#1B6E6E]/25 bg-[#E3EEED] p-6">
                    <h3 className="mb-2 font-display text-[16px] font-medium text-[#134F4F]">Confirming your plan…</h3>
                    <p className="text-sm text-[#2C3E54]">This usually takes a few seconds.</p>
                  </div>
                )}

                {/* Billing Paused Block */}
                {state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due") && (
                  <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-6">
                    <p className="mb-2 text-sm font-medium text-amber-900">Billing pause is active</p>
                    <p className="mb-4 text-sm text-amber-800">Resolve billing to activate your line.</p>
                    <Button className={outlineBtn} onClick={() => router.push("/dashboard/settings/workspace/billing")}>
                      Go to billing settings
                    </Button>
                  </div>
                )}

                {/* Checkout messages (for cancel or other states) */}
                {checkoutMessage && !isConfirming && (
                  <div className={`rounded-[14px] border p-6 ${
                    checkoutMessage.includes("canceled") || checkoutMessage.includes("cancelled")
                      ? "border-[#0A1A2F]/10 bg-[#FBFAF8]"
                      : "border-amber-200 bg-amber-50"
                  }`}>
                    <p className="text-sm text-[#0A1A2F]">{checkoutMessage}</p>
                  </div>
                )}

                {state.workspaceStatus !== "paused" && (
                  <>
                    {/*
                      The question was never answered — a workspace that reached this step before
                      the product chooser existed. Asked here rather than guessed: guessing is the
                      entire defect. The same chooser as step 2, not a copy of it, so the two can
                      never quote different prices.
                    */}
                    {!planBranch && productChooser}

                    {/* ── VOICE ── how much */}
                    {planBranch === "voice" && voiceSubStep === "plans" && (
                      <>
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                          {state.plans
                            .slice()
                            .sort((a, b) => {
                              const order: Record<string, number> = { starter: 1, growth: 2, scale: 3 };
                              return (order[a.plan_code] || 999) - (order[b.plan_code] || 999);
                            })
                            .map((plan) => {
                              const isSelected = selectedPlan === plan.plan_code;
                              const isGrowth = plan.plan_code === "growth";
                              return (
                                <div
                                  key={plan.plan_code}
                                  className={`flex h-full flex-col rounded-[16px] border p-6 transition-all ${
                                    isSelected
                                      ? "border-[#1B6E6E] bg-[#E3EEED] brand-shadow-md"
                                      : isGrowth
                                      ? "border-[#1B6E6E]/30 bg-[#FBFAF8]"
                                      : "border-[#0A1A2F]/10 bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                                  }`}
                                >
                                  {isGrowth && (
                                    <div className="mb-2">
                                      <span className="inline-flex items-center rounded-full bg-[#1B6E6E] px-2.5 py-0.5 font-brand-mono text-[10px] uppercase tracking-wide text-white">
                                        Recommended
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex flex-1 flex-col space-y-4">
                                    <div>
                                      <h3 className="font-display text-[18px] font-medium text-[#0A1A2F]">{plan.display_name}</h3>
                                      <div className="mt-2">
                                        <span className="font-display text-[30px] font-medium text-[#0A1A2F]">{formatUsd(plan.monthly_fee_usd)}</span>
                                        <span className="text-sm text-[#6B7888]">/month</span>
                                      </div>
                                    </div>
                                    <div className="flex-1 space-y-2 text-sm text-[#2C3E54]">
                                      <p>{plan.concurrency_limit} concurrent calls</p>
                                      <p>{plan.included_minutes.toLocaleString()} minutes included</p>
                                      <p>{plan.included_phone_numbers} phone number{plan.included_phone_numbers !== 1 ? "s" : ""}</p>
                                      <p>Overage: {formatUsd(plan.overage_rate_usd_per_min)}/min</p>
                                    </div>
                                    <Button
                                      className={`w-full ${isSelected ? tealBtn : outlineBtn}`}
                                      disabled={isPending}
                                      onClick={() => {
                                        // Clicking the selected plan again clears it, so a customer
                                        // who changes their mind is not stuck with a plan they can
                                        // no longer deselect.
                                        setSelectedPlan((prev) => (prev === plan.plan_code ? null : plan.plan_code));
                                        setError(null);
                                        setCheckoutMessage(null);
                                      }}
                                    >
                                      {isSelected ? "Selected" : "Select plan"}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>

                        <div className="flex flex-col items-center gap-3 pt-2">
                          {selectedPlan && (
                            <p className="text-center text-sm text-[#2C3E54]">{checkoutSummary}</p>
                          )}
                          <Button
                            className={`min-w-[220px] ${primaryBtn}`}
                            disabled={!selectedPlan || isPending || isConfirming}
                            onClick={() => {
                              setError(null);
                              setCheckoutMessage(null);
                              setVoiceSubStep("phone");
                            }}
                          >
                            Continue
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          <p className="text-center text-xs text-[#6B7888]">
                            Nothing is charged yet — one more question first.
                          </p>
                        </div>
                      </>
                    )}

                    {/* ── VOICE ── which number */}
                    {planBranch === "voice" && voiceSubStep === "phone" && (
                      <>
                        {/*
                          Two real choices, not one choice and one advertisement.

                          "Bring my own" sat here disabled and labelled "Later" for weeks after the
                          path behind it shipped and answered a real customer's calls over their own
                          carrier (R-155). A business whose number is already printed on their van
                          had to finish setup on a US number they did not want, then undo it from
                          the dashboard. It is rendered from `state.byoNumbersEnabled` rather than
                          shown unconditionally, so an environment where the connect API is switched
                          off never offers a door that leads to a 404.
                        */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setPhoneMode("new")}
                            className={`rounded-[14px] border-2 p-5 text-left transition-all ${
                              phoneMode === "new"
                                ? "border-[#1B6E6E] bg-[#E3EEED]"
                                : "border-[#0A1A2F]/[0.08] bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">Get a new number</h3>
                                <p className="mt-1 text-sm text-[#2C3E54]">We&apos;ll claim one for you as soon as your plan is active. It&apos;s included in the plan.</p>
                              </div>
                              {phoneMode === "new" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B6E6E]" />}
                            </div>
                          </button>

                          {state.byoNumbersEnabled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPhoneMode("byo");
                                // An area code is a preference about a number we would buy. Keeping
                                // it while "bring my own" is selected is how a stale value survives
                                // a change of mind and buys a line anyway.
                                setAreaCode("");
                                setAreaCodeError(null);
                              }}
                              className={`rounded-[14px] border-2 p-5 text-left transition-all ${
                                phoneMode === "byo"
                                  ? "border-[#1B6E6E] bg-[#E3EEED]"
                                  : "border-[#0A1A2F]/[0.08] bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">Bring my own number</h3>
                                  <p className="mt-1 text-sm text-[#2C3E54]">
                                    Keep the number your customers already know. You point your carrier
                                    at us — nothing changes for the people who call you.
                                  </p>
                                </div>
                                {phoneMode === "byo" && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B6E6E]" />}
                              </div>
                            </button>
                          ) : (
                            <div className="rounded-[14px] border-2 border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-5 opacity-70">
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-[16px] font-medium text-[#6B7888]">Bring my own</h3>
                                <span className="rounded-full border border-[#0A1A2F]/10 bg-white px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-wide text-[#6B7888]">Later</span>
                              </div>
                              <p className="mt-1 text-sm text-[#6B7888]">Connect a number you already own.</p>
                            </div>
                          )}
                        </div>

                        {/*
                          A country and an area code are questions about a number WE would buy. They
                          are meaningless — and misleading — when the customer already owns theirs,
                          so this asks what is left to ask instead: nothing yet. The connect flow
                          needs their carrier's SIP details, and that belongs after the plan is paid
                          for, not before.
                        */}
                        {phoneMode === "byo" ? (
                          <div className="rounded-[14px] border border-[#1B6E6E]/25 bg-[#E3EEED] p-5">
                            <p className="text-sm leading-relaxed text-[#134F4F]">
                              We won&apos;t claim a US number for you. Once your plan is active we&apos;ll
                              show you exactly what to paste into your carrier&apos;s panel — the number
                              stays yours, and your AI starts answering it.
                            </p>
                            <p className="mt-2 text-xs text-[#2C3E54]">
                              You&apos;ll need access to your provider&apos;s SIP trunk settings.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-[#0A1A2F]">Country</label>
                              <select value={country} disabled className="w-full cursor-not-allowed rounded-[10px] border border-[#0A1A2F]/10 bg-[#EFEBE4] px-4 py-2.5 text-sm text-[#6B7888]">
                                <option value="US">United States (+1)</option>
                              </select>
                              <p className="mt-1.5 text-xs text-[#6B7888]">More countries coming soon</p>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-[#0A1A2F]">
                                Area code <span className="text-xs text-[#6B7888]">(optional)</span>
                              </label>
                              <input
                                type="text"
                                name="areaCode"
                                value={areaCode}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, "").slice(0, 3);
                                  setAreaCode(value);
                                  if (areaCodeError) setAreaCodeError(null);
                                }}
                                onBlur={() => {
                                  if (areaCode && areaCode.length > 0) {
                                    if (areaCode.length !== 3 || !isValidUSAreaCode(areaCode)) {
                                      setAreaCodeError("Enter a valid US area code (3 digits).");
                                    } else {
                                      setAreaCodeError(null);
                                    }
                                  } else {
                                    setAreaCodeError(null);
                                  }
                                }}
                                placeholder="e.g. 321"
                                maxLength={3}
                                className={areaCodeError ? inputErrClass : inputClass}
                              />
                              {areaCodeError ? (
                                <p className="mt-1.5 text-xs text-red-600">{areaCodeError}</p>
                              ) : (
                                <p className="mt-1.5 text-xs text-[#6B7888]">We&apos;ll try to get a local number. Leave blank for best availability.</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col items-center gap-3 pt-2">
                          <p className="text-center text-sm text-[#2C3E54]">{checkoutSummary}</p>
                          <p className="-mt-1 text-center text-xs text-[#6B7888]">
                            {phoneMode === "byo"
                              ? "Call minutes for the number you already own — we won't claim a new one."
                              : "Includes a US phone number, claimed for you right after checkout."}
                          </p>
                          <Button
                            className={`min-w-[220px] ${primaryBtn}`}
                            disabled={checkoutLoading || isPending || isConfirming || (phoneMode === "new" && !!areaCodeError)}
                            onClick={startVoiceCheckout}
                          >
                            {checkoutLoading ? "Starting checkout..." : "Proceed to checkout"}
                          </Button>
                        </div>
                      </>
                    )}

                    {/* ── CHAT ── */}
                    {planBranch === "chat" && (
                      <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {state.chatPlans.map((tier) => {
                            const isSelected = selectedChat === tier.addon_key;
                            return (
                              <div
                                key={tier.addon_key}
                                className={`flex flex-col rounded-[16px] border p-5 transition-all ${
                                  isSelected
                                    ? "border-[#1B6E6E] bg-[#E3EEED] brand-shadow-md"
                                    : "border-[#0A1A2F]/10 bg-[#FBFAF8] hover:border-[#0A1A2F]/20"
                                }`}
                              >
                                <h4 className="font-display text-[16px] font-medium text-[#0A1A2F]">
                                  {tier.channels === 1 ? "1 chat channel" : `${tier.channels} chat channels`}
                                </h4>
                                <div className="mt-1.5">
                                  <span className="font-display text-[26px] font-medium text-[#0A1A2F]">
                                    {formatUsd(tier.price_usd_month)}
                                  </span>
                                  <span className="text-sm text-[#6B7888]">/month</span>
                                </div>
                                <div className="mt-3 flex-1 space-y-2.5 text-sm text-[#2C3E54]">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {state.chatChannelOptions.map((ch) => {
                                      const Icon = CHANNEL_ICONS[ch.id] ?? MessageSquare;
                                      return (
                                        <span
                                          key={ch.id}
                                          className="inline-flex items-center gap-1.5 rounded-full border border-[#1B6E6E]/25 bg-[#E3EEED] px-2.5 py-1 text-xs font-medium text-[#134F4F]"
                                        >
                                          <Icon className="h-3.5 w-3.5" />
                                          {ch.label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <p>
                                    {tier.channels === 1
                                      ? "Pick any one of these"
                                      : `Pick any ${tier.channels} of these`}
                                  </p>
                                  <p>No phone number, no call minutes</p>
                                  <p>Same inbox, tickets and appointments</p>
                                </div>
                                <Button
                                  className={`mt-4 w-full ${isSelected ? tealBtn : outlineBtn}`}
                                  disabled={isPending}
                                  onClick={() => {
                                    setSelectedChat((prev) => (prev === tier.addon_key ? null : tier.addon_key));
                                    setError(null);
                                    setCheckoutMessage(null);
                                  }}
                                >
                                  {isSelected ? "Selected" : "Select"}
                                </Button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-col items-center gap-3 pt-2">
                          {selectedChat && (
                            <>
                              <p className="text-center text-sm text-[#2C3E54]">{checkoutSummary}</p>
                              <p className="-mt-1 text-center text-xs text-[#6B7888]">
                                No phone number and no call minutes — messages only.
                              </p>
                            </>
                          )}
                          <Button
                            className={`min-w-[220px] ${primaryBtn}`}
                            disabled={!selectedChat || checkoutLoading || isPending || isConfirming}
                            onClick={startChatOnlyCheckout}
                          >
                            {checkoutLoading ? "Starting checkout..." : "Proceed to checkout"}
                          </Button>
                        </div>
                      </>
                    )}

                    {/* ── FREE ── */}
                    {planBranch === "free" && (
                      <>
                        <div className="rounded-[16px] border border-[#0A1A2F]/[0.08] bg-[#FBFAF8] p-6">
                          <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                              <Compass className="h-5 w-5" />
                            </div>
                            <div className="space-y-3">
                              <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">
                                What you get today
                              </h3>
                              {/*
                                Said plainly, because the honest version of a free tier is the part
                                people find out later. Nothing answers a customer until a plan is
                                bought — writing that here costs one line and saves a support
                                ticket that starts "why didn't my AI reply".
                              */}
                              <ul className="space-y-2 text-sm text-[#2C3E54]">
                                <li className="flex items-start gap-2">
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1B6E6E]" />
                                  Your workspace, your AI employee, and the whole dashboard
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1B6E6E]" />
                                  No card, no charge, no phone number claimed
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1B6E6E]" />
                                  Pick a plan whenever you&apos;re ready, from Billing
                                </li>
                              </ul>
                              <p className="text-sm text-[#6B7888]">
                                Your AI won&apos;t answer calls or messages until you choose a plan —
                                there&apos;s nothing for it to answer on yet.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 pt-2">
                          <Button
                            className={`min-w-[220px] ${primaryBtn}`}
                            disabled={isPending || isConfirming}
                            onClick={finishFreePreview}
                          >
                            Finish setup
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          <p className="text-center text-xs text-[#6B7888]">
                            Nothing is charged. Use Back if you&apos;d rather pick a plan now.
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Error message */}
                {error && error !== "BILLING_PAUSED" && (
                  <div className="rounded-[12px] border border-red-200 bg-red-50 p-4">
                    <p className="text-sm text-red-900">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Activating your line */}
            {currentStep === 4 && (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B6E6E]/10">
                    {isActivating ? (
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1B6E6E] border-t-transparent" />
                    ) : (
                      <CheckCircle2 className="h-8 w-8 text-[#1B6E6E]" />
                    )}
                  </div>
                  <h2 className="mt-6 font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    {isActivating ? "Putting your AI to work" : "Your AI employee is ready"}
                  </h2>
                  <p className="mt-3 text-[15px] text-[#2C3E54]">
                    {isActivating
                      ? isChatOnly || isByoNumber
                        ? "Teaching your AI how to answer for your business."
                        : "Claiming your number and teaching your AI how to answer for your business."
                      : isChatOnly
                        ? "Everything is set up. Next, connect a channel."
                        : isByoNumber
                          ? "Your AI is ready. Next, point your number at it."
                          : "Everything is set up. Next, it starts taking calls."}
                  </p>
                </div>

                {/*
                  These describe what setup involves, not live per-step progress — the activation
                  action reports one result, not a stream. They therefore render as a single
                  in-progress/done state together. Showing three independently-ticking rows would
                  be a progress bar we cannot actually back.
                */}
                <div className="mx-auto max-w-md space-y-3">
                  {(isChatOnly
                    ? [
                        // No line is claimed for a chat-only workspace, so the list must not
                        // claim one — this step is over in a moment, but it must not lie while
                        // it is on screen.
                        "Creating your AI employee",
                        "Getting your inbox ready",
                      ]
                    : isByoNumber
                    ? [
                        // Same rule for a customer bringing their own number: we claim nothing,
                        // so nothing here may say we are claiming anything.
                        "Creating your AI employee",
                        "Getting it ready for your number",
                      ]
                    : [
                        "Claiming your phone number",
                        "Creating your AI employee",
                        "Connecting the two together",
                      ]
                  ).map((label) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-[12px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-4"
                    >
                      {isActivating ? (
                        <div className="h-2 w-2 rounded-full bg-[#0A1A2F]/20" />
                      ) : (
                        <Check className="h-4 w-4 shrink-0 text-[#1B6E6E]" />
                      )}
                      <span className="text-sm text-[#0A1A2F]">{label}</span>
                    </div>
                  ))}
                </div>

                {isActivating ? (
                  <p className="mx-auto max-w-md text-center text-sm text-[#6B7888]">
                    This usually takes a few seconds. You don&apos;t need to do anything.
                  </p>
                ) : null}

                {activationError && (
                  <div className="mx-auto max-w-md rounded-[12px] border border-red-200 bg-red-50 p-4">
                    <p className="text-sm text-red-900">{activationError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: You're Live */}
            {/*
              The last step, for a workspace that bought chat and no phone line.

              The voice version below is written entirely around a number: it reserves one,
              counts down while a carrier switches it on, and invites you to call it. None of
              that is true here and none of it ever becomes true, so a chat-only customer would
              have been left watching a card promising a number that will never arrive.

              What replaces it is the one thing they actually still have to do: connect a channel.
            */}
            {currentStep === 5 && isChatOnly && (
              <ConnectChannelStep
                connected={state.connectedChatChannels}
                emailInboundAddress={state.emailInboundAddress}
                onConnected={() => {
                  // Re-read from the DB rather than trusting the click: the connection is only
                  // real once the server says so, and Telegram's webhook registration can fail
                  // after the token validates.
                  getOnboardingState()
                    .then(setState)
                    .catch(() => {});
                }}
                onFinish={handleComplete}
                finishing={isPending}
              />
            )}

            {/*
              The last step for a customer who owns their number and has not connected it yet.

              The voice screen below is written around a number WE claimed: it polls Vapi for a
              provisioning status that will never exist here, counts down a carrier switch-on we
              are not waiting for, and invites them to call a line that does not answer yet. What
              this customer actually still has to do is one thing — point their carrier at us —
              so that is the whole screen.

              Once the line exists (`hasConnectedLine`), the ordinary screen below takes over and
              shows their number, because from then on it is simply their AI's line.
            */}
            {currentStep === 5 && !isChatOnly && isByoNumber && !state.hasConnectedLine && (
              <div className="space-y-7">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B6E6E]">
                    <CheckCircle2 className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="mt-6 font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Your AI employee is ready
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    One thing left: point your existing number at it. Your customers keep calling
                    the number they already know — nothing on their side changes.
                  </p>
                </div>

                <div className="rounded-[16px] border border-[#0A1A2F]/[0.08] bg-[#FBFAF8] p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div className="space-y-2 text-left">
                      <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">
                        Connect your number
                      </h3>
                      <p className="text-sm leading-relaxed text-[#2C3E54]">
                        We&apos;ll give you the exact values to paste into your carrier&apos;s SIP
                        settings. You&apos;ll need access to your provider&apos;s panel — this takes
                        a couple of minutes.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button className={tealBtn} onClick={() => setByoDialogOpen(true)}>
                    <Phone className="h-4 w-4" />
                    Connect my number
                  </Button>
                  <Button className={outlineBtn} onClick={handleComplete} disabled={isPending}>
                    I&apos;ll do this later
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-center text-sm text-[#6B7888]">
                  You can also do this any time from Channels → Phone numbers.
                </p>

                <ConnectOwnNumberDialog
                  open={byoDialogOpen}
                  onOpenChange={setByoDialogOpen}
                  onConnected={() => {
                    // Re-read from the DB rather than trusting the dialog: the line is only real
                    // once `phone_lines` says so, and the carrier still has to be reconfigured.
                    getOnboardingState()
                      .then(setState)
                      .catch(() => {});
                  }}
                />
              </div>
            )}

            {currentStep === 5 && !isChatOnly && !(isByoNumber && !state.hasConnectedLine) && (
              <div className="space-y-7 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B6E6E]">
                  <CheckCircle2 className={`h-8 w-8 text-white transition-all duration-300 ${showActiveAnimation ? "scale-110 animate-pulse" : ""}`} />
                </div>

                {lineIsReady ? (
                  <div>
                    <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                      Your AI employee starts now
                    </h2>
                    <p className="mt-3 text-[15px] text-[#2C3E54]">
                      {isByoNumber
                        ? "Once your carrier is forwarding to us, call the number below and hear it answer — that's exactly what your customers will get, day or night."
                        : "Call the number below and hear it answer — that's exactly what your customers will get, day or night."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                        Almost ready to answer
                      </h2>
                      {/*
                        Say what the wait IS, not just how long it lasts.

                        The old copy gave a bare "~2 minutes" and a ticking clock with nothing
                        behind it, so the obvious reading was that Denku was still working — and
                        a customer who called during it heard silence and concluded the product
                        was broken. Everything on our side is in fact finished by this point: the
                        number exists, the AI employee exists, and the two are already bound. What
                        is left is the phone network publishing the number, which we do not
                        control and cannot speed up. Naming it turns a mysterious delay into an
                        ordinary one.
                      */}
                      <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                        Your AI employee is built and already assigned to this number — that part
                        is done. The last step belongs to the phone network, which takes a minute
                        or two to publish a brand-new number before calls can reach it.
                      </p>
                    </div>

                    {countdownRemaining !== null && countdownRemaining > 0 && (
                      <div className="space-y-2">
                        <div className="font-brand-mono text-3xl font-medium text-[#0A1A2F]">
                          {Math.floor(countdownRemaining / 60)}:{(countdownRemaining % 60).toString().padStart(2, "0")}
                        </div>
                        <div className="mx-auto h-1 w-full max-w-xs overflow-hidden rounded-full bg-[#0A1A2F]/[0.08]">
                          <div className="h-full bg-[#1B6E6E] transition-all duration-1000" style={{ width: `${((120 - countdownRemaining) / 120) * 100}%` }} />
                        </div>
                        <p className="text-xs text-[#6B7888]">
                          Typical time for a carrier to switch a new number on
                        </p>
                      </div>
                    )}

                    {countdownRemaining === 0 && phoneStatus === "activating" && (
                      <p className="text-sm text-[#6B7888]">
                        Taking a little longer than usual. Nothing is wrong and nothing is lost —
                        the number stays yours and starts answering the moment the carrier
                        finishes. You can leave this page.
                      </p>
                    )}

                    <p className="text-sm text-[#6B7888]">
                      Until then, a call may not connect. That&apos;s the carrier, not your AI.
                    </p>
                  </>
                )}

                {/* Phone number card */}
                <div className="rounded-[16px] border border-[#0A1A2F]/[0.08] bg-[#FBFAF8] p-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                      <Phone className="h-5 w-5" />
                    </div>
                    {displayPhoneNumber ? (
                      <span className="font-display text-[22px] font-medium text-[#0A1A2F]">{displayPhoneNumber}</span>
                    ) : displaySipUri ? (
                      <>
                        <span className="break-all text-center font-display text-[18px] font-medium text-[#0A1A2F]">{displaySipUri}</span>
                        <p className="mt-1 text-xs text-[#6B7888]">Use SIP INVITE to test</p>
                      </>
                    ) : (
                      <span className="text-[15px] font-medium text-[#0A1A2F]">Number will appear here once provisioning completes.</span>
                    )}
                    {/*
                      The one fact the customer cannot see for themselves.

                      A number on its own says nothing about whether anything is listening on it.
                      This is the sentence that closes that gap — and it is only true because
                      activation now writes the employee onto the line, rather than leaving it
                      unassigned for the customer to discover as a dashboard warning.
                    */}
                    {displayPhoneNumber ? (
                      <p className="flex items-center gap-1.5 text-xs text-[#134F4F]">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        Your AI employee is assigned to this number
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  {displayPhoneNumber && (
                    <>
                      <Button className={outlineBtn} onClick={handleCopyNumber}>
                        <Copy className="h-4 w-4" />
                        Copy number
                      </Button>
                      {lineIsReady ? (
                        // `tel:` works on a phone and is a no-op on most desktops, so the copy
                        // below tells desktop users what to do instead of leaving a dead button.
                        <Button className={tealBtn} asChild>
                          <a href={`tel:${displayPhoneNumber}`}>
                            <Phone className="h-4 w-4" />
                            Call your AI now
                          </a>
                        </Button>
                      ) : (
                        <Button className={outlineBtn} disabled>
                          <Phone className="h-4 w-4" />
                          Switching on…
                        </Button>
                      )}
                    </>
                  )}
                  {displaySipUri && !displayPhoneNumber && (
                    <Button className={outlineBtn} onClick={handleCopySipUri}>
                      <Copy className="h-4 w-4" />
                      Copy SIP URI
                    </Button>
                  )}
                  <Button className={primaryBtn} onClick={handleComplete} disabled={isPending}>
                    Go to dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                {displayPhoneNumber ? (
                  <p className="text-sm text-[#6B7888]">
                    On a computer? Copy the number and call it from your phone — every call your AI
                    takes appears in your dashboard, with what it heard and what it booked.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
