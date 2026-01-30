"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui-horizon/card";

export default function AddPhoneLinePage() {
  const router = useRouter();
  const [lineType, setLineType] = useState<"Support" | "Sales" | "After-hours">("Support");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/phone-lines/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineType: "support" }), // Always send support (lowercase)
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          const errorMsg = data.error || "Failed to add phone number. Please try again.";
          setError(errorMsg);
          return;
        }

        // Validate lineId before redirecting
        const lineId = data.lineId;
        if (!lineId || typeof lineId !== "string" || lineId.trim() === "") {
          setError("Invalid response from server. Please try again.");
          return;
        }

        // Redirect to detail page with success param
        router.push(`/dashboard/phone-lines/${lineId}?created=1`);
      } catch (err) {
        setError("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Card extra="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-navy-700 dark:text-white">
            Add a new phone line
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Provision a new US number for your workspace.
          </p>
        </div>

        {/* Features */}
        <div className="mb-6 space-y-0 rounded-lg border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span>US phone number</span>
          </div>
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span>Billed monthly</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span>Cancel anytime</span>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-700/50">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy-700 dark:text-white">$10</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">/ month</span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            Phone numbers create entry points. Concurrent calls define capacity.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            Taxes calculated at checkout.
          </p>
        </div>

        {/* Line Type */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
            Line Type
          </label>
          <select
            value={lineType}
            onChange={(e) => setLineType(e.target.value as typeof lineType)}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
          >
            <option value="Support">Support</option>
            <option value="Sales" disabled>Sales — Premium (locked)</option>
            <option value="After-hours" disabled>After-hours — Premium (locked)</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-white/10">
          <Link
            href="/dashboard/phone-lines"
            className="flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 h-11 text-sm font-medium text-gray-700 transition duration-200 hover:bg-gray-50 dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
          >
            Cancel
          </Link>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 h-11 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
          >
            {isPending ? "Adding..." : "Confirm & add number"}
          </button>
        </div>
      </Card>
    </div>
  );
}
