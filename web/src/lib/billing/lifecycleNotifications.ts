import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { resolveOrgOwnerEmail } from "@/lib/notifications/recipient";
import { billingNotificationsEnabled } from "@/lib/billing/pauseNotifications";
import { sendOnce } from "@/lib/email/dispatch";
import { planActivatedTemplate } from "@/lib/email/templates/planActivated";
import { paymentReceiptTemplate } from "@/lib/email/templates/paymentReceipt";
import { paymentFailedTemplate } from "@/lib/email/templates/paymentFailed";
import { subscriptionCanceledTemplate } from "@/lib/email/templates/subscriptionCanceled";
import { addonPurchasedTemplate, type AddonKey } from "@/lib/email/templates/addonPurchased";
import { workspaceResumedTemplate, type ResumeReason } from "@/lib/email/templates/workspaceResumed";
import { resolveOrgEmailLocale } from "@/lib/email/locale.server";
import { emailText, type EmailLocale } from "@/lib/email/i18n";

/**
 * The billing lifecycle emails — purchase, receipt, dunning, cancellation, add-ons, and
 * the resume that closes the pause loop.
 *
 * Denku already emailed the two moments where it takes something away (usage warning,
 * workspace paused) and none of the moments where the customer gives something or gets
 * something. This module fills that in.
 *
 * House rules, matching the R-008/R-009 notification code these sit beside:
 * - **STAGED**: everything here obeys `BILLING_NOTIFICATIONS_ENABLED`, the same switch
 *   as the pause/usage mails. One flag for all money mail; a per-email flag estate is
 *   how features end up permanently off.
 * - **IDEMPOTENT**: each send claims a `(kind, dedupe_key)` row via `sendOnce`, keyed on
 *   the Stripe object that caused it, because every trigger here can fire twice.
 * - **NEVER THROWS**: a webhook must return 200 for a payment Stripe has already taken,
 *   whatever the mail server does.
 */

const billingUrl = () => `${getBaseUrl()}/dashboard/settings/workspace/billing`;
const dashboardUrl = () => `${getBaseUrl()}/dashboard`;
const onboardingUrl = () => `${getBaseUrl()}/onboarding`;

interface OrgContact {
  email: string;
  orgName: string | null;
  locale: EmailLocale;
}

/** Recipient + display name for an org, or null when we have nobody to write to. */
async function orgContact(orgId: string): Promise<OrgContact | null> {
  const email = await resolveOrgOwnerEmail(orgId);
  if (!email) return null;

  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle<{ name: string | null }>();

  return { email, orgName: org?.name ?? null, locale: await resolveOrgEmailLocale(orgId, email) };
}

/**
 * Has this workspace asked NOT to receive optional billing mail?
 *
 * Deliberately consulted by the *optional* notices only — a receipt, a plan activation, an add-on
 * confirmation. A failed payment and a paused workspace are sent regardless of this flag: losing
 * your phone line without warning is a far worse outcome than an email you did not want, and a
 * preference is not consent to be left in the dark about service stopping.
 *
 * Returns false (i.e. "still send") on any read failure, including the column not existing yet.
 */
async function billingMailMuted(orgId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select("notify_billing_events")
      .eq("org_id", orgId)
      .maybeSingle<{ notify_billing_events: boolean | null }>();
    if (error) return false;
    return data?.notify_billing_events === false;
  } catch {
    return false;
  }
}

interface PlanRow {
  display_name: string;
  monthly_fee_usd: number;
  included_minutes: number;
  overage_rate_usd_per_min: number;
  concurrency_limit: number;
  included_phone_numbers: number;
}

async function planRow(planCode: string): Promise<PlanRow | null> {
  const { data } = await supabaseAdmin
    .from("billing_plan_catalog")
    .select(
      "display_name, monthly_fee_usd, included_minutes, overage_rate_usd_per_min, concurrency_limit, included_phone_numbers"
    )
    .eq("plan_code", planCode.toLowerCase())
    .maybeSingle<PlanRow>();
  return data ?? null;
}

