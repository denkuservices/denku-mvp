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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveOnboardingPreferences,
  bootstrapWorkspaceAction,
  saveWorkspaceAction,
  saveGoalAndLanguageAction,
  advanceToPlanAction,
  activatePhoneNumber,
  runActivation,
  completeOnboarding,
  setOnboardingStepToPlan,
  startPlanCheckout,
  getOnboardingState,
  checkPhoneStatus,
  savePhonePreferences,
  continueWithoutPlan,
} from "./_actions";
import { formatUsd } from "@/lib/utils";
import { isValidUSAreaCode } from "@/lib/telephony/usAreaCodes";


type OnboardingState = {
  orgId: string | null;
  orgName: string;
  role: string | null;
  onboardingStep: number;
  onboardingGoal: string | null;
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
const STEPS = [
  { id: 0, label: "Workspace", desc: "Your company & identity" },
  { id: 1, label: "Agent goal", desc: "What your line handles" },
  { id: 2, label: "Phone number", desc: "Claim your AI line" },
  { id: 3, label: "Plan", desc: "Choose your capacity" },
  { id: 4, label: "Activation", desc: "We provision everything" },
  { id: 5, label: "Go live", desc: "Start taking calls" },
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

  const handleActivateNumber = () => {
    // Check gating conditions
    if (state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due")) {
      setError("BILLING_PAUSED");
      return;
    }

    // If plan is not active, advance to inline plan selection (step 2) instead of redirecting
    if (!state.isPlanActive) {
      if (!state.orgId) {
        setError("Organization ID is missing. Please refresh the page.");
        return;
      }
      const orgId = state.orgId; // Extract for TypeScript narrowing
      startTransition(async () => {
        const result = await setOnboardingStepToPlan(orgId);
        if (result.ok) {
          // Advance to step 2 (choose plan) - stay on onboarding page
          setCurrentStep(2);
          setState((s) => ({ ...s, onboardingStep: 2 }));
          setError(null);
        } else {
          setError(result.error || "Failed to advance to plan selection");
        }
      });
      return;
    }

    // Plan is active - proceed with activation
    // Guard: Ensure orgId is a string before calling activatePhoneNumber
    const orgId = state.orgId;
    if (!orgId) {
      setError("We couldn't find your workspace. Please refresh and try again.");
      return;
    }

    setIsActivating(true);
    setError(null);

    startTransition(async () => {
      const result = await activatePhoneNumber(orgId, country, areaCode || undefined);
      if (result.ok) {
        setProvisionedPhoneNumber(result.phoneNumber || null);

        // Refresh state from DB to get deterministic step advancement
        const updatedState = await getOnboardingState();
        setState(updatedState);
        setCurrentStep(updatedState.onboardingStep);
        setIsActivating(false);
      } else {
        if (result.error === "BILLING_PAUSED") {
          setError("BILLING_PAUSED");
        } else if (result.error === "NO_PLAN") {
          // Plan became inactive - advance to plan selection
          if (!state.orgId) {
            setError("Organization ID is missing. Please refresh the page.");
            setIsActivating(false);
            return;
          }
          const orgIdForStep = state.orgId; // Extract for TypeScript narrowing
          const stepResult = await setOnboardingStepToPlan(orgIdForStep);
          if (stepResult.ok) {
            setCurrentStep(2);
            setState((s) => ({ ...s, onboardingStep: 2 }));
          } else {
            setError(stepResult.error || "Plan required. Please select a plan.");
          }
        } else {
          setError(result.error || "Failed to activate number");
        }
        setIsActivating(false);
      }
    });
  };

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
            den<span className="text-[#3FA3A3]">ku</span>
          </div>

          {/* Intro */}
          <div className="mt-10">
            <div className="brand-eyebrow !text-[#3FA3A3] before:!bg-[#3FA3A3]">Welcome aboard</div>
            <h1 className="mt-4 font-display text-[28px] font-normal leading-[1.15] tracking-[-0.5px]">
              Let&apos;s get your AI voice employee <em className="italic text-[#3FA3A3]">live</em>.
            </h1>
          </div>

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
              den<span className="text-[#1B6E6E]">ku</span>
            </div>
            <span className="font-brand-mono text-xs text-[#6B7888]">
              Step {Math.min(currentStep + 1, STEPS.length)} of {STEPS.length}
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
                  <div className="brand-eyebrow mb-4">Step 1 · Workspace</div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Set up your workspace
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    A few details so we can personalize your AI employee and keep your account secure.
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
                  <div className="brand-eyebrow mb-4">Step 2 · Agent goal</div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    What should your line handle?
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    Choose the primary role for your AI employee. You can refine its behavior anytime.
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

                <div className="flex justify-end pt-2">
                  <SubmitButton>Continue</SubmitButton>
                </div>
              </form>
            )}

            {/* Step 2: Get Phone Number (AI line) */}
            {currentStep === 2 && (
              <div className="space-y-7">
                <div>
                  <div className="brand-eyebrow mb-4">Step 3 · Phone number</div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Claim your AI number
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    This is the line your AI employee answers. We&apos;ll provision it for you instantly.
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
                  </>
                )}
              </div>
            )}

            {/* Step 3: Choose Plan (if no plan active) */}
            {currentStep === 3 && (
              <div className="space-y-7">
                <div>
                  <div className="brand-eyebrow mb-4">Step 4 · Plan</div>
                  <h2 className="font-display text-[clamp(28px,3vw,38px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                    Choose your capacity
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#2C3E54]">
                    Select a plan to activate your line. You&apos;re charged now and can change plans anytime.
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

                    {/* Action buttons */}
                    <div className="flex flex-col items-center gap-3 pt-2">
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
                              router.push("/dashboard/phone-lines");
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
                    Activating your line
                  </h2>
                  <p className="mt-3 text-[15px] text-[#2C3E54]">
                    Provisioning your phone number and configuring your Main Line.
                  </p>
                </div>

                <div className="mx-auto max-w-md space-y-3">
                  {["Provisioning phone number", "Creating Main Line", "Binding number to agent"].map((label) => (
                    <div key={label} className="flex items-center gap-3 rounded-[12px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-4">
                      <div className={`h-2 w-2 rounded-full ${isActivating ? "bg-[#0A1A2F]/20" : "bg-[#1B6E6E]"}`} />
                      <span className="text-sm text-[#0A1A2F]">{label}</span>
                    </div>
                  ))}
                </div>

                {activationError && (
                  <div className="mx-auto max-w-md rounded-[12px] border border-red-200 bg-red-50 p-4">
                    <p className="text-sm text-red-900">{activationError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: You're Live */}
            {currentStep === 5 && (
              <div className="space-y-7 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B6E6E]">
                  <CheckCircle2 className={`h-8 w-8 text-white transition-all duration-300 ${showActiveAnimation ? "scale-110 animate-pulse" : ""}`} />
                </div>

                {phoneStatus === "active" || (countdownRemaining !== null && countdownRemaining === 0 && phoneStatus !== "activating") ? (
                  <div>
                    <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                      Your AI phone line is live
                    </h2>
                    <p className="mt-3 text-[15px] text-[#2C3E54]">
                      {showActiveAnimation ? "Your number is now active." : "Your phone number is ready to receive calls."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
                        Activating your number
                      </h2>
                      <p className="mt-3 text-[15px] text-[#2C3E54]">
                        We&apos;ve reserved your number. It can take up to ~2 minutes to activate.
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

                    <p className="text-sm text-[#6B7888]">Once active, you can call the number below to test.</p>
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
                        <Button className={outlineBtn} asChild>
                          <a href={`tel:${displayPhoneNumber}`}>
                            <Phone className="h-4 w-4" />
                            Call to test
                          </a>
                        </Button>
                      ) : (
                        <Button className={outlineBtn} disabled>
                          <Phone className="h-4 w-4" />
                          Activating…
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
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
