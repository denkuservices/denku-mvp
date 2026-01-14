import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { getStripeClient, ensureStripeCustomer } from "../../stripe/create-draft-invoice-helpers";

/**
 * Verify CRON_SECRET for security.
 * Supports:
 * 1) Authorization header: "Bearer ${CRON_SECRET}" (Vercel cron)
 * 2) x-cron-secret or cron-secret header matching CRON_SECRET (manual testing)
 */
function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  // Check Authorization header (Vercel cron format: "Bearer <secret>")
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1] === expected) {
      return true;
    }
  }

  // Check custom headers (manual testing)
  const incoming = req.headers.get("x-cron-secret") || req.headers.get("cron-secret");
  if (incoming === expected) {
    return true;
  }

  return false;
}

/**
 * Get previous month start in UTC (YYYY-MM-01 format).
 */
function getPreviousMonthStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
}

/**
 * Acquire lock on invoice run.
 * Returns true if lock acquired, false if already locked.
 * Uses simple check-then-update pattern (race conditions are acceptable as Stripe finalization is idempotent).
 */
async function acquireLock(
  orgId: string,
  month: string,
  lockToken: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  // Check current lock status
  const { data: existing } = await supabaseAdmin
    .from("billing_invoice_runs")
    .select("locked_at, lock_token")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle<{ locked_at: string | null; lock_token: string | null }>();

  if (!existing) {
    // Row doesn't exist, create it with lock
    await supabaseAdmin
      .from("billing_invoice_runs")
      .upsert(
        {
          org_id: orgId,
          month: month,
          locked_at: now,
          lock_token: lockToken,
        },
        { onConflict: "org_id,month" }
      );
    return true;
  }

  if (existing.locked_at) {
    const lockedAt = new Date(existing.locked_at);
    // Lock expired (older than 5 minutes), we can acquire it
    if (lockedAt < fiveMinutesAgo) {
      await supabaseAdmin
        .from("billing_invoice_runs")
        .update({
          locked_at: now,
          lock_token: lockToken,
        })
        .eq("org_id", orgId)
        .eq("month", month);
      return true;
    }
    // Lock still valid
    return false;
  }

  // No lock exists, acquire it
  await supabaseAdmin
    .from("billing_invoice_runs")
    .update({
      locked_at: now,
      lock_token: lockToken,
    })
    .eq("org_id", orgId)
    .eq("month", month);
  return true;
}

/**
 * Release lock on invoice run.
 */
async function releaseLock(orgId: string, month: string, lockToken: string): Promise<void> {
  await supabaseAdmin
    .from("billing_invoice_runs")
    .update({
      locked_at: null,
      lock_token: null,
    })
    .eq("org_id", orgId)
    .eq("month", month)
    .eq("lock_token", lockToken); // Only release if we own the lock
}

/**
 * Create draft invoice for org/month.
 * Only called when stripe_invoice_id is null (no prior run).
 * Uses UPSERT to update existing billing_invoice_runs row.
 */
async function ensureDraftInvoice(
  stripe: Stripe,
  orgId: string,
  month: string
): Promise<{ stripe_invoice_id: string | null; status: string }> {
  // Safety check: if draft already exists, return it
  // (This should not happen as we only call this when stripe_invoice_id is null)
  const { data: existing } = await supabaseAdmin
    .from("billing_invoice_runs")
    .select("stripe_invoice_id, status")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle<{ stripe_invoice_id: string | null; status: string | null }>();

  if (existing?.stripe_invoice_id && existing.status === "draft") {
    return { stripe_invoice_id: existing.stripe_invoice_id, status: "draft" };
  }

  // Call the draft invoice creation endpoint logic
  // For simplicity, we'll inline the key parts here
  // In production, you might want to extract this to a shared helper

  // Get preview
  const { data: preview } = await supabaseAdmin
    .from("org_monthly_invoice_preview")
    .select(
      "plan_code, monthly_fee_usd, estimated_overage_cost_usd, overage_minutes, overage_rate_usd_per_min, estimated_total_due_usd"
    )
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle();

  if (!preview) {
    return { stripe_invoice_id: null, status: "error" };
  }

  // Ensure customer exists
  const customerId = await ensureStripeCustomer(stripe, orgId);

  // Create draft invoice
  try {
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false, // Draft mode
    });

    // Add monthly fee line item
    if (preview.monthly_fee_usd && preview.monthly_fee_usd > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(preview.monthly_fee_usd * 100), // Convert to cents
        currency: "usd",
        description: `${(preview.plan_code || "plan").toUpperCase()} Plan – Monthly fee`,
      });
    }

    // Add overage line item
    if (preview.estimated_overage_cost_usd && preview.estimated_overage_cost_usd > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(preview.estimated_overage_cost_usd * 100), // Convert to cents
        currency: "usd",
        description: `Overage minutes (${preview.overage_minutes || 0} min @ $${preview.overage_rate_usd_per_min || 0}/min)`,
      });
    }

    // Persist in DB using UPSERT on (org_id, month) to update existing row
    await supabaseAdmin
      .from("billing_invoice_runs")
      .upsert(
        {
          org_id: orgId,
          month: month,
          estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
          stripe_invoice_id: invoice.id,
          status: "draft",
        },
        { onConflict: "org_id,month" }
      );

    return { stripe_invoice_id: invoice.id, status: "draft" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to create invoice";
    await supabaseAdmin
      .from("billing_invoice_runs")
      .upsert(
        {
          org_id: orgId,
          month: month,
          estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
          stripe_invoice_id: null,
          status: "error",
          error_message: errorMsg,
        },
        { onConflict: "org_id,month" }
      );
    return { stripe_invoice_id: null, status: "error" };
  }
}

