import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { pauseOrgBilling, resumeOrgBilling } from "@/lib/billing/pause";

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

    // 4) Handle invoice events
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
              }

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
            break;

          case "invoice.payment_failed":
            await updateInvoiceRunStatus(invoice, "invoice.payment_failed");
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
