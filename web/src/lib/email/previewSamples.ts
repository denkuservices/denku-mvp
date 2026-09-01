/**
 * The mail estate, in one list, with sample data.
 *
 * Every transactional email Denku sends is registered here so that a human can look at
 * all of them at once — through `/api/dev/email-preview` in a dev server, or rendered to
 * files by `scripts/render-email-previews.mts`. Two things fall out of that:
 *
 *  1. **Design review is possible.** Inbox chrome is invisible in code review; the only
 *     way to see that one email drifted from the rest is to put them side by side.
 *  2. **This file is the inventory.** If a template is not here, nobody sees it until a
 *     customer does. Adding a mail means adding a sample — that is the point.
 *
 * Pure: no `server-only`, no database, no network. Everything is literal sample data.
 */

import { getVerificationEmailHtml, getOtpEmailHtml, getPasswordResetEmailHtml } from "./templates";
import { welcomeTemplate } from "./templates/welcome";
import { aiLiveTemplate } from "./templates/aiLive";
import { artifactNotificationTemplate } from "./templates/artifactNotification";
import { usageAlertTemplate } from "./templates/usageAlert";
import { workspacePausedTemplate } from "./templates/workspacePaused";
import { workspaceResumedTemplate } from "./templates/workspaceResumed";
import { planActivatedTemplate } from "./templates/planActivated";
import { paymentReceiptTemplate } from "./templates/paymentReceipt";
import { paymentFailedTemplate } from "./templates/paymentFailed";
import { subscriptionCanceledTemplate } from "./templates/subscriptionCanceled";
import { addonPurchasedTemplate } from "./templates/addonPurchased";
import { passwordChangedTemplate } from "./templates/passwordChanged";
import { memberInviteTemplate } from "./templates/memberInvite";

export interface EmailPreview {
  /** URL-safe id. */
  key: string;
  /** What a person calls this email. */
  label: string;
  /** The condition that sends it — the answer to "when would I get this?". */
  trigger: string;
  /** Where it is sent from in the code. */
  source: string;
  subject: string;
  html: string;
}

const BILLING_URL = "https://www.denku.io/dashboard/settings/workspace/billing";
const DASHBOARD_URL = "https://www.denku.io/dashboard";

function fromTemplate(
  meta: Omit<EmailPreview, "subject" | "html">,
  built: { subject: string; html: string }
): EmailPreview {
  return { ...meta, ...built };
}

