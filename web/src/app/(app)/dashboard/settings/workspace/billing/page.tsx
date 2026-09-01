"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Gauge,
  Hash,
  Layers,
  Loader2,
  Lock,
  MessagesSquare,
  Minus,
  Phone,
  PhoneCall,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { isChatAddonKey, isOfferablePlanCode } from "@/lib/billing/chatPlanKeys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/app/(app)/dashboard/_platform/ui";
import {
  Meter,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  SettingsHero,
  SettingsSection,
  StatTile,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";

// API response types
type BillingSummary = {
  ok: boolean;
  org_id: string;
  /**
   * Whether the person reading this may CHANGE the bill, as opposed to see it. Sent by
   * /api/billing/summary rather than inferred here — the browser has no trustworthy way to know a
   * role, and the mutating routes enforce the same capability regardless of what this page renders.
   */
  can_manage_billing?: boolean;
  viewer_role?: "owner" | "admin" | "viewer" | null;
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
    /** Every key in `billing_addon_catalog`, not just the two voice ones — the summary
     *  route fills a quantity for all of them, including the chat tiers. */
    active: Record<string, number>;
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

/** A glyph per add-on, so two steppers aren't distinguishable only by their label. */
const ADDON_ICONS: Record<string, typeof Phone> = {
  extra_concurrency: Users,
  extra_phone: Phone,
};

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

/** Invoice status → pill tone. Paid is the only success; anything unresolved reads as warning. */
function invoiceTone(status: string | null): "ok" | "warn" | "critical" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return "ok";
  if (s === "open" || s === "draft") return "warn";
  if (s === "uncollectible" || s === "error") return "critical";
  return "neutral";
}

/** One line of a plan's contents. */
function PlanFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300">
        <Check aria-hidden="true" className="h-3 w-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Horizon-style monthly allowance summary. The figures still come from the invoice preview. */
function UsageOverview({
  usedMinutes,
  includedMinutes,
  planName,
  month,
}: {
  usedMinutes: number;
  includedMinutes: number;
  planName: string;
  month: string;
}) {
  const rawPercent = includedMinutes > 0 ? (usedMinutes / includedMinutes) * 100 : 0;
  const displayPercent = Math.round(rawPercent * 10) / 10;
  const visiblePercent = Math.min(rawPercent, 100);
  const remainingMinutes = Math.max(includedMinutes - usedMinutes, 0);
  const overageMinutes = Math.max(usedMinutes - includedMinutes, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <Panel className="relative min-h-[290px] overflow-hidden !border-0 !bg-navy-700 bg-gradient-to-br from-navy-700 via-[#282264] to-brand-500 text-white shadow-xl dark:!bg-navy-800 dark:from-navy-800 dark:via-[#211d50] dark:to-brand-700">
      <div aria-hidden="true" className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-24 left-20 h-48 w-48 rounded-full bg-sky-300/10 blur-3xl" />

      <div className="relative flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Monthly allowance</p>
            <h3 className="mt-1 text-xl font-semibold">Voice usage</h3>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {planName} · {month}
          </span>
        </div>

        <div className="mt-3 grid flex-1 grid-cols-1 items-center gap-5 sm:grid-cols-[164px_1fr]">
          <div
            role="progressbar"
            aria-valuenow={displayPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Included voice minutes used"
            className="relative mx-auto h-40 w-40 sm:mx-0"
          >
            <svg viewBox="0 0 136 136" className="h-full w-full -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="billing-usage-progress" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#8ee7ff" />
                </linearGradient>
              </defs>
              <circle cx="68" cy="68" r={radius} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="11" />
              <circle
                cx="68"
                cy="68"
                r={radius}
                fill="none"
                stroke="url(#billing-usage-progress)"
                strokeLinecap="round"
                strokeWidth="11"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - visiblePercent / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-semibold tabular-nums">{displayPercent}%</span>
              <span className="text-xs text-white/55">of plan used</span>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-sm text-white/60">Billable minutes</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {usedMinutes.toLocaleString()}
              <span className="ml-2 text-sm font-normal text-white/55">
                of {includedMinutes.toLocaleString()} min
              </span>
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/50">Remaining</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{remainingMinutes.toLocaleString()} min</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-wide text-white/50">Overage</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${overageMinutes > 0 ? "text-amber-200" : ""}`}>
                  {overageMinutes.toLocaleString()} min
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Billing & usage.
 *
 * **What the visual pass changed, beyond skin.**
 *
 * 1. **Usage got a shape.** The one question a customer opens this page with is "how much of what
 *    I pay for have I used", and the page answered it with four flat counters — or, when the
 *    month's preview row didn't exist yet, with nothing at all, silently, so the section
 *    advertised in the nav as "Billing & usage" showed no usage whatsoever. Minutes are now drawn
 *    against the plan's included minutes as a meter that changes tone as it fills, and a month with
 *    no calls says so instead of vanishing.
 * 2. **Plans became cards you can compare.** Three plans were stacked in a narrow right-hand
 *    column as name/price/button rows, so choosing between them meant reading. They are a
 *    three-across grid listing what each one actually contains.
 * 3. **One visual language.** This page was written in `zinc` with its own local `Button`, `Card`
 *    and `Badge`, while the two pages either side of it in the settings rail used `gray`/`navy`
 *    Horizon components — visibly a different product. It renders through the shared settings kit
 *    now, and the second header (a gradient card carrying a four-level breadcrumb, under a nav
 *    rail that already said where you were) is gone.
 *
 * Every fetch, handler and state transition below is unchanged: this is money, and the failure
 * mode of a redesign that quietly alters a Stripe call is not a visual one.
 */
/**
 * A Stripe invoice id, shown the way a reference number is shown rather than the way a database
 * key is.
 *
 * `in_1PxyzABCdefGHIjkLMNopqrs` in full, in monospace, under the month is the internal id of a
 * record in someone else's system: nobody reading their own billing history has ever needed all
 * 27 characters, and printing them makes the row look like debug output. The last six are enough
 * to quote to support, which is the only reason a customer touches this string at all — and the
 * full value stays available on hover and to a screen reader.
 */
function InvoiceReference({ id }: { id: string }) {
  const tail = id.length > 8 ? id.slice(-6) : id;
  return (
    <span className="font-mono text-xs text-gray-500" title={id}>
      <span className="sr-only">Invoice reference {id}</span>
      <span aria-hidden="true">Ref ·{tail}</span>
    </span>
  );
}

export default function WorkspaceBillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const returnTo = searchParams.get("return_to");
  const isOnboardingFlow = intent === "choose_plan" && returnTo === "/onboarding";

  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  // Defaults to false while the summary is loading, so no control flashes into existence for
  // someone who is not allowed to use it.
  const canManageBilling = summary?.can_manage_billing ?? false;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);
  const [updatingAddon, setUpdatingAddon] = React.useState<string | null>(null);

  // Checkout sync state
  const [checkoutSyncing, setCheckoutSyncing] = React.useState(false);
  const [checkoutSyncMessage, setCheckoutSyncMessage] = React.useState<string | null>(null);
  const [checkoutSyncError, setCheckoutSyncError] = React.useState<string | null>(null);

  // Ref for upgrade plan section scroll/focus
  const upgradePlanRef = React.useRef<HTMLDivElement>(null);

  // State for highlighting plan selection card
  const [highlightPlans, setHighlightPlans] = React.useState(false);

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
        // `summary` is narrowed non-null by the guard above, so the `as any` this line carried
        // (and the lint error with it) was never buying anything.
        const hasPlan = summary.plans.some(
          (p) => p.plan_code === summary.plan_limits?.plan_code
        );
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

  // Handle checkout return from Stripe
  React.useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkout === "success" && sessionId) {
      // Sync plan activation before refreshing summary (same logic as webhook)
      const syncCheckout = async () => {
        try {
          setCheckoutSyncing(true);
          setCheckoutSyncMessage("Activating your plan…");
          setCheckoutSyncError(null);

          // Call sync-checkout API (replicates webhook logic)
          const res = await fetch("/api/billing/stripe/sync-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          });

          const data = await res.json();

          if (data.ok) {
            setCheckoutSyncMessage("Plan activated successfully");
            // Refresh summary to show updated plan
            await fetchSummary();
            // Clear sync message after a delay
            setTimeout(() => {
              setCheckoutSyncMessage(null);
            }, 3000);
          } else {
            // Sync failed - still try to refresh summary in case webhook already processed it
            setCheckoutSyncError(data.error || "Failed to sync plan");
            await fetchSummary();
            setTimeout(() => {
              setCheckoutSyncError(null);
            }, 5000);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to sync plan";
          setCheckoutSyncError(errorMsg);
          // Still try to refresh summary in case webhook already processed it
          await fetchSummary();
          setTimeout(() => {
            setCheckoutSyncError(null);
          }, 5000);
        } finally {
          setCheckoutSyncing(false);
        }
      };

      syncCheckout();

      // Clear query params to avoid re-processing on refresh
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("checkout");
      newUrl.searchParams.delete("session_id");
      router.replace(newUrl.pathname + newUrl.search);
    } else if (checkout === "cancel") {
      // Just clear query params for cancel
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("checkout");
      newUrl.searchParams.delete("session_id");
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, router, fetchSummary]);

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

      // Prevent portal redirect in preview mode
      const currentPlanCode = summary?.plan_limits?.plan_code ?? null;
      const hasActivePlan = Boolean(currentPlanCode);
      if (!hasActivePlan) {
        setPortalError("Available after you choose a plan");
        setPortalLoading(false);
        return;
      }

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
  }, [summary]);

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

      // Derive plan state from current summary
      const currentPlanCode = summary?.plan_limits?.plan_code ?? null;
      const hasActivePlan = Boolean(currentPlanCode);

      // If no plan exists (preview mode), use Stripe checkout flow
      if (!hasActivePlan) {
        const res = await fetch("/api/billing/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_code: planCode,
            return_to: "/dashboard/settings/workspace/billing",
          }),
        });
        const data = await res.json();
        if (data.ok && data.url) {
          // Close dialog and redirect to Stripe Checkout
          setConfirmDialogOpen(false);
          window.location.href = data.url;
        } else {
          setConfirmError(data.error || "Failed to start checkout");
        }
        return;
      }

      // If plan exists (paid user), use plan change endpoint
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

  // Get current plan code from plan_limits (org_plan_limits) - explicitly nullable, no fallback
  const currentPlanCode = summary?.plan_limits?.plan_code ?? null;

  // Derive plan state
  const hasPlan = Boolean(currentPlanCode);

  // The chat tiers, straight from the catalogue. They are alternatives, not quantities, so
  // they are drawn as their own section rather than as steppers in the add-ons grid — which
  // is also why the grid above filters itself down to the two per-piece add-ons.
  const chatTiers = (summary?.addons?.available ?? []).filter((a) => isChatAddonKey(a.key));

  // Find current plan object from summary.plans (only if plan exists)
  const currentPlan = hasPlan
    ? summary?.plans?.find((p) => p.plan_code === currentPlanCode) || null
    : null;

  // Get current plan order (0 if no plan)
  const currentPlanOrder = hasPlan ? PLAN_ORDER[currentPlanCode!] || 0 : 0;

  /** The header, shared by every state so loading and error don't lose the page's identity. */
  const hero = (
    <SettingsHero
      icon={CreditCard}
      title="Billing & usage"
      subtitle="Your plan, what you've used this month, and every invoice."
      pills={
        <>
          {/* Only claim a plan state once the summary has actually arrived — while loading,
              `hasPlan` is false, and a header that says "No plan" to a paying customer for the
              second the fetch takes is worse than a header that says nothing. */}
          {summary ? (
            <StatusPill tone={hasPlan ? "brand" : "warn"} icon={Layers}>
              {currentPlan?.display_name ?? (hasPlan ? currentPlanCode : "No plan")}
            </StatusPill>
          ) : null}
          {summary ? (
            <StatusPill tone={summary.billing_status === "active" ? "ok" : "critical"} dot>
              {summary.billing_status === "active"
                ? "Billing active"
                : formatInvoiceStatus(summary.billing_status)}
            </StatusPill>
          ) : null}
          {summary?.month ? (
            <StatusPill tone="neutral" icon={Clock}>
              {formatMonth(summary.month)}
            </StatusPill>
          ) : null}
        </>
      }
      action={
        <SettingsButton
          type="button"
          variant="primary"
          onClick={handlePortalRedirect}
          disabled={portalLoading || !hasPlan || !canManageBilling}
          title={
            !canManageBilling
              ? "Only owners and admins can manage billing"
              : !hasPlan
                ? "Available after you choose a plan"
                : undefined
          }
        >
          {portalLoading ? <Loader2 className="animate-spin" /> : <Wallet />}
          {portalLoading ? "Opening…" : "Payment & invoices"}
        </SettingsButton>
      }
    />
  );

  // Error state
  if (error && !summary) {
    return (
      <div className="space-y-8">
        {hero}
        <Panel>
          <EmptyState
            icon={AlertTriangle}
            title="We couldn't load your billing details"
            description={error}
          />
          <div className="flex justify-center pb-6">
            <SettingsButton type="button" variant="primary" onClick={fetchSummary}>
              <RefreshCw />
              Try again
            </SettingsButton>
          </div>
        </Panel>
      </div>
    );
  }

  // Loading state
  if (loading && !summary) {
    return (
      <div className="space-y-8">
        {hero}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-gray-200/80 bg-gray-100/70 dark:border-white/10 dark:bg-white/5"
            />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-[20px] border border-gray-200/80 bg-gray-100/70 dark:border-white/10 dark:bg-white/5" />
      </div>
    );
  }

  const preview = summary?.preview;
  const invoiceRun = summary?.invoice_run;
  const plansRaw = summary?.plans || [];

  // Sort plans client-side as safety net: starter, growth, scale.
  // `chat_only` is filtered out: it is the $0 foundation a chat-only workspace sits on, not
  // something to offer. Shown here it would be a card with zero minutes and zero numbers that
  // a voice customer could click to downgrade themselves out of their phone service. It stays
  // in `plansRaw` so the header can still resolve its display name.
  const plans = [...plansRaw].filter((p) => isOfferablePlanCode(p.plan_code)).sort((a, b) => {
    const orderA = PLAN_ORDER[a.plan_code] || 999;
    const orderB = PLAN_ORDER[b.plan_code] || 999;
    return orderA - orderB;
  });

  // If plans array is empty, show empty state
  if (plans.length === 0) {
    return (
      <div className="space-y-8">
        {hero}
        <Panel>
          <EmptyState
            icon={Layers}
            title="No plans available"
            description="We couldn't load the plan catalogue. This is usually temporary."
          />
          <div className="flex justify-center pb-6">
            <SettingsButton type="button" variant="primary" onClick={fetchSummary}>
              <RefreshCw />
              Try again
            </SettingsButton>
          </div>
        </Panel>
      </div>
    );
  }

  const includedMinutes = currentPlan?.included_minutes ?? summary?.pricing?.included_minutes ?? 0;
  const usedMinutes = preview?.billable_minutes ?? 0;
  const totalCalls = preview?.total_calls ?? 0;

  /** Average call duration, derived the same way it always was. */
  const avgDuration = (() => {
    if (!(totalCalls > 0 && usedMinutes > 0)) return "—";
    const avgMinutes = usedMinutes / totalCalls;
    const minutes = Math.floor(avgMinutes);
    const seconds = Math.round((avgMinutes - minutes) * 60);
    if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} min`;
    return `${seconds}s`;
  })();

  return (
    <div className="space-y-8">
      {hero}

      {/*
        Say why, once, at the top. A page of greyed-out buttons with no explanation reads as a
        broken page; the same page with one sentence reads as a rule. Everything below stays
        visible on purpose — knowing what the workspace costs is not a privilege.
      */}
      {summary && !canManageBilling ? (
        <Notice tone="info" icon={Lock} title="You can see the bill, not change it">
          Plan changes, add-ons and payment details are limited to owners and admins. Everything on
          this page is up to date — ask an owner if something needs changing.
        </Notice>
      ) : null}

      {/* ---------------------------------------------------------- banners */}
      {checkoutSyncing && checkoutSyncMessage ? (
        <Notice tone="info" icon={Loader2}>
          {checkoutSyncMessage}
        </Notice>
      ) : null}
      {checkoutSyncMessage && !checkoutSyncing ? (
        <Notice tone="ok" icon={CheckCircle2}>
          {checkoutSyncMessage}
        </Notice>
      ) : null}
      {checkoutSyncError ? (
        <Notice tone="critical" icon={AlertTriangle}>
          {checkoutSyncError}
        </Notice>
      ) : null}

      {isOnboardingFlow ? (
        <Notice
          tone="info"
          icon={Sparkles}
          title="Finish choosing a plan, then head back to setup."
          action={
            <SettingsButton
              type="button"
              variant="secondary"
              onClick={() => router.push(returnTo || "/onboarding")}
            >
              <ArrowLeft />
              Return to setup
            </SettingsButton>
          }
        />
      ) : null}

      {summary && summary.billing_status !== "active" ? (
        <Notice
          tone="critical"
          icon={AlertTriangle}
          title={
            summary.billing_status === "past_due"
              ? "Payment failed"
              : summary.billing_status === "paused"
                ? "Usage cap reached"
                : "Billing issue"
          }
          action={
            <SettingsButton
              type="button"
              variant="primary"
              onClick={handlePortalRedirect}
              disabled={portalLoading || !hasPlan || !canManageBilling}
              title={!hasPlan ? "Available after you choose a plan" : undefined}
            >
              {portalLoading ? <Loader2 className="animate-spin" /> : <CreditCard />}
              Update payment
            </SettingsButton>
          }
        >
          {summary.paused_reason || "Update your payment method to resume service."}
        </Notice>
      ) : null}

      {portalError ? (
        <Notice tone="critical" icon={AlertTriangle}>
          {portalError}
        </Notice>
      ) : null}

      {/* ------------------------------------------------------------ usage */}
      <SettingsSection
        id="usage"
        icon={Activity}
        title="Usage this period"
        hint={
          summary?.month
            ? `Calls, billable minutes and peak concurrency for ${formatMonth(summary.month)}.`
            : "Calls, billable minutes and peak concurrency for the current billing month."
        }
      >
        {preview ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
            <UsageOverview
              usedMinutes={usedMinutes}
              includedMinutes={includedMinutes}
              planName={currentPlan?.display_name ?? currentPlanCode ?? "Plan"}
              month={summary?.month ? formatMonth(summary.month) : "Current month"}
            />
            <Panel className="h-full">
              <div className="mb-5">
                <p className="text-base font-semibold text-navy-700 dark:text-white">Call activity</p>
                <p className="mt-1 text-xs text-gray-500">Operational usage for this billing period.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatTile icon={PhoneCall} label="Calls" value={totalCalls.toLocaleString()} />
                <StatTile icon={Clock} label="Minutes" value={usedMinutes.toLocaleString()} />
                <StatTile
                  icon={Users}
                  label="Peak concurrent"
                  value={
                    preview.peak_concurrent_calls !== null && preview.peak_concurrent_calls !== undefined
                      ? preview.peak_concurrent_calls.toString()
                      : "—"
                  }
                />
                <StatTile icon={Timer} label="Avg call" value={avgDuration} />
              </div>
              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-xs text-gray-500 dark:border-white/10 dark:bg-white/5">
                Billable minutes round each completed call up to the next full minute.
              </div>
            </Panel>
          </div>
        ) : (
          <Panel>
            <EmptyState
              icon={Activity}
              title="No usage recorded this month"
              description={
                hasPlan
                  ? "Once your AI answers its first call this month, minutes and calls appear here."
                  : "Usage is tracked as soon as a plan is active and your AI starts answering."
              }
            />
          </Panel>
        )}
      </SettingsSection>

      {/* ------------------------------------------------------------- plan */}
      <div ref={upgradePlanRef}>
        <SettingsSection
          icon={Layers}
          title="Plan"
          hint="Change your plan at any time — it takes effect immediately."
          action={
            hasPlan && currentPlan ? (
              <StatusPill tone="brand" icon={CheckCircle2}>
                {currentPlan.display_name} · {formatUsd(currentPlan.monthly_fee_usd)}/mo
              </StatusPill>
            ) : (
              <StatusPill tone="warn" icon={AlertTriangle}>
                Preview mode — no active plan
              </StatusPill>
            )
          }
        >
          <div
            className={`grid grid-cols-1 gap-4 rounded-[20px] transition-all duration-300 lg:grid-cols-3 ${
              highlightPlans ? "ring-4 ring-brand-500/30" : ""
            }`}
          >
            {plans.map((plan) => {
              const isCurrent = hasPlan && plan.plan_code === currentPlanCode;
              const targetPlanOrder = PLAN_ORDER[plan.plan_code] || 0;

              let buttonLabel = "Current plan";
              let buttonVariant: "primary" | "secondary" = "secondary";
              let ButtonIcon: typeof ArrowUpCircle | null = null;

              if (!isCurrent) {
                if (!hasPlan) {
                  buttonLabel = "Select plan";
                  buttonVariant = "primary";
                  ButtonIcon = Sparkles;
                } else if (targetPlanOrder > currentPlanOrder) {
                  buttonLabel = "Upgrade";
                  buttonVariant = "primary";
                  ButtonIcon = ArrowUpCircle;
                } else if (targetPlanOrder < currentPlanOrder) {
                  buttonLabel = "Downgrade";
                  buttonVariant = "secondary";
                  ButtonIcon = ChevronDown;
                }
              }

              return (
                <div
                  key={plan.plan_code}
                  className={`relative flex min-h-[330px] flex-col overflow-hidden rounded-[20px] border p-6 transition ${
                    isCurrent
                      ? "border-brand-500 bg-gradient-to-br from-brand-500/10 via-white to-sky-50 shadow-lg shadow-brand-500/10 dark:border-brand-400 dark:from-brand-400/15 dark:via-navy-800 dark:to-navy-800"
                      : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg dark:border-white/10 dark:bg-navy-800 dark:hover:border-white/20"
                  }`}
                >
                  <div className="mb-5 flex min-h-7 items-start justify-between gap-3">
                    <p className="text-base font-semibold text-navy-700 dark:text-white">
                      {plan.display_name}
                    </p>
                    {isCurrent ? (
                      <StatusPill tone="brand" icon={CheckCircle2}>
                        Current
                      </StatusPill>
                    ) : null}
                  </div>

                  <p className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold tabular-nums tracking-tight text-navy-700 dark:text-white">
                      {formatUsd(plan.monthly_fee_usd)}
                    </span>
                    <span className="text-sm text-gray-500">/month</span>
                  </p>

                  <div className="my-5 h-px bg-gray-100 dark:bg-white/10" />
                  <ul className="flex-1 space-y-3">
                    <PlanFeature>
                      {plan.included_minutes.toLocaleString()} minutes included
                    </PlanFeature>
                    <PlanFeature>
                      {plan.concurrency_limit} concurrent {plan.concurrency_limit === 1 ? "call" : "calls"}
                    </PlanFeature>
                    <PlanFeature>
                      {plan.included_phone_numbers} phone number
                      {plan.included_phone_numbers === 1 ? "" : "s"}
                    </PlanFeature>
                    <PlanFeature>
                      {formatUsd(plan.overage_rate_usd_per_min)}/min after that
                    </PlanFeature>
                  </ul>

                  <SettingsButton
                    type="button"
                    variant={isCurrent ? "secondary" : buttonVariant}
                    disabled={isCurrent || confirmLoading || !canManageBilling}
                    title={!canManageBilling ? "Only owners and admins can change the plan" : undefined}
                    onClick={() => handlePlanChange(plan.plan_code)}
                    className={`mt-6 min-h-11 w-full ${isCurrent ? "disabled:!opacity-100" : ""}`}
                  >
                    {ButtonIcon ? <ButtonIcon /> : null}
                    {buttonLabel}
                  </SettingsButton>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      </div>

      {/* ---------------------------------------------------------- add-ons */}
      {summary?.addons || summary?.pricing_preview ? (
        <SettingsSection
          icon={Plus}
          title="Add-ons & total"
          hint="Extra capacity beyond your plan, and what this month is tracking towards."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {summary?.addons ? (
              <div className="space-y-4 lg:col-span-2">
                {summary.addons.available
                  .filter((addon) => addon.key === "extra_concurrency" || addon.key === "extra_phone")
                  .map((addon) => {
                    const currentQty =
                      summary.addons?.active[addon.key as "extra_concurrency" | "extra_phone"] || 0;
                    const monthlyPrice = currentQty * addon.price_usd_month;
                    const isBillingPaused = summary.billing_status !== "active";
                    const isUpdating = updatingAddon === addon.key;
                    const Icon = ADDON_ICONS[addon.key] ?? Plus;

                    return (
                      <Panel key={addon.key}>
                        <PanelHeader
                          icon={Icon}
                          title={addon.label}
                          description={
                            addon.key === "extra_phone"
                              ? "An additional inbound number on this workspace."
                              : "Handle more simultaneous calls without a busy signal."
                          }
                          action={
                            <div className="flex items-center gap-2">
                              <SettingsButton
                                type="button"
                                variant="secondary"
                                aria-label={`Remove one ${addon.label}`}
                                onClick={() => {
                                  if (currentQty > 0) {
                                    handleAddonUpdate(
                                      addon.key,
                                      Math.max(0, currentQty - addon.step)
                                    );
                                  }
                                }}
                                disabled={currentQty === 0 || isUpdating || !canManageBilling}
                                className="h-9 w-9 !px-0"
                              >
                                <Minus />
                              </SettingsButton>
                              <span className="min-w-[2.5rem] text-center text-lg font-bold tabular-nums text-navy-700 dark:text-white">
                                {currentQty}
                              </span>
                              <SettingsButton
                                type="button"
                                variant="secondary"
                                aria-label={`Add one ${addon.label}`}
                                onClick={() => {
                                  if (!isBillingPaused && hasPlan) {
                                    handleAddonUpdate(addon.key, currentQty + addon.step);
                                  }
                                }}
                                disabled={isBillingPaused || isUpdating || !hasPlan || !canManageBilling}
                                className="h-9 w-9 !px-0"
                              >
                                <Plus />
                              </SettingsButton>
                            </div>
                          }
                        />

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <StatusPill tone={monthlyPrice > 0 ? "brand" : "neutral"} icon={Wallet}>
                            {monthlyPrice > 0 ? `+${formatUsd(monthlyPrice)}/mo` : "Not in use"}
                          </StatusPill>
                          <StatusPill tone="neutral" icon={Hash}>
                            {formatUsd(addon.price_usd_month)} per {addon.unit}
                          </StatusPill>
                          {!hasPlan ? (
                            <StatusPill tone="warn" icon={AlertTriangle}>
                              Requires an active plan
                            </StatusPill>
                          ) : null}
                          {isBillingPaused ? (
                            <StatusPill tone="warn" icon={AlertTriangle}>
                              Increases disabled until payment is resolved
                            </StatusPill>
                          ) : null}
                        </div>
                      </Panel>
                    );
                  })}
              </div>
            ) : null}

            {summary?.pricing_preview ? (
              <Panel className="h-fit">
                <PanelHeader
                  icon={TrendingUp}
                  tone="brand"
                  title="Estimated total"
                  description={
                    hasPlan
                      ? "A preview. The final invoice is calculated at month close."
                      : "No active plan."
                  }
                  action={
                    summary.pricing_preview.invoice_state === "stale" && hasPlan ? (
                      <StatusPill tone="warn">Updating</StatusPill>
                    ) : undefined
                  }
                />

                <p className="mt-4 text-3xl font-bold tabular-nums text-navy-700 dark:text-white">
                  {hasPlan
                    ? formatUsd(summary.pricing_preview.estimated_monthly_total_usd)
                    : formatUsd(0)}
                </p>

                {hasPlan ? (
                  <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-1.5 text-gray-500">
                        <Layers className="h-3.5 w-3.5" />
                        Plan
                      </dt>
                      <dd className="font-semibold tabular-nums text-navy-700 dark:text-white">
                        {formatUsd(summary.pricing_preview.plan_base_usd)}
                      </dd>
                    </div>
                    {summary.pricing_preview.addons_monthly_usd > 0 ? (
                      <div className="flex items-center justify-between">
                        <dt className="flex items-center gap-1.5 text-gray-500">
                          <Plus className="h-3.5 w-3.5" />
                          Add-ons
                        </dt>
                        <dd className="font-semibold tabular-nums text-navy-700 dark:text-white">
                          +{formatUsd(summary.pricing_preview.addons_monthly_usd)}
                        </dd>
                      </div>
                    ) : null}
                    {summary.pricing_preview.usage_overage_so_far_usd > 0 ? (
                      <div className="flex items-center justify-between">
                        <dt className="flex items-center gap-1.5 text-gray-500">
                          <Gauge className="h-3.5 w-3.5" />
                          Usage so far
                        </dt>
                        <dd className="font-semibold tabular-nums text-navy-700 dark:text-white">
                          +{formatUsd(summary.pricing_preview.usage_overage_so_far_usd)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {invoiceRun?.stripe_invoice_id ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-white/10">
                    <StatusPill tone={invoiceTone(invoiceRun.status)} icon={ReceiptText}>
                      {formatInvoiceStatus(invoiceRun.status)}
                    </StatusPill>
                    <InvoiceReference id={invoiceRun.stripe_invoice_id} />
                  </div>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      {/* ---------------------------------------------------- chat channels */}
      {/* Chat is capacity, not quantity: $299 buys one channel and $499 buys two, so the
          two tiers are alternatives rather than a number to step up and down. That is why
          this is its own section instead of another stepper in the add-ons grid above —
          a stepper here would let someone buy five copies of a plan whose whole meaning
          is "how many channels may answer".

          Switching tiers is deliberately two explicit steps (remove, then add). Doing it
          in one click would need two Stripe writes with no transaction around them, and a
          failure between them would leave a customer either paying twice or answering
          nowhere. Two clicks that each either happen or don't is the honest trade. */}
      {summary?.addons && chatTiers.length > 0 ? (
        <SettingsSection
          icon={MessagesSquare}
          title="Chat channels"
          hint="How many channels your AI may answer on. Messages always arrive; only answering is what a plan buys."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {chatTiers.map((tier) => {
              const isActive = (summary.addons?.active[tier.key] || 0) > 0;
              const blockedBy = chatTiers.find(
                (other) => other.key !== tier.key && (summary.addons?.active[other.key] || 0) > 0
              );
              const isBillingPaused = summary.billing_status !== "active";
              const isUpdating = updatingAddon === tier.key;

              return (
                <Panel key={tier.key}>
                  <PanelHeader
                    icon={MessagesSquare}
                    tone={isActive ? "brand" : "neutral"}
                    title={tier.label}
                    description={`${formatUsd(tier.price_usd_month)} per month.`}
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isActive ? (
                      <StatusPill tone="brand" icon={Check}>
                        Active
                      </StatusPill>
                    ) : (
                      <StatusPill tone="neutral" icon={Wallet}>
                        Not in use
                      </StatusPill>
                    )}
                    {!hasPlan ? (
                      <StatusPill tone="warn" icon={AlertTriangle}>
                        Requires an active plan
                      </StatusPill>
                    ) : null}
                  </div>

                  {!isActive && blockedBy ? (
                    <p className="mt-4 text-xs text-gray-500">
                      Remove &ldquo;{blockedBy.label}&rdquo; first — one chat plan at a time.
                    </p>
                  ) : null}

                  <SettingsButton
                    type="button"
                    variant={isActive ? "secondary" : "primary"}
                    className="mt-5 w-full"
                    disabled={
                      isUpdating ||
                      !hasPlan ||
                      !canManageBilling ||
                      (!isActive && (Boolean(blockedBy) || isBillingPaused))
                    }
                    onClick={() => handleAddonUpdate(tier.key, isActive ? 0 : 1)}
                  >
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isActive ? (
                      "Remove"
                    ) : (
                      "Add"
                    )}
                  </SettingsButton>
                </Panel>
              );
            })}

            <Panel className="h-fit">
              <PanelHeader
                icon={Sparkles}
                title="What a channel means"
                description="Telegram and email are live today. Connect any channel now and watch messages arrive — a plan decides which ones your AI answers on."
              />
              <p className="mt-4 text-xs text-gray-500">
                There is no message counter. A plan is a number of channels, not a number of
                replies.
              </p>
            </Panel>
          </div>
        </SettingsSection>
      ) : null}

      {/* ---------------------------------------------------------- overage */}
      {summary?.overage ? (
        <SettingsSection
          icon={Gauge}
          title="Overage"
          hint="What happens once you pass your included minutes."
        >
          <Panel>
            {hasPlan ? (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatTile
                    icon={Gauge}
                    label="Current overage"
                    value={formatUsd(summary.overage.current_overage_usd)}
                    tone={summary.overage.current_overage_usd > 0 ? "warn" : "brand"}
                  />
                  <StatTile
                    icon={Wallet}
                    label="Next auto-collect"
                    value={formatUsd(summary.overage.next_collect_at_usd)}
                  />
                  <StatTile
                    icon={TrendingUp}
                    label="Remaining to cap"
                    value={formatUsd(summary.overage.remaining_to_cap_usd)}
                  />
                  <StatTile
                    icon={AlertTriangle}
                    label="Hard cap"
                    value={formatUsd(summary.overage.hard_cap_usd)}
                    tone="critical"
                  />
                </div>

                <div className="mt-6 space-y-3">
                  <Meter
                    value={summary.overage.current_overage_usd}
                    max={summary.overage.hard_cap_usd}
                    label="Progress to hard cap"
                  />
                  {summary.overage.status === "ok" ? (
                    <p className="text-xs text-gray-500">
                      Auto-collect triggers every {formatUsd(summary.overage.threshold_step_usd)} of
                      overage. Reaching the hard cap pauses the workspace.
                    </p>
                  ) : null}
                  {summary.overage.status === "paused_hard_cap" ||
                  summary.overage.status === "paused_past_due" ||
                  summary.overage.status === "collecting" ? (
                    <Notice
                      tone={summary.overage.status === "collecting" ? "info" : "critical"}
                      icon={AlertTriangle}
                    >
                      {summary.overage.status === "paused_hard_cap"
                        ? "Service paused: the hard cap was reached. Payment is required to resume."
                        : summary.overage.status === "paused_past_due"
                          ? "Service paused: a payment failed. Payment is required to resume."
                          : "Overage threshold reached — collection is in progress."}
                    </Notice>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Gauge}
                title="Overage applies once you're on a plan"
                description="Charges only ever start after you've used the minutes your plan includes."
              />
            )}
          </Panel>
        </SettingsSection>
      ) : null}

      {/* --------------------------------------------------------- invoices */}
      {summary?.history && summary.history.length > 0 ? (
        <SettingsSection
          icon={ReceiptText}
          title="Invoices"
          hint="Every closed month, with its receipt."
          action={
            <SettingsButton
              type="button"
              variant="secondary"
              onClick={handlePortalRedirect}
              disabled={portalLoading || !hasPlan || !canManageBilling}
            >
              <ReceiptText />
              Receipts
            </SettingsButton>
          }
        >
          <Panel padded={false}>
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {summary.history.map((invoice, idx) => (
                <li
                  key={idx}
                  className="flex flex-wrap items-center gap-3 px-6 py-4 transition hover:bg-gray-50/60 dark:hover:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300"
                  >
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-700 dark:text-white">
                      {formatMonth(invoice.month)}
                    </p>
                    {invoice.stripe_invoice_id ? (
                      <p className="truncate">
                        <InvoiceReference id={invoice.stripe_invoice_id} />
                      </p>
                    ) : null}
                  </div>
                  <StatusPill tone={invoiceTone(invoice.status)}>
                    {formatInvoiceStatus(invoice.status)}
                  </StatusPill>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums text-navy-700 dark:text-white">
                    {formatUsd(invoice.estimated_total_due_usd)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </SettingsSection>
      ) : null}

      {/* ------------------------------------------------------ confirm flow */}
      <Dialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          if (!confirmLoading) {
            setConfirmDialogOpen(open);
            if (!open) {
              setConfirmError(null);
              setConfirmAction(null);
              setConfirmData(null);
            }
          }
        }}
      >
        <DialogContent className="!left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmAction === "plan" ? (
                <Layers className="h-5 w-5 text-brand-500" />
              ) : (
                <Plus className="h-5 w-5 text-brand-500" />
              )}
              {confirmAction === "plan" ? "Confirm plan change" : "Confirm add-on change"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {confirmAction === "plan" && confirmData?.planCode ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                      <span className="font-semibold text-navy-700 dark:text-white">
                        {hasPlan && currentPlanCode
                          ? summary?.plans.find((p) => p.plan_code === currentPlanCode)
                              ?.display_name || currentPlanCode
                          : "No plan"}
                      </span>
                      <ArrowUpCircle className="h-4 w-4 rotate-90 text-gray-400" />
                      <span className="font-semibold text-brand-600 dark:text-brand-300">
                        {summary?.plans.find((p) => p.plan_code === confirmData.planCode)
                          ?.display_name || confirmData.planCode}
                      </span>
                    </div>
                    {(() => {
                      const newPlan = summary?.plans.find(
                        (p) => p.plan_code === confirmData.planCode
                      );
                      const newPlanPrice = newPlan?.monthly_fee_usd || 0;
                      return (
                        <>
                          <p className="text-lg font-semibold text-navy-700 dark:text-white">
                            {formatUsd(newPlanPrice)}/month
                          </p>
                          <p className="text-xs text-gray-500">
                            Usage and add-ons are billed separately.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                {confirmAction === "addon" && confirmData ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                      <span className="font-semibold text-navy-700 dark:text-white">
                        {confirmData.addonLabel}
                      </span>
                      <span className="ml-auto tabular-nums text-gray-500">
                        {confirmData.currentQty} → <span className="font-semibold text-brand-600 dark:text-brand-300">{confirmData.newQty}</span>
                      </span>
                    </div>
                    {(() => {
                      const addon = summary?.addons?.available.find(
                        (a) => a.key === confirmData.addonKey
                      );
                      const qtyDelta = (confirmData.newQty || 0) - (confirmData.currentQty || 0);
                      const priceImpact = (addon?.price_usd_month || 0) * qtyDelta;
                      const benefitLine =
                        confirmData.addonKey === "extra_phone"
                          ? "Adds an additional inbound number to your workspace."
                          : confirmData.addonKey === "extra_concurrency"
                            ? "Handle more simultaneous calls without busy signals."
                            : "";

                      return (
                        <>
                          <p className="text-lg font-semibold text-navy-700 dark:text-white">
                            {priceImpact > 0
                              ? `+${formatUsd(priceImpact)}/mo`
                              : `−${formatUsd(Math.abs(priceImpact))}/mo`}
                          </p>
                          {benefitLine ? (
                            <p className="text-xs text-gray-500">{benefitLine}</p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>

          {confirmError ? (
            <Notice tone="critical" icon={AlertTriangle}>
              {confirmError}
            </Notice>
          ) : null}

          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => {
                if (!confirmLoading) {
                  setConfirmDialogOpen(false);
                  setConfirmError(null);
                }
              }}
              disabled={confirmLoading}
            >
              Cancel
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="primary"
              onClick={() => {
                if (confirmAction === "plan" && confirmData?.planCode) {
                  executePlanChange(confirmData.planCode);
                } else if (
                  confirmAction === "addon" &&
                  confirmData?.addonKey &&
                  confirmData?.newQty !== undefined
                ) {
                  setUpdatingAddon(confirmData.addonKey);
                  executeAddonUpdate(confirmData.addonKey, confirmData.newQty).finally(() =>
                    setUpdatingAddon(null)
                  );
                }
              }}
              disabled={confirmLoading}
            >
              {confirmLoading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {confirmLoading ? "Confirming…" : "Confirm"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview-mode nudge — kept as the page's own last word rather than a card that repeats
          the plan grid above it. */}
      {!hasPlan ? (
        <Notice
          tone="info"
          icon={Building2}
          title="You're in preview mode"
          action={
            <SettingsButton
              type="button"
              variant="primary"
              onClick={() => {
                if (upgradePlanRef.current) {
                  upgradePlanRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                  setHighlightPlans(true);
                  setTimeout(() => setHighlightPlans(false), 1200);
                }
              }}
            >
              <Sparkles />
              Choose a plan
            </SettingsButton>
          }
        >
          Choosing a plan activates billing, phone numbers and live calls for this workspace.
        </Notice>
      ) : null}
    </div>
  );
}
