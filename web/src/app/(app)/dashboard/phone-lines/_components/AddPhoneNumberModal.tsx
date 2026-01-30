"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Lock, Check, X } from "lucide-react";

interface AddPhoneNumberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3 | 4;
type LineType = "support" | "after_hours" | "sales";

function formatPhoneNumber(e164: string | null): string {
  if (!e164) return "Not assigned";
  const cleaned = e164.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const area = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const number = cleaned.slice(7);
    return `+1 (${area}) ${exchange}-${number}`;
  }
  return e164;
}

export function AddPhoneNumberModal({ open, onOpenChange, onSuccess }: AddPhoneNumberModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [selectedCountry, setSelectedCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [preferredAreaCode, setPreferredAreaCode] = useState<string | null>(null);
  const [lineType, setLineType] = useState<LineType>("support");
  const [lineName, setLineName] = useState("Support Line");
  
  // Result state
  const [createdLineId, setCreatedLineId] = useState<string | null>(null);
  const [createdPhoneNumberE164, setCreatedPhoneNumberE164] = useState<string | null>(null);
  
  // Activation countdown state (120 seconds = 2 minutes)
  const [activationCountdown, setActivationCountdown] = useState<number | null>(null);

  // Step 4: ensure purchase is only triggered once when entering step
  const step4PurchaseAttemptedRef = useRef(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setError(null);
      setSelectedCountry("US");
      setAreaCode("");
      setPreferredAreaCode(null);
      setLineType("support");
      setLineName("Support Line");
      setCreatedLineId(null);
      setCreatedPhoneNumberE164(null);
      setIsPurchasing(false);
      setActivationCountdown(null);
      step4PurchaseAttemptedRef.current = false;
    }
  }, [open]);

  // Countdown timer: runs only when Step 4 and countdown is set (after purchase success)
  useEffect(() => {
    if (step !== 4 || activationCountdown === null || activationCountdown <= 0) return;
    const interval = setInterval(() => {
      setActivationCountdown((prev) => (prev === null || prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, activationCountdown]);

  // When countdown hits 0, refresh list once
  useEffect(() => {
    if (step === 4 && activationCountdown === 0) {
      router.refresh();
    }
  }, [step, activationCountdown, router]);

  // Update line name default when line type changes
  useEffect(() => {
    if (lineType === "support") {
      setLineName("Support Line");
    } else if (lineType === "after_hours") {
      setLineName("After-hours Line");
    } else if (lineType === "sales") {
      setLineName("Sales Line");
    }
  }, [lineType]);

  const handleClose = () => {
    if (!isPurchasing) {
      onOpenChange(false);
    }
  };

  const handleStep1Continue = () => {
    setError(null);
    setStep(2);
  };

  const handleStep2Continue = () => {
    setError(null);
    setPreferredAreaCode(areaCode.trim() ? areaCode.trim() : null);
    setStep(3);
  };

  const handleStep2Back = () => {
    setStep(1);
  };

  const handleStep3Back = () => {
    setStep(2);
  };

  const handleStep3Continue = () => {
    setError(null);
    setStep(4);
  };

  // Step 4: run purchase once when entering step (and on retry)
  const runStep4Purchase = async () => {
    setError(null);
    setIsPurchasing(true);
    try {
      const res = await fetch("/api/phone-lines/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: "US",
          preferredAreaCode: preferredAreaCode ?? undefined,
          lineType,
          lineName: lineName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to reserve number. Please try again.");
        setIsPurchasing(false);
        return;
      }

      if (!data.lineId || typeof data.lineId !== "string") {
        setError("Invalid response from server. Please try again.");
        setIsPurchasing(false);
        return;
      }

      setCreatedLineId(data.lineId);
      setCreatedPhoneNumberE164(data.phoneNumberE164 ?? null);
      setActivationCountdown(120);
      setIsPurchasing(false);
      router.refresh();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsPurchasing(false);
    }
  };

  // Trigger purchase once when Step 4 mounts (no double-call on re-render)
  useEffect(() => {
    if (open && step === 4 && !step4PurchaseAttemptedRef.current) {
      step4PurchaseAttemptedRef.current = true;
      runStep4Purchase();
    }
  }, [open, step]);

  const handleViewDetails = () => {
    if (createdLineId) {
      handleClose();
      router.push(`/dashboard/phone-lines/${createdLineId}`);
    }
  };

  const handleTestCall = () => {
    if (createdLineId) {
      handleClose();
      router.push(`/dashboard/phone-lines/${createdLineId}?test=1`);
    }
  };

  const handleCopyPhoneNumber = () => {
    if (createdPhoneNumberE164) navigator.clipboard.writeText(createdPhoneNumberE164);
  };

  const handleStep4Retry = () => {
    step4PurchaseAttemptedRef.current = false;
    runStep4Purchase();
  };

  const lineTypeLabel = (t: LineType) =>
    t === "support" ? "Support" : t === "after_hours" ? "After-hours" : "Sales";

  // Format countdown as mm:ss
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[520px] max-h-[85vh] overflow-auto rounded-lg bg-background shadow-lg border p-6 relative">
            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={isPurchasing}
              className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>

            {/* Step indicator */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Step {step} of 4
            </p>

            {/* Step 1: Pricing Confirmation */}
            {step === 1 && (
              <>
                <DialogHeader>
              <DialogTitle>Add a phone number</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    <p>Phone numbers create entry points. Concurrent calls define capacity.</p>
                  </div>
                  <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-navy-700 dark:text-white">$10</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">/month per phone number</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Taxes calculated at checkout.
                    </p>
                  </div>
                </div>
              </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                  <button
                    onClick={handleClose}
                    disabled={isPurchasing}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStep1Continue}
                    disabled={isPurchasing}
                    className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Area code preference */}
            {step === 2 && (
              <>
                <DialogHeader>
                  <DialogTitle>Choose a number</DialogTitle>
                  <DialogDescription>
                    Pick a preferred area code. We’ll assign a number when you continue.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                      Country
                    </label>
                    <select
                      value={selectedCountry}
                      onChange={(e) => setSelectedCountry(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                    >
                      <option value="US">United States</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                      Area code (optional)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={areaCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "").slice(0, 3);
                        setAreaCode(value);
                      }}
                      placeholder="e.g. 407"
                      maxLength={3}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      We’ll try to match your area code. If unavailable, we’ll assign the closest option.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                  <button
                    onClick={handleStep2Back}
                    disabled={isPurchasing}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep2Continue}
                    disabled={isPurchasing}
                    className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Line Setup */}
            {step === 3 && (
              <>
                <DialogHeader>
                  <DialogTitle>Set up this phone line</DialogTitle>
                  <DialogDescription>
                    Choose the line type and optional name.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white">
                      Line type
                    </label>
                    <div className="space-y-2">
                      {/* Support */}
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          lineType === "support"
                            ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20"
                            : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:hover:bg-navy-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="lineType"
                          value="support"
                          checked={lineType === "support"}
                          onChange={(e) => setLineType(e.target.value as LineType)}
                          className="h-4 w-4 text-brand-500 focus:ring-brand-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-navy-700 dark:text-white">Support</div>
                        </div>
                        {lineType === "support" && (
                          <Check className="h-5 w-5 text-brand-500" />
                        )}
                      </label>

                      {/* After-hours */}
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          lineType === "after_hours"
                            ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20"
                            : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-navy-700 dark:hover:bg-navy-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="lineType"
                          value="after_hours"
                          checked={lineType === "after_hours"}
                          onChange={(e) => setLineType(e.target.value as LineType)}
                          className="h-4 w-4 text-brand-500 focus:ring-brand-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-navy-700 dark:text-white">After-hours</div>
                        </div>
                        {lineType === "after_hours" && (
                          <Check className="h-5 w-5 text-brand-500" />
                        )}
                      </label>

                      {/* Sales (locked) */}
                      <div className="group relative">
                        <label
                          className="flex cursor-not-allowed items-center gap-3 rounded-lg border p-3 opacity-60 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5"
                        >
                          <input
                            type="radio"
                            name="lineType"
                            value="sales"
                            disabled
                            className="h-4 w-4 text-gray-400"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-700 dark:text-gray-300">Sales</div>
                          </div>
                          <Lock className="h-5 w-5 text-gray-400" />
                        </label>
                        <div className="absolute bottom-full left-0 mb-2 hidden rounded-md bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
                          Upgrade required
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                      Line name (optional)
                    </label>
                    <input
                      type="text"
                      value={lineName}
                      onChange={(e) => setLineName(e.target.value.slice(0, 60))}
                      placeholder="e.g. Main support line"
                      maxLength={60}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                    />
                  </div>

                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                      {error}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                  <button
                    onClick={handleStep3Back}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep3Continue}
                    className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {/* Step 4: Success + activation countdown */}
            {step === 4 && (
              <>
                <DialogHeader>
                  <DialogTitle>Your new phone line is being activated</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Activation may take up to 2 minutes.
                      </p>
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  {isPurchasing && (
                    <>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Phone number</p>
                            <div className="mt-1 h-7 w-40 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                          </div>
                          <div
                            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5"
                            aria-hidden
                          >
                            <Copy className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Line</p>
                        <div className="mt-1 h-5 w-48 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Activation</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                          <span className="text-sm font-medium text-navy-700 dark:text-white">
                            Reserving your number…
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This usually takes a few seconds.</p>
                      </div>
                    </>
                  )}

                  {!isPurchasing && error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                      <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                      <button
                        type="button"
                        onClick={handleStep4Retry}
                        className="mt-2 text-sm font-medium text-red-700 dark:text-red-300 hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {!isPurchasing && !error && createdLineId && (
                    <>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Phone number</p>
                            <p className="mt-1 text-lg font-bold text-navy-700 dark:text-white">
                              {formatPhoneNumber(createdPhoneNumberE164)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyPhoneNumber}
                            className="flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                            title="Copy phone number"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Line</p>
                        <p className="mt-1 text-sm text-navy-700 dark:text-white">
                          {lineTypeLabel(lineType)}
                          {lineName ? ` · ${lineName}` : ""}
                        </p>
                      </div>
                      {activationCountdown !== null && (
                        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Activation</span>
                          {activationCountdown > 0 ? (
                            <span className="text-sm font-medium text-navy-700 dark:text-white">
                              {formatCountdown(activationCountdown)}
                            </span>
                          ) : (
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">Ready</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {(isPurchasing || createdLineId) && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleViewDetails}
                        disabled={isPurchasing || (activationCountdown !== null && activationCountdown > 0)}
                        className="linear flex-1 cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
                      >
                        View line details
                      </button>
                      <button
                        onClick={handleTestCall}
                        disabled={isPurchasing}
                        className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
                      >
                        Make a test call
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Call your new number to test it.
                    </p>
                    <button
                      onClick={handleClose}
                      className="text-center text-sm text-gray-600 underline hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Back to Phone Lines
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
