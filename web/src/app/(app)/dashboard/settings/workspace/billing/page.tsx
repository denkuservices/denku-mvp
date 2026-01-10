"use client";

import * as React from "react";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

// Plan definitions - ready for Stripe integration
type Plan = {
  id: "starter" | "growth" | "scale";
  name: string;
  price: number;
  concurrent: number;
  minutesIncluded: number;
  overageRate: number;
  localNumbers: number;
  features: string[];
  premiumVoiceRate?: number;
};

const PLANS: Record<string, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 149,
    concurrent: 2,
    minutesIncluded: 600,
    overageRate: 0.18,
    localNumbers: 1,
    features: ["Basic analytics", "Appointment booking", "Ticket creation"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 399,
    concurrent: 5,
    minutesIncluded: 1500,
    overageRate: 0.14,
    localNumbers: 1,
    features: [
      "Multi-lingual routing",
      "CRM sync",
      "Advanced analytics",
      "Priority support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 899,
    concurrent: 20,
    minutesIncluded: 4000,
    overageRate: 0.1,
    localNumbers: 1,
    premiumVoiceRate: 0.05,
    features: [
      "HIPAA compliance",
      "Audit logs",
      "Unlimited knowledge base",
      "API access",
      "Dedicated account manager",
      "SLA",
    ],
  },
};

type Invoice = {
  id: string;
  date: string;
  amount: string;
  status: "Paid" | "Open" | "Refunded";
  downloadUrl?: string;
};

// Utility function for className merging
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Horizon UI Button component with brand-500 primary variant
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

// Card component for sections
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
      {subtitle && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      )}
    </div>
  );
}

// Status badge component
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
      {hint && (
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>
      )}
    </div>
  );
}

export default function WorkspaceBillingPage() {
  // Mock data - ready for Stripe integration
  const currentPlan: Plan = PLANS.starter;
  const renewalDate = "Feb 15, 2025"; // Mock renewal date
  const hasPaymentMethod = false; // Mock: no payment method

  // Mock usage data
  const usage = {
    minutesUsed: 450,
    minutesIncluded: currentPlan.minutesIncluded,
    callsCount: 342,
    phoneNumbers: 1,
  };

  // Mock invoices
  const invoices: Invoice[] = [
    {
      id: "inv_20250115",
      date: "Jan 15, 2025",
      amount: "$149.00",
      status: "Paid",
    },
    {
      id: "inv_20241215",
      date: "Dec 15, 2024",
      amount: "$149.00",
      status: "Paid",
    },
  ];

  // Handlers - ready for Stripe integration
  const handleManageSubscription = () => {
    // TODO: Open Stripe Customer Portal or internal billing flow
    console.log("Manage subscription");
  };

  const handleComparePlans = () => {
    // TODO: Navigate to pricing page or open plan comparison modal
    console.log("Compare plans");
  };

  const handleCancel = () => {
    // TODO: Open cancellation flow
    console.log("Cancel subscription");
  };

  const handleAddPaymentMethod = () => {
    // TODO: Open Stripe payment method flow
    console.log("Add payment method");
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    // TODO: Download invoice PDF
    console.log("Download invoice", invoiceId);
  };

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
      {/* Main grid: 2/3 left, 1/3 right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Current plan + Usage (spans 2 columns) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Current plan card */}
          <Card>
            <SectionTitle
              title="Current plan"
              subtitle="Your subscription and plan settings."
            />

            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {currentPlan.name}
                    </h3>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Renews on {renewalDate}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-zinc-900 dark:text-white">
                      ${currentPlan.price}
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
                    {currentPlan.concurrent} concurrent calls
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
                    {currentPlan.minutesIncluded.toLocaleString()} minutes included
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
                    ${currentPlan.overageRate.toFixed(2)}/min overage
                  </li>
                  {currentPlan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                    >
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
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="primary" onClick={handleManageSubscription}>
                  Manage subscription
                </Button>
                <Button variant="secondary" onClick={handleComparePlans}>
                  Compare plans
                </Button>
                <Button variant="destructive" onClick={handleCancel} className="ml-auto">
                  Cancel
                </Button>
              </div>
            </div>
          </Card>

          {/* Usage card */}
          <Card>
            <SectionTitle
              title="Usage"
              subtitle="A quick snapshot for this billing period."
            />

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UsageStat
                label="Call minutes"
                value={`${usage.minutesUsed.toLocaleString()} / ${usage.minutesIncluded.toLocaleString()}`}
                hint={`Included: ${usage.minutesIncluded.toLocaleString()}`}
              />
              <UsageStat
                label="Calls"
                value={usage.callsCount.toLocaleString()}
                hint="Total calls this period"
              />
              <UsageStat
                label="Phone numbers"
                value={usage.phoneNumbers.toString()}
                hint={`Limit: ${currentPlan.localNumbers}`}
              />
            </div>
          </Card>
        </div>

        {/* Right column: Payment method + Billing details (1 column) */}
        <div className="space-y-6">
          {/* Payment method card */}
          <Card>
            <SectionTitle
              title="Payment method"
              subtitle="Manage the card used for invoices."
            />

            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              {!hasPaymentMethod ? (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    No payment method on file.
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Add a card to enable automatic billing and invoices.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        Visa •••• 4242
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">Expires 12/29</p>
                    </div>
                    <Badge>Default</Badge>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <Button
                  variant={hasPaymentMethod ? "secondary" : "primary"}
                  onClick={handleAddPaymentMethod}
                  className="w-full"
                >
                  {hasPaymentMethod ? "Update card" : "Add payment method"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Billing details card */}
          <Card>
            <SectionTitle
              title="Billing details"
              subtitle="Invoice recipient and tax settings."
            />

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Billing email
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                  billing@example.com
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Company address
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                  123 Main St, City, State 12345
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Invoices table */}
      <Card className="mt-6">
        <SectionTitle title="Invoices" subtitle="Download past invoices and receipts." />

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
            <div className="col-span-5">Invoice</div>
            <div className="col-span-3">Date</div>
            <div className="col-span-2">Amount</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-zinc-200 bg-white dark:divide-white/10 dark:bg-zinc-950">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid grid-cols-12 items-center gap-4 px-4 py-4 transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/5"
              >
                <div className="col-span-5">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {invoice.id}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    Invoice PDF
                  </p>
                </div>
                <div className="col-span-3 text-sm text-zinc-700 dark:text-zinc-300">
                  {invoice.date}
                </div>
                <div className="col-span-2 text-sm font-semibold text-zinc-900 dark:text-white">
                  {invoice.amount}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-3">
                  <Badge
                    variant={
                      invoice.status === "Paid"
                        ? "success"
                        : invoice.status === "Open"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {invoice.status}
                  </Badge>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownloadInvoice(invoice.id)}
                  >
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </SettingsShell>
  );
}
