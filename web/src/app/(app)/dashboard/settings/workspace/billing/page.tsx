"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpCircle,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  CreditCard,
  Gauge,
  Gem,
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
  Zap,
} from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { isChatAddonKey, isOfferablePlanCode } from "@/lib/billing/chatPlanKeys";
import { startChatCheckout } from "@/app/(app)/onboarding/_actions";
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
  Notice,
  Panel,
  SettingsButton,
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

function BillingSectionHeading({
  eyebrow,
  title,
  icon: Icon,
  action,
}: {
  eyebrow: string;
  title: string;
  icon: typeof CreditCard;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-shadow-100 ring-1 ring-gray-100 dark:bg-navy-800 dark:ring-white/10">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-500">{eyebrow}</p>
          <h2 className="text-xl font-bold tracking-tight text-navy-700 dark:text-white">{title}</h2>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function BillingHero({
  planName,
  month,
  billingStatus,
  estimatedTotal,
  onManage,
  loading,
  disabled,
}: {
  planName: string | null;
  month: string | null;
  billingStatus: string | null;
  estimatedTotal: number | null;
  onManage: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  const active = billingStatus === "active";

  return (
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[#0b1437] px-6 py-7 text-white shadow-[0_28px_80px_-30px_rgba(11,20,55,.75)] sm:px-8 sm:py-8">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(117,81,255,.65),transparent_34%),radial-gradient(circle_at_88%_20%,rgba(55,196,255,.28),transparent_30%)]" />
      <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
      <div aria-hidden="true" className="absolute -right-6 -top-10 h-52 w-52 rounded-full border border-white/10" />
      <div aria-hidden="true" className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner shadow-white/10 backdrop-blur-xl">
              <CreditCard aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/50">Workspace</p>
              <h1 className="text-lg font-bold tracking-tight">Billing</h1>
            </div>
          </div>

          <SettingsButton
            type="button"
            variant="secondary"
            onClick={onManage}
            disabled={disabled}
            className="!border-white/15 !bg-white/10 !text-white !shadow-none backdrop-blur-xl hover:!bg-white/15"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Wallet />}
            {loading ? "Opening…" : "Manage billing"}
          </SettingsButton>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {billingStatus ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-xl">
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-amber-300"}`} />
                  {active ? "Active" : formatInvoiceStatus(billingStatus)}
                </span>
              ) : null}
              {month ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-white/45">
                  <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                  {month}
                </span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-white/45">Current plan</p>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl">{planName ?? "Preview"}</h2>
              {planName ? <Crown aria-hidden="true" className="h-6 w-6 text-amber-300" /> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/12 bg-white/[0.08] px-5 py-4 backdrop-blur-xl md:min-w-52 md:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Forecast</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
              {formatUsd(estimatedTotal)}
            </p>
            <p className="text-xs text-white/40">this month</p>
          </div>
        </div>
      </div>
    </header>
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
    <Panel className="relative min-h-[326px] overflow-hidden !rounded-[28px] !border-0 !bg-navy-700 bg-gradient-to-br from-[#17134c] via-navy-700 to-brand-600 text-white shadow-[0_24px_70px_-36px_rgba(66,42,251,.9)] dark:!bg-navy-800 dark:from-navy-800 dark:via-[#211d50] dark:to-brand-700">
      <div aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-300/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 left-20 h-64 w-64 rounded-full bg-brand-200/15 blur-3xl" />
      <div aria-hidden="true" className="absolute bottom-0 right-8 flex h-28 items-end gap-2 opacity-15">
        {[38, 58, 44, 76, 52, 88, 64, 100, 78, 92, 70, 108].map((height, index) => (
          <span key={index} className="w-2 rounded-t-full bg-white" style={{ height }} />
        ))}
      </div>

      <div className="relative flex h-full flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Voice allowance</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">Monthly pulse</h3>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-xl">
            {planName} · {month}
          </span>
        </div>

        <div className="mt-5 grid flex-1 grid-cols-1 items-center gap-6 sm:grid-cols-[176px_1fr]">
          <div
            role="progressbar"
            aria-valuenow={Math.min(displayPercent, 100)}
            aria-valuetext={`${displayPercent}% of included voice minutes used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Included voice minutes used"
            className="relative mx-auto h-44 w-44 sm:mx-0"
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
              <span className="text-4xl font-bold tracking-tight tabular-nums">{displayPercent}%</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40">used</span>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Minutes</p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
              {usedMinutes.toLocaleString()}
              <span className="ml-2 text-sm font-normal text-white/55">
                of {includedMinutes.toLocaleString()} min
              </span>
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-wide text-white/50">Remaining</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{remainingMinutes.toLocaleString()} min</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 backdrop-blur-xl">
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

function BillingMetric({
  icon: Icon,
  label,
  value,
  accent = "brand",
}: {
  icon: typeof PhoneCall;
  label: string;
  value: React.ReactNode;
  accent?: "brand" | "sky" | "amber" | "green";
}) {
  const accentClass = {
    brand: "bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300",
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  }[accent];

  return (
    <div className="group rounded-3xl border border-gray-100 bg-white p-4 shadow-shadow-100 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-navy-800">
      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accentClass}`}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-5 text-2xl font-bold tracking-tight tabular-nums text-navy-700 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500">{label}</p>
    </div>
  );
}

function ForecastCard({
  preview,
  invoiceRun,
  hasPlan,
  planName,
  addonLines,
}: {
  preview: NonNullable<BillingSummary["pricing_preview"]>;
  invoiceRun: BillingSummary["invoice_run"] | undefined;
  hasPlan: boolean;
  /** What the plan half of the total is called. */
  planName: string | null;
  /**
   * What the add-on half is made of, itemised.
   *
   * The card used to show one number — "Add-ons $608.00" — which is a total, not an answer. A
   * customer looking at their own bill could not tell whether that was chat, an extra number, extra
   * concurrency, or all three, and the first question anyone asks of a forecast is *what am I
   * paying for*. Every value here is already in the summary the page has loaded; nothing new is
   * fetched to say it.
   */
  addonLines: { key: string; label: string; qty: number; monthly: number }[];
}) {
  const total = hasPlan ? preview.estimated_monthly_total_usd : 0;
  const parts = [
    { label: "Plan", value: hasPlan ? preview.plan_base_usd : 0, color: "bg-brand-500" },
    { label: "Add-ons", value: hasPlan ? preview.addons_monthly_usd : 0, color: "bg-sky-400" },
    { label: "Usage", value: hasPlan ? preview.usage_overage_so_far_usd : 0, color: "bg-amber-400" },
  ];

  return (
    <Panel className="relative h-full overflow-hidden !rounded-[28px] !border-gray-100 dark:!border-white/10">
      <div aria-hidden="true" className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">Forecast</p>
            <p className="mt-2 text-4xl font-bold tracking-[-0.04em] tabular-nums text-navy-700 dark:text-white">
              {formatUsd(total)}
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-500/25">
            <TrendingUp aria-hidden="true" className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-7 flex h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" aria-hidden="true">
          {parts.map((part) => {
            const width = total > 0 ? Math.max((part.value / total) * 100, part.value > 0 ? 3 : 0) : 0;
            return <span key={part.label} className={part.color} style={{ width: `${width}%` }} />;
          })}
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          {parts.map((part) => (
            <div key={part.label}>
              <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <span className={`h-1.5 w-1.5 rounded-full ${part.color}`} />
                {part.label}
              </dt>
              <dd className="mt-1 text-sm font-bold tabular-nums text-navy-700 dark:text-white">
                {formatUsd(part.value)}
              </dd>
            </div>
          ))}
        </dl>

        {/* The itemisation. Only rendered when there is something to itemise — a workspace with no
            add-ons should see the three-part split and nothing more. */}
        {hasPlan && (planName || addonLines.length > 0) ? (
          <ul className="mt-5 space-y-2 border-t border-gray-100 pt-4 dark:border-white/10">
            {planName ? (
              <li className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span className="truncate">{planName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-navy-700 dark:text-white">
                  {formatUsd(preview.plan_base_usd)}
                </span>
              </li>
            ) : null}
            {addonLines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  {/* The quantity is shown only when there is more than one — "Extra phone number ×1"
                      is noise on a line that already says what it is. */}
                  <span className="truncate">
                    {line.label}
                    {line.qty > 1 ? ` ×${line.qty}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-navy-700 dark:text-white">
                  {formatUsd(line.monthly)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {invoiceRun?.stripe_invoice_id ? (
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-white/10">
            <InvoiceReference id={invoiceRun.stripe_invoice_id} />
            <StatusPill tone={invoiceTone(invoiceRun.status)}>{formatInvoiceStatus(invoiceRun.status)}</StatusPill>
          </div>
        ) : (
          <p className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400 dark:border-white/10">Live estimate</p>
        )}
      </div>
    </Panel>
  );
}

function PlanCard({
  plan,
  isCurrent,
  currentPlanOrder,
  hasPlan,
  disabled,
  onSelect,
}: {
  plan: BillingSummary["plans"][number];
  isCurrent: boolean;
  currentPlanOrder: number;
  hasPlan: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const targetPlanOrder = PLAN_ORDER[plan.plan_code] || 0;
  const isScale = plan.plan_code === "scale";
  const isGrowth = plan.plan_code === "growth";
  let buttonLabel = "Current";
  let ButtonIcon: typeof ArrowUpCircle | null = null;

  if (!isCurrent) {
    if (!hasPlan) {
      buttonLabel = "Choose plan";
      ButtonIcon = Sparkles;
    } else if (targetPlanOrder > currentPlanOrder) {
      buttonLabel = "Upgrade";
      ButtonIcon = ArrowUpCircle;
    } else {
      buttonLabel = "Downgrade";
      ButtonIcon = ChevronDown;
    }
  }

  const cardClass = isCurrent
    ? "border-brand-400 bg-[radial-gradient(circle_at_100%_0%,rgba(117,81,255,.24),transparent_36%),linear-gradient(145deg,#ffffff,#f4f1ff)] shadow-[0_24px_70px_-32px_rgba(66,42,251,.55)] dark:bg-[radial-gradient(circle_at_100%_0%,rgba(117,81,255,.28),transparent_38%),linear-gradient(145deg,#111c44,#17134c)]"
    : isScale
      ? "border-navy-700 bg-navy-700 text-white shadow-[0_24px_70px_-38px_rgba(11,20,55,.8)] dark:border-white/10"
      : "border-gray-100 bg-white shadow-shadow-100 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-navy-800";
  const mutedClass = isScale && !isCurrent ? "text-white/50" : "text-gray-500";
  const textClass = isScale && !isCurrent ? "text-white" : "text-navy-700 dark:text-white";

  return (
    <article className={`relative flex min-h-[390px] flex-col overflow-hidden rounded-[28px] border p-6 transition duration-300 ${cardClass}`}>
      <div aria-hidden="true" className={`absolute -right-16 -top-20 h-48 w-48 rounded-full blur-3xl ${isScale ? "bg-brand-400/30" : "bg-brand-400/10"}`} />
      <div className="relative flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isScale && !isCurrent ? "bg-white/10 text-white" : "bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300"}`}>
          {isScale ? <Gem aria-hidden="true" className="h-5 w-5" /> : isGrowth ? <Crown aria-hidden="true" className="h-5 w-5" /> : <Zap aria-hidden="true" className="h-5 w-5" />}
        </span>
        {isCurrent ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-brand-500/25">
            <Check aria-hidden="true" className="h-3.5 w-3.5" /> Current
          </span>
        ) : null}
      </div>

      <div className="relative mt-6">
        <p className={`text-sm font-bold ${textClass}`}>{plan.display_name}</p>
        <p className={`mt-2 flex items-baseline gap-1 ${textClass}`}>
          <span className="text-4xl font-bold tracking-[-0.04em] tabular-nums">{formatUsd(plan.monthly_fee_usd)}</span>
          <span className={`text-xs ${mutedClass}`}>/mo</span>
        </p>
      </div>

      <div className={`relative my-6 h-px ${isScale && !isCurrent ? "bg-white/10" : "bg-gray-100 dark:bg-white/10"}`} />

      <dl className="relative grid grid-cols-2 gap-x-4 gap-y-5">
        {[
          { icon: Clock, label: "Minutes", value: plan.included_minutes.toLocaleString() },
          { icon: Users, label: "Concurrent", value: plan.concurrency_limit.toString() },
          { icon: Phone, label: "Numbers", value: plan.included_phone_numbers.toString() },
          { icon: Gauge, label: "Overage", value: `${formatUsd(plan.overage_rate_usd_per_min)}/min` },
        ].map(({ icon: FeatureIcon, label, value }) => (
          <div key={label}>
            <dt className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${mutedClass}`}>
              <FeatureIcon aria-hidden="true" className="h-3.5 w-3.5" /> {label}
            </dt>
            <dd className={`mt-1 text-base font-bold tabular-nums ${textClass}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <SettingsButton
        type="button"
        variant={isCurrent ? "secondary" : "primary"}
        disabled={isCurrent || disabled}
        onClick={onSelect}
        className={`relative mt-auto min-h-12 w-full !rounded-2xl ${isCurrent ? "disabled:!opacity-100" : ""} ${isScale && !isCurrent ? "!bg-white !text-navy-700 hover:!bg-white/90" : ""}`}
      >
        {ButtonIcon ? <ButtonIcon /> : <CheckCircle2 />}
        {buttonLabel}
      </SettingsButton>
    </article>
  );
}

/**
 * Billing cockpit. Financial data and mutation flows stay attached to the existing API routes;
 * the components above only reshape the information into a compact Horizon-style dashboard.
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
        return;
      }

      /**
       * Buying chat has two routes, and this is where we learn which one applies.
       *
       * An add-on is a line item on a subscription. A workspace that already pays Stripe monthly
       * gets one more item, which is what the request above just did. A workspace with **no**
       * subscription has nothing to add to — the "No active Stripe subscription found" dead end,
       * hit by anyone whose plan was set without a completed checkout and by every chat-only
       * workspace by definition.
       *
       * `startChatCheckout` is the other route, and it always existed: it creates a subscription
       * whose line item IS the chat tier. It was only reachable from onboarding, so this page
       * could not offer it. Neither path is new — only the choosing is.
       *
       * The choice is made from the server's answer rather than predicted from the summary,
       * which would have meant a Stripe call on every billing page load to forecast something we
       * find out for free by asking. Removals never come here: there is nothing to remove from a
       * subscription that does not exist.
       */
      if (data.code === "no_subscription" && isChatAddonKey(addonKey) && newQty > 0) {
        // Come back HERE, not to the signup wizard. Sending a dashboard purchase into onboarding
        // is what re-ran activation and bought a phone number nobody asked for.
        const started = await startChatCheckout(addonKey, "/dashboard/settings/workspace/billing");
        if (started.ok && started.url) {
          window.location.href = started.url;
          return;
        }
        setConfirmError(started.error || "Could not start checkout");
        return;
      }

      setConfirmError(data.error || "Failed to update add-on");
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

  /**
   * Every add-on this workspace actually pays for, priced.
   *
   * Built from the catalogue the page already loaded, so the forecast can say what its add-on
   * total is made of instead of stating a number and leaving the customer to guess. A chat tier
   * is a choice rather than a quantity, so its line never multiplies — the qty column exists for
   * extra numbers and extra concurrency, which genuinely stack.
   */
  const addonLines = (summary?.addons?.available ?? [])
    .map((addon) => {
      const qty = summary?.addons?.active[addon.key as keyof NonNullable<typeof summary.addons>["active"]] || 0;
      return {
        key: addon.key,
        label: addon.label,
        qty,
        monthly: addon.price_usd_month * (isChatAddonKey(addon.key) ? Math.min(qty, 1) : qty),
      };
    })
    .filter((line) => line.qty > 0)
    /**
     * Products first, then the pieces bolted onto them.
     *
     * Voice is the plan line above; chat is the other product a workspace can hold, so it belongs
     * directly under it rather than buried among extra numbers and extra seats. Everything else
     * keeps the catalogue's own order, which is the order the cards below are drawn in — two
     * different orders for the same list would make the page harder to read, not easier.
     */
    .sort((a, b) => Number(isChatAddonKey(b.key)) - Number(isChatAddonKey(a.key)));

  // Find current plan object from summary.plans (only if plan exists)
  const currentPlan = hasPlan
    ? summary?.plans?.find((p) => p.plan_code === currentPlanCode) || null
    : null;

  // Get current plan order (0 if no plan)
  const currentPlanOrder = hasPlan ? PLAN_ORDER[currentPlanCode!] || 0 : 0;

  /** The header, shared by every state so loading and error don't lose the page's identity. */
  const hero = (
    <BillingHero
      planName={summary ? currentPlan?.display_name ?? currentPlanCode ?? null : null}
      month={summary?.month ? formatMonth(summary.month) : null}
      billingStatus={summary?.billing_status ?? null}
      estimatedTotal={summary?.pricing_preview?.estimated_monthly_total_usd ?? null}
      onManage={handlePortalRedirect}
      loading={portalLoading}
      disabled={portalLoading || !hasPlan || !canManageBilling}
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
        <div className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
          <div className="h-80 animate-pulse rounded-[28px] bg-navy-700/90" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[28px] bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        </div>
        <div className="h-72 animate-pulse rounded-[28px] bg-gray-100 dark:bg-white/5" />
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

      <section id="usage" className="scroll-mt-24">
        <BillingSectionHeading eyebrow="Overview" title="This month" icon={Activity} />
        {preview ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
              <UsageOverview
                usedMinutes={usedMinutes}
                includedMinutes={includedMinutes}
                planName={currentPlan?.display_name ?? currentPlanCode ?? "Plan"}
                month={summary?.month ? formatMonth(summary.month) : "Current month"}
              />
              {summary?.pricing_preview ? (
                <ForecastCard
                  preview={summary.pricing_preview}
                  invoiceRun={invoiceRun}
                  hasPlan={hasPlan}
                  planName={currentPlan?.display_name ?? currentPlanCode ?? null}
                  addonLines={addonLines}
                />
              ) : (
                <Panel className="!rounded-[28px]">
                  <EmptyState icon={TrendingUp} title="Forecast pending" description="Your live estimate will appear here." />
                </Panel>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <BillingMetric icon={PhoneCall} label="Calls" value={totalCalls.toLocaleString()} />
              <BillingMetric icon={Clock} label="Billable min" value={usedMinutes.toLocaleString()} accent="sky" />
              <BillingMetric
                icon={Users}
                label="Peak live"
                value={preview.peak_concurrent_calls?.toString() ?? "—"}
                accent="amber"
              />
              <BillingMetric icon={Timer} label="Avg call" value={avgDuration} accent="green" />
            </div>
          </>
        ) : (
          <Panel className="!rounded-[28px]">
            <EmptyState
              icon={Activity}
              title="No usage yet"
              description={hasPlan ? "Your first completed call will light this dashboard up." : "Choose a plan to start tracking usage."}
            />
          </Panel>
        )}
      </section>

      <section ref={upgradePlanRef} className="scroll-mt-24">
        <BillingSectionHeading
          eyebrow="Plans"
          title="Choose your pace"
          icon={Layers}
          action={
            currentPlan ? (
              <span className="hidden items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-600 sm:inline-flex dark:text-brand-300">
                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                {currentPlan.display_name}
              </span>
            ) : null
          }
        />
        <div className={`grid gap-4 rounded-[28px] transition-all duration-300 lg:grid-cols-3 ${highlightPlans ? "ring-4 ring-brand-500/25" : ""}`}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan_code}
              plan={plan}
              isCurrent={hasPlan && plan.plan_code === currentPlanCode}
              currentPlanOrder={currentPlanOrder}
              hasPlan={hasPlan}
              disabled={confirmLoading || !canManageBilling}
              onSelect={() => handlePlanChange(plan.plan_code)}
            />
          ))}
        </div>
      </section>

      {summary?.addons ? (
        <section>
          <BillingSectionHeading eyebrow="Power-ups" title="Shape your workspace" icon={Sparkles} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summary.addons.available
              .filter((addon) => addon.key === "extra_concurrency" || addon.key === "extra_phone")
              .map((addon) => {
                const currentQty = summary.addons?.active[addon.key as "extra_concurrency" | "extra_phone"] || 0;
                const isBillingPaused = summary.billing_status !== "active";
                const isUpdating = updatingAddon === addon.key;
                const Icon = ADDON_ICONS[addon.key] ?? Plus;

                return (
                  <article key={addon.key} className="relative overflow-hidden rounded-[28px] border border-gray-100 bg-white p-5 shadow-shadow-100 dark:border-white/10 dark:bg-navy-800">
                    <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <p className="text-right text-sm font-bold tabular-nums text-navy-700 dark:text-white">
                        {formatUsd(addon.price_usd_month)}<span className="text-[10px] font-medium text-gray-400">/mo</span>
                      </p>
                    </div>
                    <h3 className="relative mt-5 text-base font-bold text-navy-700 dark:text-white">{addon.label}</h3>
                    <p className="mt-1 text-xs text-gray-400">{addon.key === "extra_phone" ? "Inbound line" : "Simultaneous calls"}</p>
                    <div className="mt-6 flex items-center justify-between rounded-2xl bg-gray-50 p-1.5 dark:bg-white/5">
                      <button
                        type="button"
                        aria-label={`Remove one ${addon.label}`}
                        onClick={() => currentQty > 0 && handleAddonUpdate(addon.key, Math.max(0, currentQty - addon.step))}
                        disabled={currentQty === 0 || isUpdating || !canManageBilling}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-white hover:text-navy-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Minus aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <span className="text-lg font-bold tabular-nums text-navy-700 dark:text-white">{currentQty}</span>
                      <button
                        type="button"
                        aria-label={`Add one ${addon.label}`}
                        onClick={() => !isBillingPaused && hasPlan && handleAddonUpdate(addon.key, currentQty + addon.step)}
                        disabled={isBillingPaused || isUpdating || !hasPlan || !canManageBilling}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-700 text-white shadow-sm transition hover:bg-brand-500 disabled:opacity-30 dark:bg-brand-500"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })}

            {chatTiers.map((tier) => {
              const isActive = (summary.addons?.active[tier.key] || 0) > 0;
              const blockedBy = chatTiers.find((other) => other.key !== tier.key && (summary.addons?.active[other.key] || 0) > 0);
              const isBillingPaused = summary.billing_status !== "active";
              const isUpdating = updatingAddon === tier.key;

              return (
                <article key={tier.key} className={`relative overflow-hidden rounded-[28px] border p-5 shadow-shadow-100 ${isActive ? "border-brand-400 bg-brand-500 text-white" : "border-gray-100 bg-white dark:border-white/10 dark:bg-navy-800"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isActive ? "bg-white/15 text-white" : "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300"}`}>
                      <MessagesSquare aria-hidden="true" className="h-5 w-5" />
                    </span>
                    {isActive ? <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">Active</span> : null}
                  </div>
                  <h3 className={`mt-5 text-base font-bold ${isActive ? "text-white" : "text-navy-700 dark:text-white"}`}>{tier.label}</h3>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${isActive ? "text-white" : "text-navy-700 dark:text-white"}`}>
                    {formatUsd(tier.price_usd_month)}<span className={`text-[10px] font-medium ${isActive ? "text-white/50" : "text-gray-400"}`}>/mo</span>
                  </p>
                  <SettingsButton
                    type="button"
                    variant={isActive ? "secondary" : "primary"}
                    className={`mt-6 w-full !rounded-2xl ${isActive ? "!border-white/15 !bg-white/10 !text-white hover:!bg-white/15" : ""}`}
                    /* No `hasPlan` here, deliberately: chat is a product of its own, and
                       requiring a voice plan to buy it is the fiction this replaced. */
                    disabled={isUpdating || !canManageBilling || (!isActive && (Boolean(blockedBy) || isBillingPaused))}
                    title={!isActive && blockedBy ? `Remove ${blockedBy.label} first` : undefined}
                    onClick={() => handleAddonUpdate(tier.key, isActive ? 0 : 1)}
                  >
                    {isUpdating ? <Loader2 className="animate-spin" /> : isActive ? <Minus /> : <Plus />}
                    {isActive ? "Remove" : "Add channel"}
                  </SettingsButton>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <BillingSectionHeading
          eyebrow="Control"
          title="Spend & receipts"
          icon={BadgeDollarSign}
          action={
            summary?.history?.length ? (
              <SettingsButton type="button" variant="secondary" onClick={handlePortalRedirect} disabled={portalLoading || !hasPlan || !canManageBilling} className="!rounded-2xl">
                <ReceiptText /> Receipts
              </SettingsButton>
            ) : null
          }
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,.72fr)_minmax(0,1.28fr)]">
          {summary?.overage ? (
            <Panel className="relative overflow-hidden !rounded-[28px] !border-0 !bg-[#111c44] text-white shadow-[0_24px_70px_-38px_rgba(11,20,55,.8)]">
              <div aria-hidden="true" className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Overage</p>
                    <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{formatUsd(summary.overage.current_overage_usd)}</p>
                    {summary.overage.status !== "ok" ? (
                      <p className="mt-2 text-xs font-semibold text-amber-200">
                        {summary.overage.status === "collecting" ? "Collection in progress" : "Workspace paused"}
                      </p>
                    ) : null}
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
                    <Gauge aria-hidden="true" className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/40">
                    <span>Safety cap</span>
                    <span>{formatUsd(summary.overage.hard_cap_usd)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 via-sky-300 to-amber-300 transition-all duration-500"
                      style={{ width: `${summary.overage.hard_cap_usd > 0 ? Math.min((summary.overage.current_overage_usd / summary.overage.hard_cap_usd) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/[0.07] p-3.5">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Next collect</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{formatUsd(summary.overage.next_collect_at_usd)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.07] p-3.5">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Headroom</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{formatUsd(summary.overage.remaining_to_cap_usd)}</p>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel padded={false} className="overflow-hidden !rounded-[28px]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300">
                  <ReceiptText aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-navy-700 dark:text-white">Invoices</h3>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">Billing history</p>
                </div>
              </div>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-gray-300" />
            </div>
            {summary?.history?.length ? (
              <ul className="divide-y divide-gray-100 dark:divide-white/10">
                {summary.history.map((invoice, idx) => (
                  <li key={`${invoice.month}-${idx}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-gray-50/70 dark:hover:bg-white/5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300">
                      <CalendarDays aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-navy-700 dark:text-white">{formatMonth(invoice.month)}</p>
                      {invoice.stripe_invoice_id ? <InvoiceReference id={invoice.stripe_invoice_id} /> : null}
                    </div>
                    <StatusPill tone={invoiceTone(invoice.status)}>{formatInvoiceStatus(invoice.status)}</StatusPill>
                    <span className="min-w-20 text-right text-sm font-bold tabular-nums text-navy-700 dark:text-white">{formatUsd(invoice.estimated_total_due_usd)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8">
                <EmptyState icon={ReceiptText} title="No invoices yet" description="Closed billing periods will appear here." />
              </div>
            )}
          </Panel>
        </div>
      </section>

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
