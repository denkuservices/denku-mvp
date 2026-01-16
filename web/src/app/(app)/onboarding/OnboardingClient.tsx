"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Phone, Globe, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveOnboardingPreferences,
  saveWorkspaceName,
  activatePhoneNumber,
  completeOnboarding,
  setOnboardingStepToPlan,
  startPlanCheckout,
} from "./_actions";
import { formatUsd } from "@/lib/utils";

type OnboardingState = {
  orgId: string;
  orgName: string;
  role: string;
  onboardingStep: number;
  onboardingGoal: string | null;
  onboardingLanguage: string | null;
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
};

type OnboardingClientProps = {
  initialState: OnboardingState;
  checkoutParam?: string;
};

// Step mapping: 0 = goal, 1 = phone number, 2 = choose plan (if no plan), 3 = activate, 4 = live
const STEPS = [
  { id: 0, label: "Goal" },
  { id: 1, label: "Number" },
  { id: 2, label: "Plan" },
  { id: 3, label: "Activate" },
  { id: 4, label: "Go live" },
];

export function OnboardingClient({ initialState, checkoutParam }: OnboardingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState(initialState);
  // Step mapping: 0 = goal, 1 = phone number, 2 = choose plan, 3 = activate, 4 = live
  const initialStep = state.onboardingStep ?? 0;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false); // true when starting checkout
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // selected plan_code
  
  // Handle checkout return (success or cancel) from URL params
  React.useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success" && currentStep === 2) {
      // On success, check if plan is active (webhook should have set it)
      setCheckoutMessage("Payment successful! Activating plan...");
      // Refresh after a short delay to allow webhook to process
      const timer = setTimeout(() => {
        // Reload page to get fresh state (plan should be active now)
        window.location.href = "/onboarding";
      }, 2000);
      return () => clearTimeout(timer);
    } else if (checkout === "cancel") {
      setCheckoutMessage("Payment was cancelled. You can try again when ready.");
      // Clear query param
      const timer = setTimeout(() => {
        router.replace("/onboarding");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams, currentStep, router]);
  
  // Also handle checkoutParam prop for server-side pass-through
  React.useEffect(() => {
    if (checkoutParam === "cancel" && !checkoutMessage) {
      setCheckoutMessage("Payment was cancelled. You can try again when ready.");
    }
  }, [checkoutParam, checkoutMessage]);

  // Step 0: Goal + Language (load from state if available)
  const [goal, setGoal] = useState<"support" | "sales">(
    (state.onboardingGoal as "support" | "sales") || "support"
  );
  const [language, setLanguage] = useState(state.onboardingLanguage || "auto");

  // Step 1: Phone number
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");

  // Step 2: Activation
  const [isActivating, setIsActivating] = useState(false);
  const [activationComplete, setActivationComplete] = useState(false);
  const [provisionedPhoneNumber, setProvisionedPhoneNumber] = useState<string | null>(null);

  const handleSavePreferences = () => {
    startTransition(async () => {
      const result = await saveOnboardingPreferences(state.orgId, {
        goal,
        language,
      });
      if (result.ok) {
        // Step mapping: 0 = goal, 1 = number, 2 = go-live
        // After saving goal, move to step 1 (number selection)
        setCurrentStep(1);
        setState((s) => ({
          ...s,
          onboardingStep: 1,
          onboardingGoal: goal,
          onboardingLanguage: language,
        }));
        setError(null);
      } else {
        setError(result.error || "Failed to save preferences");
      }
    });
  };

  const handleActivateNumber = () => {
    // Check gating conditions
    if (state.workspaceStatus === "paused" && (state.pausedReason === "hard_cap" || state.pausedReason === "past_due")) {
      setError("BILLING_PAUSED");
      return;
    }

    // If plan is not active, advance to inline plan selection (step 2) instead of redirecting
    if (!state.isPlanActive) {
      startTransition(async () => {
        const result = await setOnboardingStepToPlan(state.orgId);
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
    setIsActivating(true);
    setError(null);

    startTransition(async () => {
      const result = await activatePhoneNumber(state.orgId, country, areaCode || undefined);
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
          const stepResult = await setOnboardingStepToPlan(state.orgId);
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
    startTransition(async () => {
      const result = await completeOnboarding(state.orgId);
      if (result.ok) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Failed to complete onboarding");
      }
    });
  };

  const handleCopyNumber = () => {
    const number = provisionedPhoneNumber || state.phoneNumber;
    if (number && typeof window !== "undefined") {
      navigator.clipboard.writeText(number);
    }
  };

  const displayPhoneNumber = provisionedPhoneNumber || state.phoneNumber;

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

          {/* Step 0: Goal + Language */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">What do you want your line to handle?</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Choose the primary use case for your phone line.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
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
                    { value: "auto", label: "Auto-detect", icon: Globe },
                    { value: "en", label: "English", icon: null },
                    { value: "tr", label: "Turkish", icon: null },
                  ].map((lang) => (
                    <button
                      key={lang.value}
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
                <Button onClick={handleSavePreferences} disabled={isPending}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: Get Phone Number */}
          {currentStep === 1 && (
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
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Advance to inline plan selection (step 2) - stay on onboarding
                      startTransition(async () => {
                        const result = await setOnboardingStepToPlan(state.orgId);
                        if (result.ok) {
                          setCurrentStep(2);
                          setState((s) => ({ ...s, onboardingStep: 2 }));
                          setError(null);
                        } else {
                          setError(result.error || "Failed to advance to plan selection");
                        }
                      });
                    }}
                    disabled={isPending}
                  >
                    Choose a plan
                  </Button>
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
                      onClick={handleActivateNumber}
                      disabled={isActivating || isPending}
                    >
                      {isActivating ? "Activating…" : "Activate my number"}
                      {!isActivating && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Choose Plan (if no plan active) */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Choose a plan</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Select a plan to activate your phone line. You'll be charged now. You can change your plan anytime later.
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
                    Go to billing settings
                  </Button>
                </div>
              )}

              {/* Checkout messages */}
              {checkoutMessage && (
                <div className={`rounded-xl border p-6 ${
                  checkoutMessage.includes("successful") || checkoutMessage.includes("Processing")
                    ? "border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950"
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
                        variant="default"
                        disabled={checkoutLoading || isPending}
                        onClick={() => {
                          if (!selectedPlan) return;
                          setCheckoutLoading(true);
                          setError(null);
                          setCheckoutMessage(null);
                          startTransition(async () => {
                            const result = await startPlanCheckout(selectedPlan);
                            if (result.ok && result.url) {
                              // Redirect to Stripe Checkout
                              window.location.href = result.url;
                            } else {
                              setCheckoutLoading(false);
                              if (result.error === "BILLING_PAUSED") {
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

          {/* Step 4: Activation Complete / You're live */}
          {currentStep === 4 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Your AI phone line is live</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {displayPhoneNumber
                    ? "Your phone number is ready to receive calls."
                    : "We'll assign your number right after plan activation."}
                </p>
              </div>

              {displayPhoneNumber && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="flex items-center justify-center gap-3">
                    <Phone className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                    <span className="text-xl font-semibold text-zinc-900 dark:text-white">{displayPhoneNumber}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                {displayPhoneNumber && (
                  <>
                    <Button variant="outline" onClick={handleCopyNumber}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy number
                    </Button>
                    <Button variant="outline" onClick={() => window.open(`tel:${displayPhoneNumber}`)}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call to test
                    </Button>
                  </>
                )}
                <Button onClick={handleComplete} disabled={isPending}>
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
