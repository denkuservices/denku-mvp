"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { formatUsd } from "@/lib/utils";
import Widget from "@/components/dashboard/Widget";
import { Phone, Clock, Users, Timer, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button as UIButton } from "@/components/ui/button";

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
  pricing_preview?: {
    plan_base_usd: number;
    addons_monthly_usd: number;
    usage_overage_so_far_usd: number;
    estimated_monthly_total_usd: number;
    is_preview: boolean;
    invoice_state: "fresh" | "stale" | "none";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const returnTo = searchParams.get("return_to");
  const isOnboardingFlow = intent === "choose_plan" && returnTo === "/onboarding";

  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [changingPlan, setChangingPlan] = React.useState(false);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);
  const [updatingAddon, setUpdatingAddon] = React.useState<string | null>(null);
  
  // Ref for upgrade plan section scroll/focus
  const upgradePlanRef = React.useRef<HTMLDivElement>(null);

  // Confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"plan" | "addon" | null>(null);
  const [confirmData, setConfirmData] = React.useState<{
    planCode?: string;
    addonKey?: string;
    newQty?: number;
    currentQty?: number;
    addonLabel?: string;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

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

  // Check for onboarding return flag after plan change
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const returnTo = sessionStorage.getItem("onboarding_return_to");
      if (returnTo && summary?.plans && summary.plans.length > 0) {
        // Check if user now has a plan
        const hasPlan = summary.plans.some((p) => p.plan_code === (summary as any).plan_limits?.plan_code);
        if (hasPlan) {
          // Clear flag and redirect
          sessionStorage.removeItem("onboarding_return_to");
          window.location.href = returnTo;
        }
      }
    }
  }, [summary]);

  React.useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Scroll to upgrade plan section if intent=choose_plan
  React.useEffect(() => {
    if (isOnboardingFlow && upgradePlanRef.current && !loading && summary) {
      // Small delay to ensure page is rendered
      setTimeout(() => {
        upgradePlanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [isOnboardingFlow, loading, summary]);

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

  // Handle plan change - open confirmation dialog
  const handlePlanChange = (planCode: string) => {
    setConfirmAction("plan");
    setConfirmData({ planCode });
    setConfirmError(null);
    setConfirmDialogOpen(true);
  };

  // Execute plan change (called from dialog)
  const executePlanChange = async (planCode: string) => {
    try {
      setConfirmLoading(true);
      setConfirmError(null);
      const res = await fetch("/api/billing/plan/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: planCode }),
      });
      const data = await res.json();
      if (data.ok) {
        // Close dialog and refresh summary
        setConfirmDialogOpen(false);
        await fetchSummary();
      } else {
        setConfirmError(data.error || "Failed to change plan");
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setConfirmLoading(false);
    }
  };

  // Handle addon update - open confirmation dialog
  const handleAddonUpdate = (addonKey: string, newQty: number) => {
    const addon = summary?.addons?.available.find((a) => a.key === addonKey);
    const currentQty = summary?.addons?.active[addonKey as "extra_concurrency" | "extra_phone"] || 0;
    setConfirmAction("addon");
    setConfirmData({
      addonKey,
      newQty,
      currentQty,
      addonLabel: addon?.label || addonKey,
    });
    setConfirmError(null);
    setConfirmDialogOpen(true);
  };

  // Execute addon update (called from dialog)
  const executeAddonUpdate = async (addonKey: string, newQty: number) => {
    try {
      setConfirmLoading(true);
      setConfirmError(null);
      const res = await fetch("/api/billing/addons/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_key: addonKey, qty: newQty }),
      });
      const data = await res.json();
      if (data.ok) {
        // Close dialog and refresh summary
        setConfirmDialogOpen(false);
        await fetchSummary();
      } else {
        setConfirmError(data.error || "Failed to update add-on");
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setConfirmLoading(false);
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
        {/* Onboarding flow banner */}
        {isOnboardingFlow && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900/30 dark:bg-brand-950/50">
            <div className="flex items-start gap-3">
              <ArrowLeft className="h-5 w-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                  Complete your plan purchase, then return to finish setup.
                </p>
              </div>
              <UIButton
                variant="outline"
                onClick={() => router.push(returnTo || "/onboarding")}
                className="flex-shrink-0"
              >
                Return to setup
              </UIButton>
            </div>
          </div>
        )}

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

        {/* Usage KPI cards - matching dashboard style */}
        {summary?.preview && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-4">
            <Widget
              icon={<Phone className="h-7 w-7" />}
              title="Calls"
              subtitle={(summary.preview.total_calls || 0).toLocaleString()}
            />
            <Widget
              icon={<Clock className="h-7 w-7" />}
              title="Minutes"
              subtitle={(summary.preview.billable_minutes || 0).toLocaleString()}
            />
            <Widget
              icon={<Users className="h-7 w-7" />}
              title="Peak concurrency"
              subtitle={
                summary.preview.peak_concurrent_calls !== null && summary.preview.peak_concurrent_calls !== undefined
                  ? summary.preview.peak_concurrent_calls.toString()
                  : "—"
              }
            />
            {(() => {
              const totalCalls = summary.preview.total_calls || 0;
              const totalMinutes = summary.preview.billable_minutes || 0;
              let avgDuration = "—";
              if (totalCalls > 0 && totalMinutes > 0) {
                const avgMinutes = totalMinutes / totalCalls;
                const minutes = Math.floor(avgMinutes);
                const seconds = Math.round((avgMinutes - minutes) * 60);
                if (minutes > 0) {
                  avgDuration = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} min`;
                } else {
                  avgDuration = `${seconds}s`;
                }
              }
              return (
                <Widget
                  icon={<Timer className="h-7 w-7" />}
                  title="Avg call duration"
                  subtitle={avgDuration}
                />
              );
            })()}
          </div>
        )}

        {/* Row 1: Overage (left, ~65%) | Upgrade plan (right, ~35%) */}
        <div className="grid grid-cols-12 gap-6 items-start">
          <div className="col-span-12 lg:col-span-8 min-w-0 max-w-full overflow-hidden">
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
                        label="Remaining to cap"
                        value={formatUsd(summary.overage.remaining_to_cap_usd)}
                      />
                      <UsageStat
                        label="Hard cap"
                        value={formatUsd(summary.overage.hard_cap_usd)}
                      />
                    </div>

                    {/* Progress bar */}
                    {(() => {
                      const progressPercent = summary.overage.hard_cap_usd > 0
                        ? Math.min(
                            Math.round(
                              (summary.overage.current_overage_usd / summary.overage.hard_cap_usd) * 100
                            ),
                            100
                          )
                        : 0;
                      const hasProgress = progressPercent > 0;
                      
                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            <span>Progress to cap</span>
                            <span>{summary.overage.hard_cap_usd > 0 ? `${progressPercent}%` : "—"}</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                            <div
                              className={`h-full transition-all ${
                                hasProgress
                                  ? "bg-amber-500 dark:bg-amber-500"
                                  : "bg-brand-500 dark:bg-brand-500"
                              }`}
                              style={{
                                width: `${progressPercent}%`,
                              }}
                            />
                          </div>
                          {summary.overage.status === "ok" && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                              Auto-collect triggers every $100 of overage.
                            </p>
                          )}
                          {(summary.overage.status === "paused_hard_cap" ||
                            summary.overage.status === "paused_past_due" ||
                            summary.overage.status === "collecting") && (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-white/10 dark:bg-white/5">
                              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                {summary.overage.status === "paused_hard_cap"
                                  ? "Service paused due to hard cap. Payment required to resume."
                                  : summary.overage.status === "paused_past_due"
                                  ? "Service paused due to payment failure. Payment required to resume."
                                  : "Overage threshold reached. Collection in progress."}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </Card>
            )}
          </div>

          <div className="col-span-12 lg:col-span-4 min-w-0 max-w-full overflow-hidden">
            {/* Upgrade plan card */}
            <div ref={upgradePlanRef}>
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
        </div>

        {/* Row 2: Add-ons (left) | Estimated monthly total (middle) | Current plan (right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Add-ons card - compact */}
          {summary?.addons && (
            <Card className="p-4">
              <SectionTitle title="Add-ons" subtitle="Extra capacity beyond your plan." />
              <div className="mt-3 space-y-2.5">
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
                                Billing pause active — increase disabled until payment is resolved.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                if (currentQty > 0) {
                                  handleAddonUpdate(addon.key, Math.max(0, currentQty - addon.step));
                                }
                              }}
                              disabled={currentQty === 0 || isUpdating}
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

          {/* Estimated Monthly Total (Preview) card - compact */}
          {summary?.pricing_preview && (
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <SectionTitle
                  title="Estimated monthly total"
                  subtitle="Preview — final invoice is calculated at month close."
                />
                {summary.pricing_preview.invoice_state === "stale" && (
                  <Badge variant="warning">Updating</Badge>
                )}
              </div>
              <div className="mt-3 space-y-2.5">
                  {/* Big total */}
                  <div>
                    <div className="text-3xl font-bold text-zinc-900 dark:text-white">
                      {formatUsd(summary.pricing_preview.estimated_monthly_total_usd)}
                    </div>
                  </div>
                  
                  {/* Breakdown */}
                  <div className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-white/10">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">Plan</span>
                      <span className="font-medium text-zinc-900 dark:text-white">
                        {formatUsd(summary.pricing_preview.plan_base_usd)}
                      </span>
                    </div>
                    {summary.pricing_preview.addons_monthly_usd > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">Add-ons</span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          +{formatUsd(summary.pricing_preview.addons_monthly_usd)}/mo
                        </span>
                      </div>
                    )}
                    {summary.pricing_preview.usage_overage_so_far_usd > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">Usage so far</span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          +{formatUsd(summary.pricing_preview.usage_overage_so_far_usd)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Invoice status line if finalized/pending */}
                  {invoiceRun?.stripe_invoice_id && (
                    <div className="mt-4 flex items-center gap-2 border-t border-zinc-200 pt-4 dark:border-white/10">
                      <Badge variant={invoiceRun.status === "paid" ? "success" : "warning"}>
                        {formatInvoiceStatus(invoiceRun.status)}
                      </Badge>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {invoiceRun.stripe_invoice_id}
                      </span>
                    </div>
                  )}
              </div>
            </Card>
          )}

          {/* Current plan card - de-emphasized */}
          <Card className="border-zinc-200/80 dark:border-white/5">
            <SectionTitle title="Current plan" subtitle="Your subscription and plan settings." />

              {currentPlan ? (
                <div className="mt-3 rounded-xl border border-zinc-200/60 bg-zinc-50/30 p-3.5 dark:border-white/5 dark:bg-white/3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                          {currentPlan.display_name}
                        </h3>
                        <Badge variant="success">Active</Badge>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-semibold text-zinc-900 dark:text-white">
                          {formatUsd(currentPlan.monthly_fee_usd)}
                        </span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">/month</span>
                      </div>
                    </div>
                  </div>

                  {/* Plan features - compact */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <svg className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {currentPlan.concurrency_limit} concurrent · {currentPlan.included_minutes.toLocaleString()} min · {formatUsd(currentPlan.overage_rate_usd_per_min)}/min overage
                    </div>
                    {currentPlan.included_phone_numbers > 0 && (
                      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                        <svg className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {currentPlan.included_phone_numbers} phone number{currentPlan.included_phone_numbers !== 1 ? "s" : ""} included
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                  Plan information not available
                </div>
              )}
            </Card>
        </div>

        {/* Row 3: Past invoices (full width) */}
        {summary?.history && summary.history.length > 0 && (() => {
          const hasAnyInvoiceId = summary.history.some((inv) => inv.stripe_invoice_id);
          const isSingleRow = summary.history.length === 1;
          
          return (
            <Card>
              <SectionTitle title="Past invoices" subtitle="Invoice history and receipts." />

              <div className={`mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 ${isSingleRow ? '' : ''}`}>
                {/* Table header */}
                <div className={`grid grid-cols-12 gap-4 bg-zinc-50 px-4 text-xs font-semibold text-zinc-600 dark:bg-white/5 dark:text-zinc-400 ${isSingleRow ? 'py-2.5' : 'py-3'}`}>
                  <div className="col-span-5">Month</div>
                  <div className={hasAnyInvoiceId ? "col-span-3" : "col-span-5"}>Status</div>
                  <div className={hasAnyInvoiceId ? "col-span-2" : "col-span-2"}>Amount</div>
                  {hasAnyInvoiceId && (
                    <div className="col-span-2 text-right">Invoice ID</div>
                  )}
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
                      <div className={hasAnyInvoiceId ? "col-span-3" : "col-span-5"}>
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
                      {hasAnyInvoiceId && (
                        <div className="col-span-2 text-right">
                          {invoice.stripe_invoice_id ? (
                            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                              {invoice.stripe_invoice_id}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })()}
        </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={(open) => {
        if (!confirmLoading) {
          setConfirmDialogOpen(open);
          if (!open) {
            setConfirmError(null);
            setConfirmAction(null);
            setConfirmData(null);
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction === "plan" ? "Confirm plan change" : "Confirm changes"}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-muted-foreground text-sm">
                {confirmAction === "plan" && confirmData?.planCode && (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      Plan:{" "}
                      <span className="font-semibold">
                        {summary?.plans.find((p) => p.plan_code === currentPlanCode)?.display_name || currentPlanCode}
                      </span>{" "}
                      →{" "}
                      <span className="font-semibold">
                        {summary?.plans.find((p) => p.plan_code === confirmData.planCode)?.display_name || confirmData.planCode}
                      </span>
                    </div>
                    {(() => {
                      const newPlan = summary?.plans.find((p) => p.plan_code === confirmData.planCode);
                      const newPlanPrice = newPlan?.monthly_fee_usd || 0;
                      
                      return (
                        <>
                          <div className="text-lg font-semibold text-zinc-900 dark:text-white">
                            New plan price: {formatUsd(newPlanPrice)}/month
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Usage and add-ons are billed separately.
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {confirmAction === "addon" && confirmData && (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold">{confirmData.addonLabel}</span>: {confirmData.currentQty} → {confirmData.newQty}
                    </div>
                    {(() => {
                      const addon = summary?.addons?.available.find((a) => a.key === confirmData.addonKey);
                      const qtyDelta = (confirmData.newQty || 0) - (confirmData.currentQty || 0);
                      const priceImpact = (addon?.price_usd_month || 0) * qtyDelta;
                      const benefitLine = confirmData.addonKey === "extra_phone"
                        ? "Add an additional inbound number to your workspace."
                        : confirmData.addonKey === "extra_concurrency"
                        ? "Handle more simultaneous calls without busy signals."
                        : "";
                      
                      return (
                        <>
                          <div className="text-lg font-semibold text-zinc-900 dark:text-white">
                            {priceImpact > 0 ? `+${formatUsd(priceImpact)}/mo` : formatUsd(Math.abs(priceImpact))}
                          </div>
                          {benefitLine && (
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                              {benefitLine}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {confirmError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/50">
              <p className="text-sm text-red-700 dark:text-red-400">{confirmError}</p>
            </div>
          )}
          <DialogFooter>
            <UIButton
              variant="secondary"
              onClick={() => {
                if (!confirmLoading) {
                  setConfirmDialogOpen(false);
                  setConfirmError(null);
                }
              }}
              disabled={confirmLoading}
            >
              Cancel
            </UIButton>
            <UIButton
              onClick={() => {
                if (confirmAction === "plan" && confirmData?.planCode) {
                  executePlanChange(confirmData.planCode);
                } else if (confirmAction === "addon" && confirmData?.addonKey && confirmData?.newQty !== undefined) {
                  executeAddonUpdate(confirmData.addonKey, confirmData.newQty);
                }
              }}
              disabled={confirmLoading}
            >
              {confirmLoading ? "Confirming..." : "Confirm"}
            </UIButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
