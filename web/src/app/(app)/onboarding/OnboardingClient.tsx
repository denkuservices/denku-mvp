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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  bootstrapWorkspaceAction,
  saveWorkspaceAction,
  saveGoalAndLanguageAction,
  advanceToPlanAction,
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
import { DenkuLogo } from "@/components/brand/DenkuLogo";
import { ConnectChannelStep } from "./_components/ConnectChannelStep";
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
  { id: 2, label: "Its number", desc: "The line it answers" },
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
  if (language) rows.push({ label: "Speaks", value: language.toUpperCase() });
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
  // Whether this workspace bought chat and no phone line. Read from the plan the DB actually
  // holds, not from what was clicked, so a refreshed page or a resumed session is still right.
  const isChatOnly = state.planCode === "chat_only";

  // A chat tier, chosen INSTEAD of a voice plan. The two are mutually exclusive — one buys a
  // phone line, the other buys channels and no phone line at all — so selecting either clears
  // the other rather than letting a customer think they are buying both.
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
  // The one thing onboarding asks about the business itself. Optional — it makes the AI
  // specific rather than generic, but skipping it still yields a working employee.
  const [businessDescription, setBusinessDescription] = useState(
    initialState.businessDescription ?? ""
  );
  const [website, setWebsite] = useState(initialState.websiteUrl ?? "");

  // Step 2: Phone number (AI line)
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeError, setAreaCodeError] = useState<string | null>(null);

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
    } else if (action === "advanceToPlan") {
      result = await advanceToPlanAction(formData);
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
    if (action === "saveWorkspace" && website.trim()) {
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

  const handleComplete = () => {
    // Navigate directly to dashboard - activation already set onboarding_step = 6
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
  const displayPhoneNumber = state.phoneNumberE164 ?? state.phoneNumber ?? provisionedPhoneNumber ?? null;
  // SIP URI for provider="vapi" lines (may exist when E164 doesn't)
  const displaySipUri = state.phoneNumberSipUri ?? null;

  const progressPct = Math.min(100, Math.round((currentStep / (STEPS.length - 1)) * 100));

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
            language={state.onboardingLanguage}
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
                    What does your business do?
                  </label>
                  <p className="mt-1 text-sm text-[#2C3E54]">
                    A sentence or two. Your AI uses this to answer questions instead of passing
                    them on.
                  </p>
                  <textarea
                    id="businessDescription"
                    name="businessDescription"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="We're a dental clinic in Kadıköy. Cleanings, fillings, implants and whitening."
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
            {currentStep === 2 && (
              <div className="space-y-7">
                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Give your AI a phone line
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    This is the number it answers — 24 hours a day, without ringing out. Pick an area
                    code your customers will recognise.
                  </p>
                </div>

                {/* Billing Paused Block */}
                {state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due") && (
                  <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-6">
                    <p className="mb-2 text-sm font-medium text-amber-900">Billing pause is active</p>
                    <p className="mb-4 text-sm text-amber-800">Resolve billing to activate your line.</p>
                    <Button className={outlineBtn} onClick={() => router.push("/dashboard/settings/workspace/billing")}>
                      Go to Billing
                    </Button>
                  </div>
                )}

                {/* Phone Number Options */}
                {state.workspaceStatus !== "paused" && (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-[14px] border-2 border-[#1B6E6E] bg-[#E3EEED] p-5">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-display text-[16px] font-medium text-[#0A1A2F]">Get a new number</h3>
                            <p className="mt-1 text-sm text-[#2C3E54]">We&apos;ll assign you a number.</p>
                          </div>
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B6E6E]" />
                        </div>
                      </div>

                      <div className="rounded-[14px] border-2 border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-5 opacity-70">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-display text-[16px] font-medium text-[#6B7888]">Bring my own</h3>
                              <span className="rounded-full border border-[#0A1A2F]/10 bg-white px-2 py-0.5 font-brand-mono text-[10px] uppercase tracking-wide text-[#6B7888]">Later</span>
                            </div>
                            <p className="mt-1 text-sm text-[#6B7888]">Port your existing number.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <form action={formAction} className="space-y-5">
                      <input type="hidden" name="_action" value="savePhonePreferences" />
                      <input type="hidden" name="orgId" value={state.orgId || ""} />
                      <input type="hidden" name="country" value={country} />

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
                                if (areaCode.length !== 3) {
                                  setAreaCodeError("Enter a valid US area code (3 digits).");
                                } else if (!isValidUSAreaCode(areaCode)) {
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
                            disabled={isActivating}
                          />
                          {areaCodeError ? (
                            <p className="mt-1.5 text-xs text-red-600">{areaCodeError}</p>
                          ) : (
                            <p className="mt-1.5 text-xs text-[#6B7888]">We&apos;ll try to get a local number. Leave blank for best availability.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <SubmitButton disabled={!!areaCodeError}>Continue</SubmitButton>
                      </div>
                    </form>

                    {/*
                      A chat-only customer has no use for an area code, and asking anyway makes
                      the product look like it only does phones. This skips straight to the plan
                      step, where the chat tiers live.

                      It is its own form because the one above saves the phone preferences; this
                      must save nothing. `advanceToPlanAction` only moves the step forward, and
                      steps never move back, so a customer who changes their mind and buys voice
                      loses nothing — activation falls back to area code 321 exactly as it does
                      for anyone who leaves the field blank.
                    */}
                    <form action={formAction} className="flex justify-center border-t border-[#0A1A2F]/10 pt-5">
                      <input type="hidden" name="_action" value="advanceToPlan" />
                      <input type="hidden" name="orgId" value={state.orgId || ""} />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="text-sm text-[#6B7888] underline underline-offset-4 transition-colors hover:text-[#1B6E6E] disabled:opacity-60"
                      >
                        I don&apos;t need a phone line — I want chat
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Choose Plan (if no plan active) */}
            {currentStep === 3 && (
              <div className="space-y-7">
                <div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    How much should it handle?
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    Pick the monthly call volume that fits your business. You&apos;re charged now, and
                    you can move up or down at any time.
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

                {/* Plan cards */}
                {state.workspaceStatus !== "paused" && (
                  <>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                      {state.plans
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
                                    setSelectedPlan(plan.plan_code);
                                    setSelectedChat(null);
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

                    {/*
                      Chat instead of voice.

                      Placed under the voice plans rather than beside them because it is a
                      different shape of purchase, not a fourth size: it buys channels the AI
                      answers on and NO phone line. Selecting one clears the voice selection, so
                      the checkout button can only ever mean one thing.

                      Renders only when a tier has a configured Stripe price — `getOnboardingState`
                      filters on that, so an offer we cannot charge for never reaches a button.
                    */}
                    {state.chatPlans.length > 0 && (
                      <div className="space-y-4 border-t border-[#0A1A2F]/10 pt-7">
                        <div>
                          <h3 className="font-display text-[19px] font-normal text-[#0A1A2F]">
                            Or skip the phone line entirely
                          </h3>
                          <p className="mt-2 text-[14px] leading-relaxed text-[#2C3E54]">
                            An AI that answers messages instead of calls. Sold by channel, not by
                            message — there is no counter to run out of.
                          </p>
                        </div>

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
                                    setSelectedChat(tier.addon_key);
                                    setSelectedPlan(null);
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
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col items-center gap-3 pt-2">
                      {selectedChat && (
                        <Button
                          className={`min-w-[220px] ${primaryBtn}`}
                          disabled={checkoutLoading || isPending || isConfirming}
                          onClick={() => {
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
                          }}
                        >
                          {checkoutLoading ? "Starting checkout..." : "Proceed to checkout"}
                        </Button>
                      )}

                      {selectedPlan && (
                        <Button
                          className={`min-w-[220px] ${primaryBtn}`}
                          disabled={checkoutLoading || isPending || isConfirming}
                          onClick={() => {
                            if (!selectedPlan) return;
                            setCheckoutLoading(true);
                            setError(null);
                            setCheckoutMessage(null);
                            startTransition(async () => {
                              const result = await startPlanCheckout(selectedPlan as "starter" | "growth" | "scale");
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
                          }}
                        >
                          {checkoutLoading ? "Starting checkout..." : "Proceed to checkout"}
                        </Button>
                      )}

                      <Button
                        className={`min-w-[220px] ${outlineBtn}`}
                        disabled={isPending || isConfirming}
                        onClick={() => {
                          if (!state.orgId) {
                            setError("Organization ID is missing.");
                            return;
                          }
                          setError(null);
                          setCheckoutMessage(null);
                          startTransition(async () => {
                            const result = await continueWithoutPlan(state.orgId!);
                            if (result.ok) {
                              router.push("/dashboard/channels/phone-numbers");
                            } else {
                              setError(result.error || "Failed to continue without plan");
                            }
                          });
                        }}
                      >
                        Continue without plan
                      </Button>
                    </div>
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
                      ? isChatOnly
                        ? "Teaching your AI how to answer for your business."
                        : "Claiming your number and teaching your AI how to answer for your business."
                      : isChatOnly
                        ? "Everything is set up. Next, connect a channel."
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

            {currentStep === 5 && !isChatOnly && (
              <div className="space-y-7 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B6E6E]">
                  <CheckCircle2 className={`h-8 w-8 text-white transition-all duration-300 ${showActiveAnimation ? "scale-110 animate-pulse" : ""}`} />
                </div>

                {phoneStatus === "active" || (countdownRemaining !== null && countdownRemaining === 0 && phoneStatus !== "activating") ? (
                  <div>
                    <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                      Your AI employee starts now
                    </h2>
                    <p className="mt-3 text-[15px] text-[#2C3E54]">
                      Call the number below and hear it answer — that&apos;s exactly what your
                      customers will get, day or night.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                        Almost ready to answer
                      </h2>
                      <p className="mt-3 text-[15px] text-[#2C3E54]">
                        Your number is reserved. Carriers take up to ~2 minutes to switch it on.
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
                      </div>
                    )}

                    {countdownRemaining === 0 && phoneStatus === "activating" && (
                      <p className="text-sm text-[#6B7888]">Still activating… This usually completes within a few moments.</p>
                    )}

                    <p className="text-sm text-[#6B7888]">
                      As soon as it&apos;s on, call the number below to hear your AI answer.
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
                      {phoneStatus === "active" || (countdownRemaining === 0 && phoneStatus !== "activating") ? (
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
