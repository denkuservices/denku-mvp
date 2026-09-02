import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { pauseOrgBilling, resumeOrgBilling } from "@/lib/billing/pause";
import { readCompletedCheckout } from "@/lib/billing/completedCheckout";
import { isVoicePlanCode } from "@/lib/billing/chatPlanKeys";
import { recordChatPurchase } from "@/lib/billing/chatEntitlement";
import {
  notifyPlanActivated,
  notifyPaymentReceipt,
  notifyPaymentFailed,
  notifySubscriptionCanceled,
  notifyWorkspaceResumed,
  resolveBillingOrgId,
} from "@/lib/billing/lifecycleNotifications";

/**
 * Verify Stripe webhook signature.
 */
async function verifyStripeSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return false;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logEvent({
      tag: "[BILLING][WEBHOOK][MISSING_SECRET]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {},
    });
    return false;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-02-24.acacia",
    });
    stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return true;
  } catch (err) {
    logEvent({
      tag: "[BILLING][WEBHOOK][SIGNATURE_ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "warn",
      details: {
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
    return false;
  }
}

/**
 * Update invoice run status based on Stripe invoice event.
 * Uses full invoice object for reconciliation.
 */
async function updateInvoiceRunStatus(
  invoice: Stripe.Invoice,
  eventType: string
): Promise<void> {
  const invoiceId = invoice.id;
  const invoiceStatus = invoice.status as string;

  // Find invoice run by stripe_invoice_id
  const { data: invoiceRun } = await supabaseAdmin
    .from("billing_invoice_runs")
    .select("org_id, month, status")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle<{ org_id: string; month: string; status: string | null }>();

  if (!invoiceRun) {
    logEvent({
      tag: "[BILLING][WEBHOOK][INVOICE_NOT_FOUND]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "warn",
      details: {
        stripe_invoice_id: invoiceId,
        event_type: eventType,
      },
    });
    return;
  }

  // Map Stripe invoice status to our DB status
  let dbStatus: string;
  switch (invoiceStatus) {
    case "open":
      dbStatus = "open";
      break;
    case "paid":
      dbStatus = "paid";
      break;
    case "uncollectible":
      dbStatus = "uncollectible";
      break;
    case "void":
      dbStatus = "void";
      break;
    case "draft":
      dbStatus = "draft";
      break;
    default:
      dbStatus = "error";
  }

  // Update invoice run
  const updateData: {
    status: string;
    finalized_at?: string;
    sent_at?: string;
    error_message?: string | null;
  } = {
    status: dbStatus,
  };

  // Set finalized_at if invoice was finalized (use status_transitions if available)
  if (eventType === "invoice.finalized") {
    updateData.finalized_at = invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
      : new Date().toISOString();
  }

  // Set sent_at if invoice was sent (payment succeeded or failed means it was sent)
  if (eventType === "invoice.payment_succeeded" || eventType === "invoice.payment_failed") {
    updateData.sent_at = invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
      : new Date().toISOString();
  }

  // Clear error_message on success
  if (dbStatus === "paid" || dbStatus === "open") {
    updateData.error_message = null;
  }

  await supabaseAdmin
    .from("billing_invoice_runs")
    .update(updateData)
    .eq("org_id", invoiceRun.org_id)
    .eq("month", invoiceRun.month);

  logEvent({
    tag: "[BILLING][WEBHOOK][INVOICE_UPDATED]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: invoiceRun.org_id,
    severity: "info",
    details: {
      month: invoiceRun.month,
      stripe_invoice_id: invoiceId,
      event_type: eventType,
      old_status: invoiceRun.status,
      new_status: dbStatus,
    },
  });
}

/**
 * POST /api/webhooks/stripe
 * 
 * Handles Stripe webhook events for invoice lifecycle updates.
 * 
 * Supported events:
 * - invoice.finalized: Invoice was finalized
 * - invoice.payment_succeeded: Invoice payment succeeded
 * - invoice.payment_failed: Invoice payment failed
 * - invoice.voided: Invoice was voided
 * - invoice.marked_uncollectible: Invoice marked as uncollectible
 * 
 * Updates billing_invoice_runs status based on Stripe invoice state.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Read raw body for signature verification
    const body = await req.text();

    // 2) Verify Stripe signature
    if (!(await verifyStripeSignature(req, body))) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // 3) Parse event
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-02-24.acacia",
    });
    const event: Stripe.Event = JSON.parse(body);

    // Hard logging at the top after signature verification
    console.log("[STRIPE][WEBHOOK_RECEIVED]", { type: event.type, id: event.id });

    logEvent({
      tag: "[BILLING][WEBHOOK][EVENT_RECEIVED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "info",
      details: {
        event_type: event.type,
        event_id: event.id,
      },
    });

    // 4) Handle checkout.session.completed for plan activation
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Validate session mode (should be "subscription" for plan purchases)
      if (session.mode !== "subscription") {
        logEvent({
          tag: "[BILLING][WEBHOOK][CHECKOUT_NON_SUBSCRIPTION]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "info",
          details: {
            event_type: event.type,
            session_id: session.id,
            mode: session.mode,
          },
        });
        // Return 200 - not an error, just not a plan purchase
        return NextResponse.json({ received: true });
      }

      // What this session bought — one shared reader across all four activation paths, so a chat
      // purchase (which carries no plan code) cannot be accepted here and refused elsewhere.
      const purchase = readCompletedCheckout(session.metadata);
      const orgId = purchase.orgId;
      const planCode = purchase.voicePlanCode;

      if (!orgId || (!purchase.ok && purchase.reason !== "invalid_plan")) {
        logEvent({
          tag: "[BILLING][WEBHOOK][CHECKOUT_MISSING_METADATA]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "warn",
          details: {
            event_type: event.type,
            session_id: session.id,
            has_org_id: !!orgId,
            has_plan_code: !!planCode,
          },
        });
        // Return 200 - do not cause retries
        return NextResponse.json({ received: true });
      }

      // A plan code we do not recognise. Same refusal, same 200 — this is a payment Stripe has
      // already taken, so it must not become a retry loop.
      if (purchase.reason === "invalid_plan") {
        logEvent({
          tag: "[BILLING][WEBHOOK][CHECKOUT_INVALID_PLAN]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "warn",
          details: {
            event_type: event.type,
            session_id: session.id,
            org_id: orgId,
            plan_code: planCode,
          },
        });
        // Return 200 - do not cause retries
        return NextResponse.json({ received: true });
      }

      /**
       * Only a VOICE purchase writes a plan. A chat purchase leaves `plan_code` null, which is
       * the truth: the workspace has no phone service. It used to write the fictional `chat_only`
       * so the column would not be empty.
       */
      const { error: overrideError } = planCode
        ? await supabaseAdmin
            .from("org_plan_overrides")
            .upsert(
              {
                org_id: orgId,
                plan_code: planCode,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "org_id" }
            )
        : { error: null };

      if (overrideError) {
        logEvent({
          tag: "[BILLING][WEBHOOK][CHECKOUT_OVERRIDE_ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            event_type: event.type,
            session_id: session.id,
            plan_code: planCode,
            error: overrideError.message,
          },
        });
        // Still return 200 - we'll retry on next webhook if needed
        return NextResponse.json({ received: true });
      }


      // A session carrying `chat_addon_key` bought a chat TIER. Record it, so the workspace
      // lands with the capacity it just paid for rather than an empty entitlement.
      //
      // Deliberately NOT conditional on the base plan being `chat_only` any more: onboarding can
      // now sell a voice plan and a chat tier in one session, and the tier was paid for in both
      // cases. Gating on the base plan would have taken the money and granted nothing.
      //
      // Idempotent, and never throws: this webhook is for a payment Stripe has already taken,
      // so a failure here must be logged and repaired, not turned into a retry loop.
      const chatAddonKey = purchase.chatAddonKey;
      if (chatAddonKey) {
        const recorded = await recordChatPurchase(orgId, chatAddonKey);
        logEvent({
          tag: recorded.ok
            ? "[BILLING][WEBHOOK][CHAT_ADDON_RECORDED]"
            : "[BILLING][WEBHOOK][CHAT_ADDON_FAILED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: recorded.ok ? "info" : "error",
          details: { session_id: session.id, addon_key: chatAddonKey, error: recorded.error },
        });
      }

      // Hard logging for plan activation
      console.log("[STRIPE][PLAN_ACTIVATED]", {
        org_id: orgId,
        plan_code: planCode,
        checkout_session_id: session.id,
        subscription_id: session.subscription || null,
      });

      logEvent({
        tag: "[BILLING][WEBHOOK][CHECKOUT_PLAN_ACTIVATED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: {
          event_type: event.type,
          session_id: session.id,
          plan_code: planCode,
          subscription_id: session.subscription || null,
        },
      });

      // Force onboarding_step = 5 (Activating) when plan is activated
      // DB step mapping: 4 = Plan, 5 = Activating, 6 = Live
      // This ensures user returns to onboarding (not dashboard) after Stripe checkout
      await supabaseAdmin
        .from("organization_settings")
        .update({ onboarding_step: 5 })
        .eq("org_id", orgId);

      // Purchase confirmation to the owner. Deduped on the session id (Stripe sends both
      // `completed` and `async_payment_succeeded` for one purchase) and never throws —
      // the money has already moved, so nothing here may turn this into a retry.
      if (planCode) {
        await notifyPlanActivated(orgId, {
          planCode,
          checkoutSessionId: session.id,
        });
      } else {
        /**
         * A chat purchase has no confirmation email yet, and this is the honest gap rather than a
         * hidden one. `notifyPlanActivated` renders from `billing_plan_catalog`, which describes
         * voice plans — minutes, concurrency, a phone number. It used to be handed `chat_only` and
         * would cheerfully send a customer a receipt for a $0 plan with no minutes. Saying nothing
         * is better than saying that; saying the right thing is a template that does not exist.
         */
        logEvent({
          tag: "[BILLING][WEBHOOK][CHAT_PURCHASE][NO_RECEIPT_EMAIL]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "info",
          details: { session_id: session.id, addon_key: chatAddonKey },
        });
      }

      // Return 200 OK
      return NextResponse.json({ received: true });
    }

    // Handle subscription events as backup (customer.subscription.created, customer.subscription.updated)
    // A subscription that has actually ended. Stripe sends this once, when the period the
    // customer paid for runs out (or on an immediate cancel). Nothing in the DB changes here
    // — the pause/limit machinery already reads plan state — but the customer must be told,
    // because from this moment their calls are not being answered.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
      const orgId = await resolveBillingOrgId({
        metadataOrgId: subscription.metadata?.org_id ?? null,
        stripeCustomerId: customerId ?? null,
      });

      if (orgId) {
        await notifySubscriptionCanceled(orgId, {
          subscriptionId: subscription.id,
          state: "ended",
          planCode: subscription.metadata?.plan_code?.toLowerCase() ?? null,
          effectiveAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : new Date(),
        });
      }

      logEvent({
        tag: "[BILLING][WEBHOOK][SUBSCRIPTION_DELETED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId ?? undefined,
        severity: "info",
        details: { subscription_id: subscription.id, resolved_org: !!orgId },
      });

      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      
      // Extract metadata
      const orgId = subscription.metadata?.org_id;
      const planCode = subscription.metadata?.plan_code?.toLowerCase();

      // A cancellation scheduled for the end of the paid period. The subscription is still
      // active, so the rest of this handler (which activates the plan) stays correct — but
      // the customer has just asked to leave and deserves to be told what that will do, and
      // when. Deduped on `${subscription}:scheduled`, so toggling it off and on is quiet.
      if (orgId && subscription.cancel_at_period_end) {
        const periodEnd = (subscription as unknown as { current_period_end?: number })
          .current_period_end;
        await notifySubscriptionCanceled(orgId, {
          subscriptionId: subscription.id,
          state: "scheduled",
          planCode: planCode ?? null,
          effectiveAt: periodEnd ? new Date(periodEnd * 1000) : null,
        });
      }

      if (!orgId || !planCode) {
        logEvent({
          tag: "[BILLING][WEBHOOK][SUBSCRIPTION_MISSING_METADATA]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "warn",
          details: {
            event_type: event.type,
            subscription_id: subscription.id,
            has_org_id: !!orgId,
            has_plan_code: !!planCode,
          },
        });
        // Return 200 - do not cause retries
        return NextResponse.json({ received: true });
      }

      /**
       * A VOICE plan is the only thing this handler can activate.
       *
       * It reads metadata off the SUBSCRIPTION, and the chat checkout sets its metadata on the
       * session — so there is no `chat_addon_key` here to act on, and a chat tier can never
       * legitimately arrive through this path. `isActivatablePlanCode` would also have accepted
       * the retired `chat_only`, which is now exactly the value that must not create a plan.
       */
      if (!isVoicePlanCode(planCode ?? "")) {
        logEvent({
          tag: "[BILLING][WEBHOOK][SUBSCRIPTION_INVALID_PLAN]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "warn",
          details: {
            event_type: event.type,
            subscription_id: subscription.id,
            org_id: orgId,
            plan_code: planCode,
          },
        });
        // Return 200 - do not cause retries
        return NextResponse.json({ received: true });
      }

      // Write to org_plan_overrides (idempotent upsert)
      const { error: overrideError } = await supabaseAdmin
        .from("org_plan_overrides")
        .upsert(
          {
            org_id: orgId,
            plan_code: planCode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id" }
        );

      if (overrideError) {
        logEvent({
          tag: "[BILLING][WEBHOOK][SUBSCRIPTION_OVERRIDE_ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            event_type: event.type,
            subscription_id: subscription.id,
            plan_code: planCode,
            error: overrideError.message,
          },
        });
        // Still return 200 - we'll retry on next webhook if needed
        return NextResponse.json({ received: true });
      }

      // Hard logging for plan activation
      console.log("[STRIPE][PLAN_ACTIVATED]", {
        org_id: orgId,
        plan_code: planCode,
        checkout_session_id: null,
        subscription_id: subscription.id,
      });

      logEvent({
        tag: "[BILLING][WEBHOOK][SUBSCRIPTION_PLAN_ACTIVATED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "info",
        details: {
          event_type: event.type,
          subscription_id: subscription.id,
          plan_code: planCode,
        },
      });

      // Force onboarding_step = 5 (Activating) when plan is activated via subscription event
      await supabaseAdmin
        .from("organization_settings")
        .update({ onboarding_step: 5 })
        .eq("org_id", orgId);

      // Return 200 OK
      return NextResponse.json({ received: true });
    }

    // 5) Handle invoice events
    if (event.type.startsWith("invoice.")) {
      let invoice: Stripe.Invoice;
      let invoiceId: string;

      // Determine if payload is thin (only has id) or full (has full invoice object)
      const eventObject = event.data.object as unknown;
      
      if (typeof eventObject === "string") {
        // Thin payload: object is just the ID string
        invoiceId = eventObject;
        invoice = await stripe.invoices.retrieve(invoiceId);
        
        logEvent({
          tag: "[BILLING][WEBHOOK][THIN_PAYLOAD]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          severity: "info",
          details: {
            event_type: event.type,
            stripe_invoice_id: invoiceId,
          },
        });
      } else if (eventObject && typeof eventObject === "object" && eventObject !== null) {
        // Check if it's a thin payload (only has id) or full invoice
        const obj = eventObject as Record<string, unknown>;
        
        if ("id" in obj) {
          const objectKeys = Object.keys(obj);
          const hasOnlyId = objectKeys.length === 1 && objectKeys[0] === "id";
          
          if (hasOnlyId && typeof obj.id === "string") {
            // Thin payload: object only has id property
            invoiceId = obj.id;
            invoice = await stripe.invoices.retrieve(invoiceId);
            
            logEvent({
              tag: "[BILLING][WEBHOOK][THIN_PAYLOAD]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              severity: "info",
              details: {
                event_type: event.type,
                stripe_invoice_id: invoiceId,
              },
            });
          } else {
            // Full payload: use object directly (it's a full Invoice)
            invoice = eventObject as Stripe.Invoice;
            invoiceId = invoice.id;
          }
        } else {
          // No id property, try to use as invoice anyway
          invoice = eventObject as Stripe.Invoice;
          invoiceId = invoice.id;
        }
      } else {
        // Fallback: try to use as invoice
        invoice = eventObject as Stripe.Invoice;
        invoiceId = invoice.id;
      }

      // Check if this is an overage_threshold invoice
      const metadata = invoice.metadata || {};
      const isOverageInvoice = metadata.kind === "overage_threshold";
      const orgIdFromMetadata = metadata.org_id as string | undefined;
      const monthFromMetadata = metadata.month as string | undefined;

      if (isOverageInvoice && orgIdFromMetadata && monthFromMetadata) {
        // Handle overage threshold invoice reconciliation
        switch (event.type) {
          case "invoice.payment_succeeded":
          case "invoice.paid":
            // Payment succeeded - update overage state and resume if paused
            const overageUsdSnapshot = metadata.overage_usd_snapshot
              ? Number(metadata.overage_usd_snapshot)
              : null;
            const thresholdUsd = metadata.threshold_usd
              ? Number(metadata.threshold_usd)
              : 100;

            if (overageUsdSnapshot !== null) {
              // Update billing_overage_state
              const { data: currentState } = await supabaseAdmin
                .from("billing_overage_state")
                .select("threshold_usd")
                .eq("org_id", orgIdFromMetadata)
                .eq("month", monthFromMetadata)
                .maybeSingle<{ threshold_usd: number }>();

              const currentThreshold = currentState?.threshold_usd
                ? Number(currentState.threshold_usd)
                : thresholdUsd;

              await supabaseAdmin
                .from("billing_overage_state")
                .upsert(
                  {
                    org_id: orgIdFromMetadata,
                    month: monthFromMetadata,
                    last_collect_status: "succeeded",
                    last_collected_overage_usd: overageUsdSnapshot,
                    next_collect_at_overage_usd: overageUsdSnapshot + currentThreshold,
                  },
                  { onConflict: "org_id,month" }
                );

              // Resume org if it was paused/past_due due to payment failure
              const { data: orgSettings } = await supabaseAdmin
                .from("organization_settings")
                .select("workspace_status, paused_reason")
                .eq("org_id", orgIdFromMetadata)
                .maybeSingle<{
                  workspace_status: "active" | "paused" | null;
                  paused_reason: "manual" | "hard_cap" | "past_due" | null;
                }>();

              const pausedReason = orgSettings?.paused_reason;
              if (
                orgSettings?.workspace_status === "paused" &&
                (pausedReason === "past_due" || pausedReason === "hard_cap")
              ) {
                await resumeOrgBilling(orgIdFromMetadata, {
                  month: monthFromMetadata,
                  stripe_invoice_id: invoiceId,
                });

                await notifyWorkspaceResumed(orgIdFromMetadata, {
                  reason: "payment_received",
                  dedupeKey: `overage:${invoiceId}`,
                });
              }

              // Receipt for the overage collection itself. Deduped on the invoice id, so
              // this and the regular-invoice path can never both bill the customer's inbox
              // for one payment.
              await notifyPaymentReceipt(orgIdFromMetadata, {
                invoiceId,
                invoiceNumber: invoice.number ?? null,
                amountPaidCents: invoice.amount_paid ?? 0,
                paidAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000)
                  : new Date(),
                description: `Usage beyond your included minutes — ${monthFromMetadata}`,
                invoiceUrl: invoice.hosted_invoice_url ?? null,
              });

              logEvent({
                tag: "[BILLING][WEBHOOK][OVERAGE_PAID]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: orgIdFromMetadata,
                severity: "info",
                details: {
                  month: monthFromMetadata,
                  stripe_invoice_id: invoiceId,
                  overage_usd_snapshot: overageUsdSnapshot,
                },
              });
            }
            break;

          case "invoice.payment_failed":
            // Payment failed - update state and pause org
            await supabaseAdmin
              .from("billing_overage_state")
              .upsert(
                {
                  org_id: orgIdFromMetadata,
                  month: monthFromMetadata,
                  last_collect_status: "failed",
                },
                { onConflict: "org_id,month" }
              );

            await pauseOrgBilling(orgIdFromMetadata, "payment_failed", {
              month: monthFromMetadata,
              stripe_invoice_id: invoiceId,
            });

            logEvent({
              tag: "[BILLING][WEBHOOK][OVERAGE_PAYMENT_FAILED]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              org_id: orgIdFromMetadata,
              severity: "warn",
              details: {
                month: monthFromMetadata,
                stripe_invoice_id: invoiceId,
              },
            });
            break;

          default:
            // Other events for overage invoices (finalized, voided, etc.) - just log
            logEvent({
              tag: "[BILLING][WEBHOOK][OVERAGE_EVENT]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              org_id: orgIdFromMetadata,
              severity: "info",
              details: {
                month: monthFromMetadata,
                event_type: event.type,
                stripe_invoice_id: invoiceId,
              },
            });
        }
      } else {
        // Regular invoice (monthly billing) - use existing reconciliation
        switch (event.type) {
          case "invoice.finalized":
            await updateInvoiceRunStatus(invoice, "invoice.finalized");
            break;

          case "invoice.payment_succeeded":
            await updateInvoiceRunStatus(invoice, "invoice.payment_succeeded");

            // Auto-resume org if it was billing-paused due to payment failure.
            // The org comes from our own metadata when we raised the invoice, and from the
            // customer↔org mapping when Stripe raised it itself (every renewal) — which is
            // exactly the case a receipt is for.
            const orgIdForPaidInvoice = await resolveBillingOrgId({
              metadataOrgId: invoice.metadata?.org_id ?? null,
              stripeCustomerId:
                typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
            });
            if (orgIdForPaidInvoice) {
              const { data: orgSettings } = await supabaseAdmin
                .from("organization_settings")
                .select("workspace_status, paused_reason")
                .eq("org_id", orgIdForPaidInvoice)
                .maybeSingle<{
                  workspace_status: "active" | "paused" | null;
                  paused_reason: "manual" | "hard_cap" | "past_due" | null;
                }>();

              const pausedReason = orgSettings?.paused_reason;
              if (
                orgSettings?.workspace_status === "paused" &&
                (pausedReason === "past_due" || pausedReason === "hard_cap")
              ) {
                // Org is billing-paused - auto-resume on payment success
                await resumeOrgBilling(orgIdForPaidInvoice, {
                  stripe_invoice_id: invoice.id,
                  invoice_type: "regular_monthly",
                });

                // Close the loop the pause email opened: the customer was told their line
                // stopped, so they must be told it started again.
                await notifyWorkspaceResumed(orgIdForPaidInvoice, {
                  reason: "payment_received",
                  dedupeKey: `invoice:${invoice.id}`,
                });
              }

              await notifyPaymentReceipt(orgIdForPaidInvoice, {
                invoiceId: invoice.id,
                invoiceNumber: invoice.number ?? null,
                amountPaidCents: invoice.amount_paid ?? 0,
                paidAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000)
                  : new Date(),
                description: invoice.lines?.data?.[0]?.description ?? null,
                invoiceUrl: invoice.hosted_invoice_url ?? null,
              });
            }
            break;

          case "invoice.payment_failed":
            await updateInvoiceRunStatus(invoice, "invoice.payment_failed");

            // Dunning. This is the warning that used to be missing entirely: until now the
            // first thing a customer heard about a declined card was the line going dead.
            const orgIdForFailedInvoice = await resolveBillingOrgId({
              metadataOrgId: invoice.metadata?.org_id ?? null,
              stripeCustomerId:
                typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
            });
            if (orgIdForFailedInvoice) {
              await notifyPaymentFailed(orgIdForFailedInvoice, {
                invoiceId: invoice.id,
                attemptCount: invoice.attempt_count ?? null,
                invoiceNumber: invoice.number ?? null,
                amountDueCents: invoice.amount_due ?? 0,
                nextAttemptAt: invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000)
                  : null,
                invoiceUrl: invoice.hosted_invoice_url ?? null,
              });
            }
            break;

          case "invoice.voided":
            await updateInvoiceRunStatus(invoice, "invoice.voided");
            break;

          case "invoice.marked_uncollectible":
            await updateInvoiceRunStatus(invoice, "invoice.marked_uncollectible");
            break;

          default:
            logEvent({
              tag: "[BILLING][WEBHOOK][UNHANDLED_EVENT]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              severity: "info",
              details: {
                event_type: event.type,
                stripe_invoice_id: invoiceId,
              },
            });
        }
      }
    } else {
      // Log unhandled event types (non-invoice events)
      logEvent({
        tag: "[BILLING][WEBHOOK][NON_INVOICE_EVENT]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        severity: "info",
        details: {
          event_type: event.type,
        },
      });
    }

    // 5) Return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[BILLING][WEBHOOK][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    // Still return 200 to prevent Stripe retries on our errors
    // (Stripe will retry on 4xx/5xx, but we want to handle errors ourselves)
    return NextResponse.json(
      { error: errorMsg },
      { status: 200 }
    );
  }
}