/**
 * Which org a Stripe object belongs to.
 *
 * Our own invoices carry `metadata.org_id`, but the ones Stripe generates itself — every
 * subscription renewal — do not, and those are exactly the ones a receipt is for. The
 * customer↔org mapping in `billing_stripe_customers` is the fallback, and it is the same
 * table `ensureStripeCustomer` writes, so it exists for every paying workspace.
 */
export async function resolveBillingOrgId(input: {
  metadataOrgId?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string | null> {
  const fromMetadata = input.metadataOrgId?.trim();
  if (fromMetadata) return fromMetadata;

  const customerId = input.stripeCustomerId?.trim();
  if (!customerId) return null;

  const { data } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("org_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle<{ org_id: string }>();

  return data?.org_id ?? null;
}

/**
 * Purchase confirmation, on `checkout.session.completed`.
 *
 * Deduped on the checkout session id: Stripe delivers `completed` and
 * `async_payment_succeeded` for the same purchase, and redelivers either at will.
 * The CTA points at onboarding when the workspace has not finished activating (the
 * common case — this fires mid-signup) and at the dashboard once it has.
 */
export async function notifyPlanActivated(
  orgId: string,
  params: { planCode: string; checkoutSessionId: string; invoiceUrl?: string | null }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;
    if (await billingMailMuted(orgId)) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const plan = await planRow(params.planCode);
    if (!plan) {
      console.error("[BILLING_NOTIFY] Plan not in catalog, skipping purchase email", {
        orgId,
        planCode: params.planCode,
      });
      return;
    }

    const { data: settings } = await supabaseAdmin
      .from("organization_settings")
      .select("onboarding_step")
      .eq("org_id", orgId)
      .maybeSingle<{ onboarding_step: number | null }>();

    const live = (settings?.onboarding_step ?? 0) >= 6;

    const { subject, html } = planActivatedTemplate({
      planName: plan.display_name,
      monthlyFeeUsd: Number(plan.monthly_fee_usd),
      includedMinutes: Number(plan.included_minutes),
      includedPhoneNumbers: Number(plan.included_phone_numbers),
      concurrencyLimit: Number(plan.concurrency_limit),
      overageRateUsdPerMin: Number(plan.overage_rate_usd_per_min),
      orgName: contact.orgName,
      invoiceUrl: params.invoiceUrl ?? null,
      ctaUrl: live ? dashboardUrl() : onboardingUrl(),
      ctaLabel: live
        ? emailText(contact.locale, { en: "Open your dashboard", es: "Abrir el panel", de: "Dashboard öffnen", tr: "Kontrol panelini aç" })
        : undefined,
      locale: contact.locale,
    });

    await sendOnce({
      kind: "plan_activated",
      dedupeKey: params.checkoutSessionId,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifyPlanActivated failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Receipt, on `invoice.payment_succeeded`. Deduped on the invoice id. */
export async function notifyPaymentReceipt(
  orgId: string,
  params: {
    invoiceId: string;
    invoiceNumber?: string | null;
    amountPaidCents: number;
    paidAt: string | Date;
    description?: string | null;
    invoiceUrl?: string | null;
  }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;
    // A $0 invoice (a fully-credited proration) is not a payment; emailing a receipt for
    // one is noise that makes every other receipt less trusted.
    if (!params.amountPaidCents || params.amountPaidCents <= 0) return;
    if (await billingMailMuted(orgId)) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const { subject, html } = paymentReceiptTemplate({
      invoiceNumber: params.invoiceNumber ?? null,
      amountPaidCents: params.amountPaidCents,
      paidAt: params.paidAt,
      description: params.description ?? null,
      orgName: contact.orgName,
      invoiceUrl: params.invoiceUrl ?? null,
      billingUrl: billingUrl(),
      locale: contact.locale,
    });

    await sendOnce({
      kind: "payment_receipt",
      dedupeKey: params.invoiceId,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifyPaymentReceipt failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Dunning warning, on `invoice.payment_failed`.
 *
 * Deduped on `${invoiceId}:${attemptCount}` rather than the invoice id alone: Stripe
 * retries a failed invoice on a schedule, and each genuine new failure is worth telling
 * the customer about, while a redelivery of the same attempt is not.
 */
export async function notifyPaymentFailed(
  orgId: string,
  params: {
    invoiceId: string;
    attemptCount?: number | null;
    invoiceNumber?: string | null;
    amountDueCents: number;
    nextAttemptAt?: string | Date | null;
    invoiceUrl?: string | null;
  }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const { subject, html } = paymentFailedTemplate({
      amountDueCents: params.amountDueCents,
      nextAttemptAt: params.nextAttemptAt ?? null,
      invoiceNumber: params.invoiceNumber ?? null,
      orgName: contact.orgName,
      invoiceUrl: params.invoiceUrl ?? null,
      billingUrl: billingUrl(),
      locale: contact.locale,
    });

    await sendOnce({
      kind: "payment_failed",
      dedupeKey: `${params.invoiceId}:${params.attemptCount ?? 1}`,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifyPaymentFailed failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cancellation, on `customer.subscription.updated` with `cancel_at_period_end` (scheduled)
 * or `customer.subscription.deleted` (ended).
 *
 * Deduped on `${subscriptionId}:${state}` so the scheduled notice and the final one are
 * each sent once, and toggling cancel-then-resubscribe does not re-send the same notice.
 */
export async function notifySubscriptionCanceled(
  orgId: string,
  params: {
    subscriptionId: string;
    state: "scheduled" | "ended";
    planCode?: string | null;
    effectiveAt?: string | Date | null;
  }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const plan = params.planCode ? await planRow(params.planCode) : null;

    const { subject, html } = subscriptionCanceledTemplate({
      state: params.state,
      planName: plan?.display_name ?? null,
      effectiveAt: params.effectiveAt ?? null,
      orgName: contact.orgName,
      billingUrl: billingUrl(),
      locale: contact.locale,
    });

    await sendOnce({
      kind: "subscription_canceled",
      dedupeKey: `${params.subscriptionId}:${params.state}`,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifySubscriptionCanceled failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Add-on change confirmation, from the add-on update route.
 *
 * Deduped on `${orgId}:${addonKey}:${qty}` — the same quantity being written again is the
 * same state, and re-confirming it would be noise; a genuine change moves the key.
 */
export async function notifyAddonChanged(
  orgId: string,
  params: {
    addonKey: AddonKey;
    qty: number;
    previousQty?: number | null;
    effectiveTotal?: number | null;
  }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;
    if (typeof params.previousQty === "number" && params.previousQty === params.qty) return;
    if (await billingMailMuted(orgId)) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const { subject, html } = addonPurchasedTemplate({
      addonKey: params.addonKey,
      qty: params.qty,
      previousQty: params.previousQty ?? null,
      effectiveTotal: params.effectiveTotal ?? null,
      orgName: contact.orgName,
      billingUrl: billingUrl(),
      locale: contact.locale,
    });

    await sendOnce({
      kind: "addon_changed",
      dedupeKey: `${orgId}:${params.addonKey}:${params.qty}`,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifyAddonChanged failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Service restored, on the paused→active transition.
 *
 * Deduped on a caller-supplied key (the invoice that paid, or a timestamped manual
 * resume) so one pause/resume cycle produces exactly one of each mail.
 */
export async function notifyWorkspaceResumed(
  orgId: string,
  params: { reason?: ResumeReason; dedupeKey: string }
): Promise<void> {
  try {
    if (!billingNotificationsEnabled() || !orgId) return;

    const contact = await orgContact(orgId);
    if (!contact) return;

    const { subject, html } = workspaceResumedTemplate({
      reason: params.reason,
      orgName: contact.orgName,
      dashboardUrl: dashboardUrl(),
      locale: contact.locale,
    });

    await sendOnce({
      kind: "workspace_resumed",
      dedupeKey: params.dedupeKey,
      to: contact.email,
      subject,
      html,
      orgId,
    });
  } catch (err) {
    console.error("[BILLING_NOTIFY] notifyWorkspaceResumed failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
