"use client";

import * as React from "react";
import { useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, Phone, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
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
} from "./_actions";
import { formatUsd } from "@/lib/utils";

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
  vapiPhoneNumberId?: string | null;
  vapiAssistantId?: string | null;
  needsOrgSetup?: boolean;
};

type OnboardingClientProps = {
  initialState: OnboardingState;
  checkoutStatus?: "success" | "cancel" | null;
};

// UI step mapping: 0 = Workspace, 1 = Goal+Language, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
// DB step mapping: 0 = initial, 1 = Goal, 2 = Language, 3 = Phone Intent, 4 = Plan, 5 = Activating, 6 = Live
const STEPS = [
  { id: 0, label: "Workspace" },
  { id: 1, label: "Goal" },
  { id: 2, label: "Phone Intent" },
  { id: 3, label: "Plan" },
  { id: 4, label: "Activating" },
  { id: 5, label: "Live" },
];

export function OnboardingClient({ initialState, checkoutStatus }: OnboardingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState(initialState);
  
  // Canonical step mapping: 0 = Goal, 1 = Language, 2 = Phone Intent, 3 = Plan, 4 = Activating, 5 = Live
  // Workspace setup happens during bootstrap - onboarding starts at Goal (step 0)
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

  // Step 1: Goal + Language (load from state if available)
  const [goal, setGoal] = useState<"support" | "sales">(
    (state.onboardingGoal as "support" | "sales") || "support"
  );
  // Default to English (remove auto-detect)
  const [language, setLanguage] = useState(state.onboardingLanguage || "en");

  // Step 2: Phone number (AI line)
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");

  // Step 4: Activation
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [provisionedPhoneNumber, setProvisionedPhoneNumber] = useState<string | null>(null);

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
  
  // Submit button component with pending state
  function SubmitButton({ children, disabled: externalDisabled, ...props }: React.ComponentProps<typeof Button> & { children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
      <Button type="submit" variant="primary" disabled={pending || externalDisabled} {...props}>
        {pending ? "Please wait…" : children}
        {!pending && typeof children === "string" && !children.includes("wait") && (
          <ArrowRight className="ml-2 h-4 w-4" />
        )}
      </Button>
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
        setActivationComplete(true);
        // Step mapping: 0 = goal, 1 = phone number, 2 = choose plan, 3 = activate, 4 = live
        // After activation, move to step 4 (live)
        setCurrentStep(4);
        setState((s) => ({ ...s, onboardingStep: 4 }));
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
    if (!state.orgId) {
      setError("Organization ID is missing. Please refresh the page.");
      return;
    }
    const orgId = state.orgId; // Extract for TypeScript narrowing
    startTransition(async () => {
      const result = await completeOnboarding(orgId);
      if (result.ok) {
        // Refresh state and then redirect
        const updatedState = await getOnboardingState();
        if (updatedState.isPlanActive) {
          router.push("/dashboard");
        } else {
          // If not active yet, refresh and stay on onboarding
          setState(updatedState);
          setCurrentStep(updatedState.onboardingStep);
        }
      } else {
        setError(result.error || "Failed to complete onboarding");
      }
    });
  };

  const handleCopyNumber = () => {
    const number = state.phoneNumberE164 ?? state.phoneNumber ?? provisionedPhoneNumber ?? null;
    if (number && typeof window !== "undefined") {
      navigator.clipboard.writeText(number);
    }
  };

  // SSR-safe and null-safe phone number display
  // SSR-safe and null-safe phone number display
  // Prefer phoneNumberE164 from state (DB truth), fallback to phoneNumber or provisionedPhoneNumber
  const displayPhoneNumber = state.phoneNumberE164 ?? state.phoneNumber ?? provisionedPhoneNumber ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Stepper Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                      currentStep >= step.id
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-semibold">{step.id + 1}</span>
                    )}
                  </div>
                  <span
                    className={`ml-3 text-sm font-medium ${
                      currentStep >= step.id ? "text-zinc-900 dark:text-white" : "text-zinc-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`mx-4 h-0.5 flex-1 ${
                      currentStep > step.id ? "bg-brand-500" : "bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {error && error !== "BILLING_PAUSED" && error !== "NO_PLAN" && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Step 0: Workspace + Full name + Phone */}
          {currentStep === 0 && (
            <form action={formAction} className="space-y-6">
              <input type="hidden" name="_action" value={state.needsOrgSetup || !state.orgId ? "bootstrap" : "saveWorkspace"} />
              {state.orgId && <input type="hidden" name="orgId" value={state.orgId} />}
              
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Set up your workspace</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Tell us a bit about yourself and your workspace.
                </p>
              </div>

              <div>
                <label htmlFor="workspace_name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Workspace name <span className="text-red-500">*</span>
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
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-60 transition-colors"
                  placeholder="Acme Inc."
                />
              </div>

              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Full name <span className="text-red-500">*</span>
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
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-60 transition-colors"
                  placeholder="Alex Johnson"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Phone number <span className="text-zinc-500 text-xs">(optional)</span>
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
                  className={`w-full rounded-xl border px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition-colors dark:bg-zinc-800 dark:text-white disabled:opacity-60 ${
                    phoneFieldError
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500"
                      : "border-zinc-200 focus:border-brand-500 focus:ring-brand-500/20 dark:border-zinc-700"
                  } bg-white`}
                  placeholder="+1 (555) 123-4567"
                />
                {phoneFieldError ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {phoneFieldError}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    For recovery and notifications. You can add this later.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <SubmitButton disabled={!workspaceName.trim() || !fullName.trim()}>
                  Continue
                </SubmitButton>
              </div>
            </form>
          )}

          {/* Step 1: Goal + Language */}
          {currentStep === 1 && (
            <form action={formAction} className="space-y-6">
              <input type="hidden" name="_action" value="saveGoalLanguage" />
              <input type="hidden" name="orgId" value={state.orgId || ""} />
              <input type="hidden" name="goal" value={goal} />
              <input type="hidden" name="language" value={language} />
              
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">What do you want your line to handle?</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Choose the primary use case for your phone line.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setGoal("support")}
                  className={`rounded-xl border-2 p-6 text-left transition-all ${
                    goal === "support"
                      ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Customer Support</h3>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Handle customer inquiries and support requests.
                      </p>
                    </div>
                    {goal === "support" && (
                      <CheckCircle2 className="h-5 w-5 text-brand-500 flex-shrink-0" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {}}
                  disabled
                  className="rounded-xl border-2 border-zinc-200 bg-zinc-50 p-6 text-left opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">Sales</h3>
                        <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                          Coming soon
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                        Sales calls and lead qualification.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Language
                </label>
                <div className="space-y-2">
                  {[
                    { value: "en", label: "English", icon: null },
                    { value: "tr", label: "Turkish", icon: null },
                  ].map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => setLanguage(lang.value)}
                      className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                        language === lang.value
                          ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {lang.icon && <lang.icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />}
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">{lang.label}</span>
                        {language === lang.value && (
                          <CheckCircle2 className="ml-auto h-5 w-5 text-brand-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <SubmitButton>
                  Continue
                </SubmitButton>
              </div>
            </form>
          )}

          {/* Step 2: Get Phone Number (AI line) */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Get a phone number</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Choose how you want to set up your phone line.
                </p>
              </div>

              {/* Billing Paused Block */}
              {state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
                    Billing pause is active
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mb-4">
                    Resolve billing to activate your line.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/settings/workspace/billing")}
                  >
                    Go to Billing
                  </Button>
                </div>
              )}

              {/* No Plan Checkpoint */}
              {!state.isPlanActive && state.workspaceStatus !== "paused" && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
                    To activate your number, choose a plan.
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    Select a plan to get started with your phone line.
                  </p>
                  <form action={formAction} className="inline">
                    <input type="hidden" name="_action" value="advanceToPlan" />
                    <input type="hidden" name="orgId" value={state.orgId || ""} />
                    <SubmitButton>
                      Choose a plan
                    </SubmitButton>
                  </form>
                </div>
              )}

              {/* Phone Number Options */}
              {state.planCode && state.workspaceStatus !== "paused" && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border-2 border-brand-500 bg-brand-50 p-6 dark:border-brand-500 dark:bg-brand-500/10">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Get a new phone number</h3>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            We'll assign you a number.
                          </p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-brand-500 flex-shrink-0" />
                      </div>
                    </div>

                    <div className="rounded-xl border-2 border-zinc-200 bg-zinc-50 p-6 opacity-60 dark:border-zinc-700 dark:bg-zinc-800">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">Bring my own number</h3>
                            <span className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                              Later
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                            Port your existing number.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Country
                      </label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        disabled={isActivating}
                      >
                        <option value="US">United States</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Area code <span className="text-zinc-500">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={areaCode}
                        onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder="e.g., 415"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        disabled={isActivating}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      onClick={handleActivateNumber}
                      disabled={isActivating || isPending}
                    >
                      {isActivating ? "Please wait…" : "Activate my number"}
                      {!isActivating && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Choose Plan (if no plan active) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Choose a plan</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Select a plan to activate your phone line. You'll be charged now. You can change your plan anytime later.
                </p>
              </div>

              {/* Confirming Plan UI - shows when checkout=success and plan not active yet */}
              {isConfirming && !state.isPlanActive && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-900 dark:bg-brand-950">
                  <h3 className="text-base font-semibold text-brand-900 dark:text-brand-200 mb-2">
                    Confirming your plan…
                  </h3>
                  <p className="text-sm text-brand-800 dark:text-brand-300">
                    This usually takes a few seconds.
                  </p>
                </div>
              )}

              {/* Billing Paused Block */}
              {state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
                    Billing pause is active
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mb-4">
                    Resolve billing to activate your line.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/settings/workspace/billing")}
                  >
                    Go to billing settings
                  </Button>
                </div>
              )}

              {/* Confirming Plan UI - shows when checkout=success and plan not active yet */}
              {isConfirming && !state.isPlanActive && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-900 dark:bg-brand-950">
                  <h3 className="text-base font-semibold text-brand-900 dark:text-brand-200 mb-2">
                    Confirming your plan…
                  </h3>
                  <p className="text-sm text-brand-800 dark:text-brand-300">
                    This usually takes a few seconds.
                  </p>
                </div>
              )}

              {/* Checkout messages (for cancel or other states) */}
              {checkoutMessage && !isConfirming && (
                <div className={`rounded-xl border p-6 ${
                  checkoutMessage.includes("canceled") || checkoutMessage.includes("cancelled")
                    ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                }`}>
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">{checkoutMessage}</p>
                </div>
              )}

              {/* Plan cards */}
              {state.workspaceStatus !== "paused" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Sort plans: Starter → Growth → Scale */}
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
                            className={`rounded-xl border p-6 transition-all flex flex-col h-full ${
                              isSelected
                                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950"
                                : isGrowth
                                ? "border-brand-300 bg-brand-50/50 dark:border-brand-600 dark:bg-brand-950/50"
                                : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600"
                            }`}
                          >
                            {/* Growth badge */}
                            {isGrowth && (
                              <div className="mb-2">
                                <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                                  Recommended
                                </span>
                              </div>
                            )}
                            <div className="space-y-4 flex-1 flex flex-col">
                              <div>
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                                  {plan.display_name}
                                </h3>
                                <div className="mt-2">
                                  <span className="text-3xl font-bold text-zinc-900 dark:text-white">
                                    {formatUsd(plan.monthly_fee_usd)}
                                  </span>
                                  <span className="text-sm text-zinc-600 dark:text-zinc-400">/month</span>
                                </div>
                              </div>
                              <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400 flex-1">
                                <p>{plan.concurrency_limit} capacity (simultaneous calls)</p>
                                <p>{plan.included_minutes.toLocaleString()} minutes included</p>
                                <p>{plan.included_phone_numbers} phone number{plan.included_phone_numbers !== 1 ? "s" : ""}</p>
                                <p>Overage: {formatUsd(plan.overage_rate_usd_per_min)}/min</p>
                              </div>
                              <Button
                                className="w-full"
                                variant={isSelected ? "default" : "outline"}
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

                  {/* Proceed to checkout button */}
                  {selectedPlan && (
                    <div className="flex justify-center pt-4">
                      <Button
                        className="min-w-[200px]"
                        variant="primary"
                        disabled={checkoutLoading || isPending || isConfirming}
                        onClick={() => {
                          if (!selectedPlan) return;
                          setCheckoutLoading(true);
                          setError(null);
                          setCheckoutMessage(null);
                          startTransition(async () => {
                            const result = await startPlanCheckout(selectedPlan as "starter" | "growth" | "scale");
                            if (result.ok && result.url) {
                              // Redirect to Stripe Checkout
                              window.location.href = result.url;
                            } else {
                              setCheckoutLoading(false);
                              if (result.error === "UNAUTH") {
                                // Server-side auth failed - show error and allow retry
                                // Do NOT redirect client-side; server-side session exists via httpOnly cookies
                                // Client Supabase client cannot read httpOnly cookies, so client redirects are unreliable
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
                    </div>
                  )}
                </>
              )}

              {/* Error message */}
              {error && error !== "BILLING_PAUSED" && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                  <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Activating your line */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
                  {isActivating ? (
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                  ) : (
                    <CheckCircle2 className="h-8 w-8 text-brand-500" />
                  )}
                </div>

                <h2 className="mt-6 text-2xl font-bold text-zinc-900 dark:text-white">Activating your line</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Provisioning your phone number and setting up your Main Line.
                </p>
              </div>

              {/* Progress list */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <div className={`h-2 w-2 rounded-full ${isActivating ? "bg-zinc-300" : "bg-green-500"}`} />
                  <span className="text-sm text-zinc-900 dark:text-white">Provisioning phone number</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <div className={`h-2 w-2 rounded-full ${isActivating ? "bg-zinc-300" : "bg-green-500"}`} />
                  <span className="text-sm text-zinc-900 dark:text-white">Creating Main Line</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <div className={`h-2 w-2 rounded-full ${isActivating ? "bg-zinc-300" : "bg-green-500"}`} />
                  <span className="text-sm text-zinc-900 dark:text-white">Binding number to agent</span>
                </div>
              </div>

              {/* Error message */}
              {activationError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                  <p className="text-sm text-red-900 dark:text-red-200">{activationError}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: You're Live (only place with dashboard CTA) */}
          {currentStep === 5 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Your AI phone line is live</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {displayPhoneNumber
                    ? "Your phone number is ready to receive calls."
                    : "Your phone number is being set up."}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center justify-center gap-3">
                  <Phone className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                  <span className="text-xl font-semibold text-zinc-900 dark:text-white">
                    {displayPhoneNumber || "Number will appear here once provisioning completes."}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                {displayPhoneNumber && (
                  <>
                    <Button variant="outline" onClick={handleCopyNumber}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy number
                    </Button>
                    <Button variant="outline" asChild>
                      <a href={`tel:${displayPhoneNumber}`}>
                        <Phone className="mr-2 h-4 w-4" />
                        Call this number to test
                      </a>
                    </Button>
                  </>
                )}
                <Button variant="primary" onClick={handleComplete} disabled={isPending}>
                  Go to dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