/**
 * Finalize a Stripe invoice (idempotent).
 */
async function finalizeInvoice(
  stripe: Stripe,
  invoiceId: string
): Promise<{ finalized: boolean; error?: string }> {
  try {
    // Check current status
    const invoice = await stripe.invoices.retrieve(invoiceId);
    
    if (invoice.status === "open" || invoice.status === "paid") {
      // Already finalized
      return { finalized: true };
    }

    if (invoice.status !== "draft") {
      return { finalized: false, error: `Invoice is ${invoice.status}, cannot finalize` };
    }

    // Finalize the invoice
    await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: true });
    return { finalized: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to finalize invoice";
    return { finalized: false, error: errorMsg };
  }
}

/**
 * Shared logic for closing month (finalize and collect invoices).
 * Used by both GET and POST handlers.
 */
async function closeMonthHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // 2) Determine target month
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const targetMonth =
      monthParam && /^\d{4}-\d{2}-01$/.test(monthParam)
        ? monthParam
        : getPreviousMonthStart();

    logEvent({
      tag: "[BILLING][CRON][CLOSE_MONTH][START]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "info",
      details: {
        month: targetMonth,
      },
    });

    // 3) Initialize Stripe
    const stripe = getStripeClient();

    // 4) Get all orgs with billing enabled (have invoice preview for target month)
    const { data: previews, error: fetchError } = await supabaseAdmin
      .from("org_monthly_invoice_preview")
      .select("org_id")
      .eq("month", targetMonth);

    if (fetchError) {
      logEvent({
        tag: "[BILLING][CRON][CLOSE_MONTH][FETCH_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        severity: "error",
        details: {
          month: targetMonth,
          error: fetchError.message,
        },
      });
      return NextResponse.json(
        { error: "Failed to fetch orgs" },
        { status: 500 }
      );
    }

    const orgs = previews || [];
    const stats = {
      processed: 0,
      skipped: 0,
      failed: 0,
    };

    // 5) Process each org
    for (const preview of orgs) {
      const orgId = preview.org_id;
      const lockToken = `cron-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      try {
        // Acquire lock
        const lockAcquired = await acquireLock(orgId, targetMonth, lockToken);
        if (!lockAcquired) {
          logEvent({
            tag: "[BILLING][CRON][CLOSE_MONTH][LOCKED]",
            ts: Date.now(),
            stage: "COST",
            source: "system",
            org_id: orgId,
            severity: "info",
            details: {
              month: targetMonth,
            },
          });
          stats.skipped++;
          continue;
        }

        try {
          // Load the single billing_invoice_runs row by org_id+month
          const { data: invoiceRun } = await supabaseAdmin
            .from("billing_invoice_runs")
            .select("stripe_invoice_id, status")
            .eq("org_id", orgId)
            .eq("month", targetMonth)
            .maybeSingle<{ stripe_invoice_id: string | null; status: string | null }>();

          let stripe_invoice_id: string | null = null;
          let shouldFinalize = false;

          if (invoiceRun?.stripe_invoice_id) {
            // Invoice exists in DB, retrieve from Stripe to check status
            try {
              const invoice = await stripe.invoices.retrieve(invoiceRun.stripe_invoice_id);
              stripe_invoice_id = invoice.id;

              const invoiceStatus = invoice.status as string;
              if (invoiceStatus !== "draft") {
                // Invoice already finalized/paid/etc - DO NOT create new invoice
                // Update DB status/finalized_at as needed
                const dbStatus =
                  invoiceStatus === "open"
                    ? "open"
                    : invoiceStatus === "paid"
                    ? "paid"
                    : invoiceStatus === "uncollectible"
                    ? "uncollectible"
                    : invoiceStatus === "void"
                    ? "void"
                    : "error";

                await supabaseAdmin
                  .from("billing_invoice_runs")
                  .update({
                    finalized_at: invoice.status_transitions?.finalized_at
                      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
                      : invoice.status !== "draft"
                      ? new Date().toISOString()
                      : null,
                    status: dbStatus,
                  })
                  .eq("org_id", orgId)
                  .eq("month", targetMonth);

                logEvent({
                  tag: "[BILLING][CRON][CLOSE_MONTH][ALREADY_FINALIZED]",
                  ts: Date.now(),
                  stage: "COST",
                  source: "system",
                  org_id: orgId,
                  severity: "info",
                  details: {
                    month: targetMonth,
                    stripe_invoice_id: stripe_invoice_id,
                    stripe_status: invoiceStatus,
                  },
                });
                stats.skipped++;
                continue;
              } else if (invoiceStatus === "draft") {
                // Invoice is draft, proceed to finalize
                shouldFinalize = true;
              } else {
                // Unknown status, skip
                stats.skipped++;
                continue;
              }
            } catch (stripeErr) {
              // Stripe invoice not found or error retrieving
              const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Failed to retrieve invoice";
              logEvent({
                tag: "[BILLING][CRON][CLOSE_MONTH][STRIPE_RETRIEVE_ERROR]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: orgId,
                severity: "error",
                details: {
                  month: targetMonth,
                  stripe_invoice_id: invoiceRun.stripe_invoice_id,
                  error: errorMsg,
                },
              });
              stats.failed++;
              continue;
            }
          } else {
            // No invoice exists, create draft invoice
            const draftResult = await ensureDraftInvoice(stripe, orgId, targetMonth);
            stripe_invoice_id = draftResult.stripe_invoice_id;

            if (!stripe_invoice_id || draftResult.status !== "draft") {
              logEvent({
                tag: "[BILLING][CRON][CLOSE_MONTH][NO_DRAFT]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: orgId,
                severity: "warn",
                details: {
                  month: targetMonth,
                  status: draftResult.status,
                },
              });
              stats.skipped++;
              continue;
            }

            // Draft created, proceed to finalize
            shouldFinalize = true;
          }

          // Finalize invoice if needed
          if (shouldFinalize && stripe_invoice_id) {
            const { finalized, error: finalizeError } = await finalizeInvoice(
              stripe,
              stripe_invoice_id
            );

            if (!finalized) {
              await supabaseAdmin
                .from("billing_invoice_runs")
                .update({
                  status: "error",
                  error_message: finalizeError || "Failed to finalize",
                })
                .eq("org_id", orgId)
                .eq("month", targetMonth);

              logEvent({
                tag: "[BILLING][CRON][CLOSE_MONTH][FINALIZE_ERROR]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: orgId,
                severity: "error",
                details: {
                  month: targetMonth,
                  stripe_invoice_id: stripe_invoice_id,
                  error: finalizeError,
                },
              });
              stats.failed++;
              continue;
            }

            // Update DB with finalized status
            await supabaseAdmin
              .from("billing_invoice_runs")
              .update({
                finalized_at: new Date().toISOString(),
                status: "open",
              })
              .eq("org_id", orgId)
              .eq("month", targetMonth);

            logEvent({
              tag: "[BILLING][CRON][CLOSE_MONTH][FINALIZED]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              org_id: orgId,
              severity: "info",
              details: {
                month: targetMonth,
                stripe_invoice_id: stripe_invoice_id,
              },
            });
            stats.processed++;
          }
        } finally {
          // Always release lock
          await releaseLock(orgId, targetMonth, lockToken);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        logEvent({
          tag: "[BILLING][CRON][CLOSE_MONTH][ORG_ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            month: targetMonth,
            error: errorMsg,
          },
        });
        stats.failed++;
        
        // Release lock on error
        try {
          await releaseLock(orgId, targetMonth, lockToken);
        } catch {
          // Ignore lock release errors
        }
      }
    }

    // 6) Return summary
    logEvent({
      tag: "[BILLING][CRON][CLOSE_MONTH][COMPLETE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "info",
      details: {
        month: targetMonth,
        ...stats,
      },
    });

    return NextResponse.json({
      month: targetMonth,
      ...stats,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logEvent({
      tag: "[BILLING][CRON][CLOSE_MONTH][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/cron/close-month
 * 
 * Cron-secured endpoint to finalize and collect invoices for the previous month.
 * Idempotent: safe to run multiple times.
 * 
 * Supports Vercel Cron Jobs (Authorization: Bearer <CRON_SECRET>).
 * Also supports manual testing (x-cron-secret or cron-secret header).
 * 
 * Query params: ?month=YYYY-MM-01 (optional, defaults to previous month)
 */
export async function GET(req: NextRequest) {
  // 1) Verify cron secret
  if (!verifyCronSecret(req)) {
    logEvent({
      tag: "[BILLING][CRON][UNAUTHORIZED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "warn",
      details: {
        ip: req.headers.get("x-forwarded-for") || "unknown",
        method: "GET",
      },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return closeMonthHandler(req);
}

/**
 * POST /api/billing/cron/close-month
 * 
 * Cron-secured endpoint to finalize and collect invoices for the previous month.
 * Idempotent: safe to run multiple times.
 * 
 * Supports manual testing (x-cron-secret or cron-secret header).
 * Also supports Vercel Cron Jobs (Authorization: Bearer <CRON_SECRET>).
 * 
 * Query params: ?month=YYYY-MM-01 (optional, defaults to previous month)
 */
export async function POST(req: NextRequest) {
  // 1) Verify cron secret
  if (!verifyCronSecret(req)) {
    logEvent({
      tag: "[BILLING][CRON][UNAUTHORIZED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "warn",
      details: {
        ip: req.headers.get("x-forwarded-for") || "unknown",
        method: "POST",
      },
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return closeMonthHandler(req);
}