export function emailPreviews(): EmailPreview[] {
  return [
    // ---- Account & onboarding ----
    {
      key: "verification",
      label: "Verify your email",
      trigger: "Signup, before the account is usable.",
      source: "lib/email/templates.ts → getVerificationEmailHtml",
      subject: "Verify your email — Denku",
      html: getVerificationEmailHtml({ email: "owner@acmedental.com", token: "sample-token-123" }),
    },
    {
      key: "otp",
      label: "One-time sign-in code",
      trigger: "A verification code is requested or resent.",
      source: "lib/email/templates.ts → getOtpEmailHtml",
      subject: "Your verification code — Denku",
      html: getOtpEmailHtml({ email: "owner@acmedental.com", token: "418206" }),
    },
    fromTemplate(
      {
        key: "welcome",
        label: "Welcome / start setup",
        trigger: "Once per workspace, when onboarding starts after a verified login.",
        source: "onboarding/sendWelcomeOnOnboardingStart.ts",
      },
      welcomeTemplate()
    ),
    fromTemplate(
      {
        key: "ai-live",
        label: "Your AI is live",
        trigger: "Activation finishes and a US number is bound to the assistant (once per workspace).",
        source: "lib/notifications/activationNotifications.ts",
      },
      aiLiveTemplate({
        phoneNumberE164: "+13215550142",
        orgName: "Acme Dental",
        dashboardUrl: DASHBOARD_URL,
      })
    ),
    fromTemplate(
      {
        key: "member-invite",
        label: "Workspace invitation",
        trigger: "An owner invites a teammate to the workspace.",
        source: "api/members/invite/route.ts",
      },
      memberInviteTemplate({
        orgName: "Acme Dental",
        inviterName: "Dr. Ayşe Yıldız",
        signupUrl: "https://www.denku.io/signup?invite=sample",
      })
    ),

    // ---- Security ----
    {
      key: "password-reset",
      label: "Reset your password",
      trigger: "A password reset is requested from the login screen.",
      source: "lib/email/templates.ts → getPasswordResetEmailHtml",
      subject: "Reset your password — Denku",
      html: getPasswordResetEmailHtml({ email: "owner@acmedental.com", token: "sample-reset-token" }),
    },
    fromTemplate(
      {
        key: "password-changed",
        label: "Password changed",
        trigger: "Every successful password change. Not flag-gated — it is how a takeover is noticed.",
        source: "lib/notifications/securityNotifications.ts",
      },
      passwordChangedTemplate({
        changedAt: "2026-09-01T09:24:00.000Z",
        device: "Chrome on Windows",
        orgName: "Acme Dental",
        recoveryUrl: "https://www.denku.io/forgot-password",
      })
    ),

    // ---- Billing lifecycle ----
    fromTemplate(
      {
        key: "plan-activated",
        label: "Subscription confirmed",
        trigger: "Stripe `checkout.session.completed` for a subscription.",
        source: "lib/billing/lifecycleNotifications.ts → notifyPlanActivated",
      },
      planActivatedTemplate({
        planName: "Growth",
        monthlyFeeUsd: 399,
        includedMinutes: 1200,
        includedPhoneNumbers: 1,
        concurrencyLimit: 4,
        overageRateUsdPerMin: 0.18,
        orgName: "Acme Dental",
        invoiceUrl: "https://invoice.stripe.com/i/sample",
        ctaUrl: "https://www.denku.io/onboarding",
      })
    ),
    fromTemplate(
      {
        key: "payment-receipt",
        label: "Payment receipt",
        trigger: "Stripe `invoice.payment_succeeded` — the monthly renewal, and collected overage.",
        source: "lib/billing/lifecycleNotifications.ts → notifyPaymentReceipt",
      },
      paymentReceiptTemplate({
        invoiceNumber: "A1B2C3D4-0007",
        amountPaidCents: 39900,
        paidAt: "2026-09-01T06:02:00.000Z",
        description: "Growth plan — September 2026",
        orgName: "Acme Dental",
        invoiceUrl: "https://invoice.stripe.com/i/sample",
        billingUrl: BILLING_URL,
      })
    ),
    fromTemplate(
      {
        key: "payment-failed",
        label: "Payment failed (dunning)",
        trigger: "Stripe `invoice.payment_failed`, once per collection attempt.",
        source: "lib/billing/lifecycleNotifications.ts → notifyPaymentFailed",
      },
      paymentFailedTemplate({
        amountDueCents: 39900,
        nextAttemptAt: "2026-09-04T06:00:00.000Z",
        invoiceNumber: "A1B2C3D4-0008",
        orgName: "Acme Dental",
        invoiceUrl: "https://invoice.stripe.com/i/sample",
        billingUrl: BILLING_URL,
      })
    ),
    fromTemplate(
      {
        key: "usage-alert",
        label: "Usage threshold (50/75/90%)",
        trigger: "The daily usage cron sees a newly crossed threshold of the included minutes.",
        source: "lib/billing/usageAlerts.ts",
      },
      usageAlertTemplate({
        thresholdPct: 90,
        billableMinutes: 1080,
        includedMinutes: 1200,
        orgName: "Acme Dental",
        billingUrl: BILLING_URL,
      })
    ),
    fromTemplate(
      {
        key: "workspace-paused-cap",
        label: "Line paused — usage cap",
        trigger: "Usage reaches 100% of the included minutes and the workspace is paused.",
        source: "lib/billing/pauseNotifications.ts",
      },
      workspacePausedTemplate({ reason: "hard_cap", orgName: "Acme Dental", billingUrl: BILLING_URL })
    ),
    fromTemplate(
      {
        key: "workspace-paused-past-due",
        label: "Line paused — payment",
        trigger: "A payment stays uncollected and the workspace is paused as past due.",
        source: "lib/billing/pauseNotifications.ts",
      },
      workspacePausedTemplate({ reason: "past_due", orgName: "Acme Dental", billingUrl: BILLING_URL })
    ),
    fromTemplate(
      {
        key: "workspace-resumed",
        label: "Line answering again",
        trigger: "The paused→active transition, after payment or an upgrade.",
        source: "lib/billing/lifecycleNotifications.ts → notifyWorkspaceResumed",
      },
      workspaceResumedTemplate({
        reason: "payment_received",
        orgName: "Acme Dental",
        dashboardUrl: DASHBOARD_URL,
      })
    ),
    fromTemplate(
      {
        key: "addon-changed",
        label: "Add-on purchased",
        trigger: "An add-on quantity changes (extra number, extra concurrency, chat tier).",
        source: "api/billing/addons/update/route.ts",
      },
      addonPurchasedTemplate({
        addonKey: "extra_phone",
        qty: 1,
        previousQty: 0,
        effectiveTotal: 2,
        orgName: "Acme Dental",
        billingUrl: BILLING_URL,
      })
    ),
    fromTemplate(
      {
        key: "subscription-scheduled-cancel",
        label: "Cancellation scheduled",
        trigger: "Stripe `customer.subscription.updated` with `cancel_at_period_end`.",
        source: "lib/billing/lifecycleNotifications.ts → notifySubscriptionCanceled",
      },
      subscriptionCanceledTemplate({
        state: "scheduled",
        planName: "Growth",
        effectiveAt: "2026-10-01T00:00:00.000Z",
        orgName: "Acme Dental",
        billingUrl: BILLING_URL,
      })
    ),
    fromTemplate(
      {
        key: "subscription-ended",
        label: "Subscription ended",
        trigger: "Stripe `customer.subscription.deleted`.",
        source: "lib/billing/lifecycleNotifications.ts → notifySubscriptionCanceled",
      },
      subscriptionCanceledTemplate({
        state: "ended",
        planName: "Growth",
        effectiveAt: "2026-10-01T00:00:00.000Z",
        orgName: "Acme Dental",
        billingUrl: BILLING_URL,
      })
    ),

    // ---- The product working ----
    fromTemplate(
      {
        key: "artifact-ticket",
        label: "New ticket captured",
        trigger: "The AI turns a finished conversation into a ticket.",
        source: "lib/notifications/artifactNotifications.ts",
      },
      artifactNotificationTemplate({
        kind: "ticket",
        title: "Crown came loose — needs a look this week",
        caller: "+1 32…42",
        snippet:
          "Hi, my temporary crown came off last night while I was eating. It doesn't hurt but I don't want to lose it. Can someone look at it before the weekend?",
        deepLink: "https://www.denku.io/dashboard/tickets/sample",
        orgName: "Acme Dental",
      })
    ),
    fromTemplate(
      {
        key: "artifact-appointment",
        label: "New appointment request",
        trigger: "The AI captures a booking request from a conversation.",
        source: "lib/notifications/artifactNotifications.ts",
      },
      artifactNotificationTemplate({
        kind: "appointment",
        title: "Cleaning — Thursday afternoon",
        caller: "Maria Gonzales",
        snippet: "Any time after 2pm on Thursday works for me, or Friday morning.",
        deepLink: "https://www.denku.io/dashboard/requests/sample",
        orgName: "Acme Dental",
      })
    ),
  ];
}

export function findEmailPreview(key: string): EmailPreview | null {
  return emailPreviews().find((p) => p.key === key) ?? null;
}
