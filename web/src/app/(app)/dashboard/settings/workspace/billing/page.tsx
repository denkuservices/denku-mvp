"use client";

import * as React from "react";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { formatUsd } from "@/lib/utils";

// API response types
type BillingSummary = {
  ok: boolean;
  org_id: string;
  month: string;
  preview: {
    plan_code: string | null;
    monthly_fee_usd: number | null;
    estimated_overage_cost_usd: number | null;
    estimated_total_due_usd: number | null;
    total_calls: number | null;
    billable_minutes: number | null;
    peak_concurrent_calls: number | null;
    overage_minutes: number | null;
    overage_rate_usd_per_min: number | null;
  } | null;
  invoice_run: {
    status: string | null;
    stripe_invoice_id: string | null;
    estimated_total_due_usd: number | null;
  } | null;
  plan_limits: {
    plan_code: string | null;
    concurrency_limit: number | null;
  };
  pricing: {
    monthly_fee_usd: number | null;
    included_minutes: number | null;
    overage_rate_usd_per_min: number | null;
  };
  history: Array<{
    month: string;
    status: string | null;
    stripe_invoice_id: string | null;
    estimated_total_due_usd: number | null;
  }>;
};

// Plan display data (for UI only, not used for billing computation)
const PLAN_DISPLAY: Record<string, { name: string; monthly_fee: number; concurrency: number; included_minutes: number }> = {
  starter: { name: "Starter", monthly_fee: 149, concurrency: 2, included_minutes: 600 },
  growth: { name: "Growth", monthly_fee: 399, concurrency: 5, included_minutes: 1500 },
  scale: { name: "Scale", monthly_fee: 899, concurrency: 20, included_minutes: 4000 },
};

// Utility function for className merging
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Button component
function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "destructive";
  }
) {
  const { variant = "secondary", className, ...rest } = props;
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700"
      : variant === "destructive"
      ? "border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/30 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/20"
      : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-white/5";
  return <button type="button" className={cn(base, styles, className)} {...rest} />;
}

// Card component
function Card({ className, children }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm",
        "dark:border-white/10 dark:bg-zinc-950",
        className
      )}
    >
      {children}
    </div>
  );
}

// Section title component
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
    </div>
  );
}

// Badge component
function Badge({
  children,
  variant = "success",
}: {
  children: React.ReactNode;
  variant?: "success" | "warning" | "neutral";
}) {
  const styles =
    variant === "success"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      : variant === "warning"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      : "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        styles
      )}
    >
      {children}
    </span>
  );
}

// Usage stat component
function UsageStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

// Format month string to readable date
function formatMonth(monthStr: string): string {
  try {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return monthStr;
  }
}

