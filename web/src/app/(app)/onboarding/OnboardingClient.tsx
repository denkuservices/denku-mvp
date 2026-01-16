"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Phone, Globe, ArrowRight, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveOnboardingPreferences,
  saveWorkspaceName,
  activatePhoneNumber,
  completeOnboarding,
} from "./_actions";

type OnboardingState = {
  orgId: string;
  orgName: string;
  role: string;
  onboardingStep: number;
  workspaceStatus: "active" | "paused";
  pausedReason: "manual" | "hard_cap" | "past_due" | null;
  planCode: string | null;
  hasPhoneNumber: boolean;
  phoneNumber: string | null;
};

type OnboardingClientProps = {
  initialState: OnboardingState;
};

const STEPS = [
  { id: 0, label: "Workspace" },
  { id: 1, label: "Goal" },
  { id: 2, label: "Number" },
  { id: 3, label: "Go live" },
];

export function OnboardingClient({ initialState }: OnboardingClientProps) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [currentStep, setCurrentStep] = useState(state.onboardingStep || 0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 0: Workspace name
  const [workspaceName, setWorkspaceName] = useState(state.orgName || "");

  // Step 1: Goal + Language
  const [goal, setGoal] = useState<"support" | "sales">("support");
  const [language, setLanguage] = useState("auto");

  // Step 2: Phone number
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");

  // Step 3: Activation
  const [isActivating, setIsActivating] = useState(false);
  const [activationComplete, setActivationComplete] = useState(false);
  const [provisionedPhoneNumber, setProvisionedPhoneNumber] = useState<string | null>(null);

  const handleSaveWorkspaceName = () => {
    if (!workspaceName.trim()) {
      setError("Workspace name is required");
      return;
    }

    startTransition(async () => {
      const result = await saveWorkspaceName(state.orgId, workspaceName.trim());
      if (result.ok) {
        setState((s) => ({ ...s, orgName: workspaceName.trim() }));
        setCurrentStep(1);
        setError(null);
      } else {
        setError(result.error || "Failed to save workspace name");
      }
    });
  };

  const handleSavePreferences = () => {
    startTransition(async () => {
      const result = await saveOnboardingPreferences(state.orgId, {
        goal,
        language,
      });
      if (result.ok) {
        setCurrentStep(2);
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

    if (!state.planCode) {
      // Store return flag and redirect to billing
      if (typeof window !== "undefined") {
        sessionStorage.setItem("onboarding_return_to", "/onboarding");
      }
      router.push("/dashboard/settings/workspace/billing");
      return;
    }

    setIsActivating(true);
    setError(null);

    startTransition(async () => {
      const result = await activatePhoneNumber(state.orgId, country, areaCode || undefined);
      if (result.ok) {
        setProvisionedPhoneNumber(result.phoneNumber || null);
        setActivationComplete(true);
        setCurrentStep(3);
        setIsActivating(false);
      } else {
        if (result.error === "BILLING_PAUSED") {
          setError("BILLING_PAUSED");
        } else if (result.error === "NO_PLAN") {
          // Redirect to billing
          if (typeof window !== "undefined") {
            sessionStorage.setItem("onboarding_return_to", "/onboarding");
          }
          router.push("/dashboard/settings/workspace/billing");
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

          {/* Step 0: Workspace Name */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Workspace name</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Give your workspace a name. You can change this later.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Workspace name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveWorkspaceName();
                    }
                  }}
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  placeholder="My Company"
                  disabled={isPending}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveWorkspaceName} disabled={isPending || !workspaceName.trim()}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: Goal + Language */}
          {currentStep === 1 && (
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

          {/* Step 2: Get Phone Number */}
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
              {!state.planCode && state.workspaceStatus !== "paused" && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
                    To activate your number, choose a plan.
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    Select a plan to get started with your phone line.
                  </p>
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem("onboarding_return_to", "/onboarding");
                      }
                      router.push("/dashboard/settings/workspace/billing");
                    }}
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

          {/* Step 3: Activation Complete */}
          {currentStep === 3 && (
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
