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
  plans: Array<{
    plan_code: string;
    display_name: string;
    monthly_fee_usd: number;
    included_minutes: number;
    overage_rate_usd_per_min: number;
    concurrency_limit: number;
    included_phone_numbers: number;
  }>;
  history: Array<{
    month: string;
    status: string | null;
    stripe_invoice_id: string | null;
    estimated_total_due_usd: number | null;
  }>;
  billing_status: string;
  paused_reason: string | null;
  paused_at: string | null;
  workspace_status?: string;
  overage?: {
    current_overage_usd: number;
    threshold_step_usd: number;
    next_collect_at_usd: number;
    hard_cap_usd: number;
    remaining_to_cap_usd: number;
    is_at_or_over_cap: boolean;
    last_collect_attempt_at: string | null;
    status: "ok" | "collecting" | "paused_hard_cap" | "paused_past_due";
  };
  addons?: {
    available: Array<{
      key: string;
      label: string;
      unit: string;
      price_usd_month: number;
      step: number;
    }>;
    active: {
      extra_concurrency: number;
      extra_phone: number;
    };
    effective_limits: {
      max_concurrent_calls: number;
      included_phones: number;
    };
  };
};

// Plan order map for comparison
const PLAN_ORDER: Record<string, number> = {
  starter: 1,
  growth: 2,
  scale: 3,
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
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);
  const [updatingAddon, setUpdatingAddon] = React.useState<string | null>(null);

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

  // Handle portal redirect
  const handlePortalRedirect = React.useCallback(async () => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      const res = await fetch("/api/billing/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to create portal session" }));
        throw new Error(data.error || "Failed to create portal session");
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setPortalError(errorMsg);
      setPortalLoading(false);
    }
  }, []);

  // Handle plan change
  const handlePlanChange = async (planCode: string) => {
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

  // Handle addon update
  const handleAddonUpdate = async (addonKey: string, newQty: number) => {
    try {
      setUpdatingAddon(addonKey);
      const res = await fetch("/api/billing/addons/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_key: addonKey, qty: newQty }),
      });
      const data = await res.json();
      if (data.ok) {
        // Refetch summary to refresh UI
        await fetchSummary();
      } else {
        alert(data.error || "Failed to update add-on");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setUpdatingAddon(null);
    }
  };

  // Get current plan code (from preview, fallback to 'starter')
  const currentPlanCode = summary?.preview?.plan_code || "starter";
  
  // Find current plan object from summary.plans
  const currentPlan = summary?.plans?.find((p) => p.plan_code === currentPlanCode) || null;
  
  // Get current plan order
  const currentPlanOrder = PLAN_ORDER[currentPlanCode] || 0;

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
  const plansRaw = summary?.plans || [];

  // Sort plans client-side as safety net: starter, growth, scale
  const plans = [...plansRaw].sort((a, b) => {
    const orderA = PLAN_ORDER[a.plan_code] || 999;
    const orderB = PLAN_ORDER[b.plan_code] || 999;
    return orderA - orderB;
  });

  // If plans array is empty, show empty state
  if (plans.length === 0) {
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">No plans available</p>
            <Button variant="primary" onClick={fetchSummary}>
              Retry
            </Button>
          </div>
        </Card>
      </SettingsShell>
    );
  }

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
        {/* Billing status banner */}
        {summary && summary.billing_status !== "active" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/50">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {summary.billing_status === "past_due"
                    ? "Payment failed"
                    : summary.billing_status === "paused"
                    ? "Usage cap reached"
                    : "Billing issue"}
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {summary.paused_reason || "Update payment method to resume."}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handlePortalRedirect}
                disabled={portalLoading}
                className="flex-shrink-0"
              >
                {portalLoading ? "Loading..." : "Update payment"}
              </Button>
            </div>
          </div>
        )}

        {/* Portal CTA */}
        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            onClick={handlePortalRedirect}
            disabled={portalLoading}
          >
            {portalLoading ? "Loading..." : "Manage payment & invoices"}
          </Button>
        </div>

        {/* Portal error alert */}
        {portalError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/50">
            <p className="text-sm text-red-700 dark:text-red-400">
              {portalError}
            </p>
          </div>
        )}

        {/* Main grid: 2/3 left, 1/3 right */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: Current plan + Usage + Estimated invoice (spans 2 columns) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Overage card */}
            {summary?.overage && (
              <Card>
                <SectionTitle title="Overage" subtitle="Current month usage overage." />
                <div className="mt-6 space-y-6">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <UsageStat
                      label="Current overage"
                      value={formatUsd(summary.overage.current_overage_usd)}
                    />
                    <UsageStat
                      label="Next auto-collect at"
                      value={formatUsd(summary.overage.next_collect_at_usd)}
                    />
                    <UsageStat
                      label="Hard cap"
                      value={formatUsd(summary.overage.hard_cap_usd)}
                    />
                    <UsageStat
                      label="Remaining to cap"
                      value={formatUsd(summary.overage.remaining_to_cap_usd)}
                    />
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      <span>Progress to cap</span>
                      <span>
                        {summary.overage.hard_cap_usd > 0
                          ? `${Math.min(
                              Math.round(
                                (summary.overage.current_overage_usd /
                                  summary.overage.hard_cap_usd) *
                                  100
                              ),
                              100
                            )}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                      <div
                        className="h-full bg-brand-500 transition-all"
                        style={{
                          width: `${
                            summary.overage.hard_cap_usd > 0
                              ? `${Math.min(
                                  Math.round(
                                    (summary.overage.current_overage_usd /
                                      summary.overage.hard_cap_usd) *
                                      100
                                  ),
                                  100
                                )}%`
                              : "0%"
                          }`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Status message */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {summary.overage.status === "ok"
                        ? "Auto-collect triggers every $100 of overage."
                        : summary.overage.status === "paused_hard_cap"
                        ? "Service paused due to hard cap. Payment required to resume."
                        : summary.overage.status === "paused_past_due"
                        ? "Service paused due to payment failure. Payment required to resume."
                        : summary.overage.status === "collecting"
                        ? "Overage threshold reached. Collection in progress."
                        : "Auto-collect triggers every $100 of overage."}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Current plan card */}
            <Card>
              <SectionTitle title="Current plan" subtitle="Your subscription and plan settings." />

              {currentPlan ? (
                <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                          {currentPlan.display_name}
                        </h3>
                        <Badge variant="success">Active</Badge>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold text-zinc-900 dark:text-white">
                          {formatUsd(currentPlan.monthly_fee_usd)}
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
                        {currentPlan.concurrency_limit} concurrent calls
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
                        {currentPlan.included_minutes.toLocaleString()} minutes included
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
                        {formatUsd(currentPlan.overage_rate_usd_per_min)}/min overage
                      </li>
                      {currentPlan.included_phone_numbers > 0 && (
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
                          {currentPlan.included_phone_numbers} phone number{currentPlan.included_phone_numbers !== 1 ? "s" : ""} included
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                  Plan information not available
                </div>
              )}
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
                  hint={currentPlan?.included_minutes !== null && currentPlan?.included_minutes !== undefined ? `Included: ${currentPlan.included_minutes.toLocaleString()}` : undefined}
                />
                <UsageStat
                  label="Peak concurrent"
                  value={(preview?.peak_concurrent_calls || 0).toString()}
                  hint={summary?.addons?.effective_limits?.max_concurrent_calls ? `Limit: ${summary.addons.effective_limits.max_concurrent_calls}` : planLimits?.concurrency_limit ? `Limit: ${planLimits.concurrency_limit}` : undefined}
                />
              </div>
            </Card>

            {/* Add-ons card */}
            {summary?.addons && (
              <Card>
                <SectionTitle title="Add-ons" subtitle="Extra capacity beyond your plan." />
                <div className="mt-6 space-y-4">
                  {summary.addons.available
                    .filter((addon) => addon.key === "extra_concurrency" || addon.key === "extra_phone")
                    .map((addon) => {
                      const currentQty = summary.addons?.active[addon.key as "extra_concurrency" | "extra_phone"] || 0;
                      const monthlyPrice = currentQty * addon.price_usd_month;
                      const isBillingPaused = summary.billing_status !== "active";
                      const isUpdating = updatingAddon === addon.key;

                      return (
                        <div
                          key={addon.key}
                          className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                {addon.label}
                              </p>
                              {monthlyPrice > 0 && (
                                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                  +{formatUsd(monthlyPrice)}/mo
                                </p>
                              )}
                              {isBillingPaused && (
                                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                  Payment required to modify add-ons.
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  if (!isBillingPaused && currentQty > 0) {
                                    handleAddonUpdate(addon.key, Math.max(0, currentQty - addon.step));
                                  }
                                }}
                                disabled={isBillingPaused || currentQty === 0 || isUpdating}
                                className="h-8 w-8 rounded-lg p-0 text-lg font-semibold"
                              >
                                −
                              </Button>
                              <span className="min-w-[3rem] text-center text-sm font-semibold text-zinc-900 dark:text-white">
                                {currentQty}
                              </span>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  if (!isBillingPaused) {
                                    handleAddonUpdate(addon.key, currentQty + addon.step);
                                  }
                                }}
                                disabled={isBillingPaused || isUpdating}
                                className="h-8 w-8 rounded-lg p-0 text-lg font-semibold"
                              >
                                +
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </Card>
            )}

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
                    {formatUsd(preview?.monthly_fee_usd ?? currentPlan?.monthly_fee_usd ?? null)}
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
                      {formatUsd(preview?.estimated_total_due_usd ?? preview?.monthly_fee_usd ?? currentPlan?.monthly_fee_usd ?? null)}
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
                {plans.map((plan) => {
                  const isCurrent = plan.plan_code === currentPlanCode;
                  const targetPlanOrder = PLAN_ORDER[plan.plan_code] || 0;
                  
                  // Determine button label based on plan order
                  let buttonLabel = "Current";
                  if (!isCurrent) {
                    if (targetPlanOrder > currentPlanOrder) {
                      buttonLabel = "Upgrade";
                    } else if (targetPlanOrder < currentPlanOrder) {
                      buttonLabel = "Switch plan";
                    }
                  }
                  
                  // Build subtitle: "X concurrent · Y min" (using plan data from DB)
                  const subtitle = `${plan.concurrency_limit} concurrent · ${plan.included_minutes.toLocaleString()} min`;
                  
                  return (
                    <div
                      key={plan.plan_code}
                      className={cn(
                        "rounded-xl border p-4",
                        isCurrent
                          ? "border-brand-500 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-500/10"
                          : "border-zinc-200 bg-zinc-50/50 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {plan.display_name}
                          </h4>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                            {subtitle}
                          </p>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {formatUsd(plan.monthly_fee_usd)}/month
                          </p>
                        </div>
                        <Button
                          variant={isCurrent ? "secondary" : "primary"}
                          disabled={isCurrent || changingPlan}
                          onClick={() => handlePlanChange(plan.plan_code)}
                          className="ml-4 flex-shrink-0"
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