// Map invoice status to user-friendly label
function formatInvoiceStatus(status: string | null): string {
  if (!status) return "—";
  
  const statusMap: Record<string, string> = {
    draft: "Draft",
    stale: "Replaced",
    paid: "Paid",
    open: "Open",
    void: "Void",
    uncollectible: "Uncollectible",
    error: "Needs review",
  };
  
  const normalized = status.toLowerCase();
  if (statusMap[normalized]) {
    return statusMap[normalized];
  }
  
  // Default: Title Case
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function WorkspaceBillingPage() {
  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [changingPlan, setChangingPlan] = React.useState(false);

  // Fetch billing summary
  const fetchSummary = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/billing/summary");
      const data = await res.json();
      if (data.ok) {
        setSummary(data);
      } else {
        setError(data.error || "Failed to load billing summary");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Handle plan change
  const handlePlanChange = async (planCode: "starter" | "growth" | "scale") => {
    try {
      setChangingPlan(true);
      const res = await fetch("/api/billing/plan/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: planCode }),
      });
      const data = await res.json();
      if (data.ok) {
        // Refetch summary to refresh UI
        await fetchSummary();
      } else {
        alert(data.error || "Failed to change plan");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setChangingPlan(false);
    }
  };

  // Get current plan display data
  const currentPlanCode = summary?.preview?.plan_code || summary?.plan_limits?.plan_code || "starter";
  const currentPlanDisplay = PLAN_DISPLAY[currentPlanCode] || PLAN_DISPLAY.starter;
  const currentPricing = summary?.pricing || { monthly_fee_usd: null, included_minutes: null, overage_rate_usd_per_min: null };

  // Error state
  if (error && !summary) {
    return (
      <SettingsShell
        title="Billing"
        subtitle="Plan, payment method, and invoices."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workspace" },
          { label: "Billing" },
        ]}
      >
        <Card>
          <div className="text-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{error}</p>
            <Button variant="primary" onClick={fetchSummary}>
              Retry
            </Button>
          </div>
        </Card>
      </SettingsShell>
    );
  }

  // Loading state
  if (loading && !summary) {
    return (
      <SettingsShell
        title="Billing"
        subtitle="Plan, payment method, and invoices."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workspace" },
          { label: "Billing" },
        ]}
      >
        <Card>
          <div className="text-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
          </div>
        </Card>
      </SettingsShell>
    );
  }

  const preview = summary?.preview;
  const invoiceRun = summary?.invoice_run;
  const planLimits = summary?.plan_limits;

  return (
    <SettingsShell
      title="Billing"
      subtitle="Plan, payment method, and invoices."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Billing" },
      ]}
    >
      <div className="space-y-6">
        {/* Main grid: 2/3 left, 1/3 right */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: Current plan + Usage + Estimated invoice (spans 2 columns) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Current plan card */}
            <Card>
              <SectionTitle title="Current plan" subtitle="Your subscription and plan settings." />

              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                        {currentPlanDisplay.name}
                      </h3>
                      <Badge variant="success">Active</Badge>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-zinc-900 dark:text-white">
                        {formatUsd(currentPricing.monthly_fee_usd || currentPlanDisplay.monthly_fee)}
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">/month</span>
                    </div>
                  </div>
                </div>

                {/* Plan features */}
                <div className="mt-6 space-y-2">
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Plan includes:
                  </p>
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <svg
                        className="h-4 w-4 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {planLimits?.concurrency_limit || currentPlanDisplay.concurrency} concurrent calls
                    </li>
                    <li className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <svg
                        className="h-4 w-4 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {(currentPricing.included_minutes || currentPlanDisplay.included_minutes).toLocaleString()} minutes included
                    </li>
                    {currentPricing.overage_rate_usd_per_min && (
                      <li className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <svg
                          className="h-4 w-4 text-zinc-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {formatUsd(currentPricing.overage_rate_usd_per_min)}/min overage
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </Card>

            {/* Usage card */}
            <Card>
              <SectionTitle title="Usage" subtitle="A quick snapshot for this billing period." />

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UsageStat
                  label="Total calls"
                  value={(preview?.total_calls || 0).toLocaleString()}
                  hint="This billing period"
                />
                <UsageStat
                  label="Billable minutes"
                  value={(preview?.billable_minutes || 0).toLocaleString()}
                  hint={`Included: ${(currentPricing.included_minutes || currentPlanDisplay.included_minutes).toLocaleString()}`}
                />
                <UsageStat
                  label="Peak concurrent"
                  value={(preview?.peak_concurrent_calls || 0).toString()}
                  hint={`Limit: ${planLimits?.concurrency_limit || currentPlanDisplay.concurrency}`}
                />
              </div>
            </Card>

            {/* Estimated invoice card */}
            <Card>
              <SectionTitle
                title="Estimated invoice"
                subtitle="Current month billing estimate."
              />

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Monthly fee</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {formatUsd(preview?.monthly_fee_usd || currentPricing.monthly_fee_usd || currentPlanDisplay.monthly_fee)}
                  </span>
                </div>
                {preview?.estimated_overage_cost_usd && preview.estimated_overage_cost_usd > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Overage</span>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {formatUsd(preview.estimated_overage_cost_usd)}
                    </span>
                  </div>
                )}
                <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-zinc-900 dark:text-white">
                      Total due
                    </span>
                    <span className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {formatUsd(preview?.estimated_total_due_usd || preview?.monthly_fee_usd || currentPricing.monthly_fee_usd || currentPlanDisplay.monthly_fee)}
                    </span>
                  </div>
                  {invoiceRun?.stripe_invoice_id && (
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="warning">Draft</Badge>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {invoiceRun.stripe_invoice_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Right column: Upgrade section (1 column) */}
          <div className="space-y-6">
            <Card>
              <SectionTitle title="Upgrade plan" subtitle="Change your plan at any time." />

              <div className="mt-6 space-y-3">
                {(["starter", "growth", "scale"] as const).map((planCode) => {
                  const planDisplay = PLAN_DISPLAY[planCode];
                  const isCurrent = planCode === currentPlanCode;
                  
                  // Determine button label based on price comparison
                  const currentMonthlyFee = currentPricing.monthly_fee_usd ?? currentPlanDisplay.monthly_fee;
                  const targetMonthlyFee = planDisplay.monthly_fee;
                  let buttonLabel = "Current";
                  
                  if (!isCurrent) {
                    if (targetMonthlyFee > currentMonthlyFee) {
                      buttonLabel = "Upgrade";
                    } else if (targetMonthlyFee < currentMonthlyFee) {
                      buttonLabel = "Switch plan";
                    } else {
                      buttonLabel = "Current";
                    }
                  }
                  
                  return (
                    <div
                      key={planCode}
                      className={cn(
                        "rounded-xl border p-4",
                        isCurrent
                          ? "border-brand-500 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-500/10"
                          : "border-zinc-200 bg-zinc-50/50 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {planDisplay.name}
                          </h4>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {planDisplay.concurrency} concurrent • {planDisplay.included_minutes.toLocaleString()} min
                          </p>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {formatUsd(planDisplay.monthly_fee)}/month
                          </p>
                        </div>
                        <Button
                          variant={isCurrent ? "secondary" : "primary"}
                          disabled={isCurrent || changingPlan}
                          onClick={() => handlePlanChange(planCode)}
                          className="ml-4"
                        >
                          {buttonLabel}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {/* Past invoices table */}
        {summary?.history && summary.history.length > 0 && (
          <Card>
            <SectionTitle title="Past invoices" subtitle="Invoice history and receipts." />

            <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-4 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                <div className="col-span-5">Month</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2 text-right">Invoice ID</div>
              </div>

              {/* Table rows */}
              <div className="divide-y divide-zinc-200 bg-white dark:divide-white/10 dark:bg-zinc-950">
                {summary.history.map((invoice, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 items-center gap-4 px-4 py-4 transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/5"
                  >
                    <div className="col-span-5">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {formatMonth(invoice.month)}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <Badge
                        variant={
                          invoice.status === "draft"
                            ? "warning"
                            : invoice.status === "error" || invoice.status === "stale"
                            ? "neutral"
                            : invoice.status === "paid"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {formatInvoiceStatus(invoice.status)}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-sm font-semibold text-zinc-900 dark:text-white">
                      {formatUsd(invoice.estimated_total_due_usd)}
                    </div>
                    <div className="col-span-2 text-right">
                      {invoice.stripe_invoice_id ? (
                        <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                          {invoice.stripe_invoice_id}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </SettingsShell>
  );
}
