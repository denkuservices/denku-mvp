import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminOrOwner } from "@/lib/analytics/params";

const RequestSchema = z.object({
  org_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).optional(), // YYYY-MM-01 format
  force_recompute: z.boolean().optional(), // Admin testing knob
});

/**
 * Get current month start in UTC (YYYY-MM-01 format).
 */
function getCurrentMonthStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Initialize Stripe client (throws if STRIPE_SECRET_KEY missing).
 */
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

/**
 * Ensure Stripe customer exists for org_id.
 * Creates customer if missing and stores mapping in billing_stripe_customers.
 */
async function ensureStripeCustomer(
  stripe: Stripe,
  orgId: string
): Promise<string> {
  // Check existing mapping
  const { data: existing } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    name: orgId, // Use org_id as name (no email required)
    metadata: {
      org_id: orgId,
    },
  });

  // Store mapping
  await supabaseAdmin
    .from("billing_stripe_customers")
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: customer.id,
      },
      {
        onConflict: "org_id",
      }
    );

  return customer.id;
}

/**
 * POST /api/billing/stripe/create-draft-invoice
 * 
 * Creates a draft Stripe invoice for an organization's monthly billing.
 * Idempotent: if invoice already exists, returns existing invoice ID.
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid JSON body",
        },
        { status: 200 }
      );
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          status: "error",
          message: "Validation failed",
          details: parseResult.error.issues,
        },
        { status: 200 }
      );
    }

    const { org_id, month, force_recompute: requestedForceRecompute } = parseResult.data;
    const invoiceMonth = month || getCurrentMonthStart();

    // 0) Authorization check for force_recompute
    let force_recompute = requestedForceRecompute ?? false;
    if (force_recompute) {
      try {
        // Get authenticated user
        const supabase = await createSupabaseServerClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          // Not authenticated - deny force_recompute
          force_recompute = false;
          logEvent({
            tag: "[BILLING][FORCE_RECOMPUTE_DENIED]",
            ts: Date.now(),
            stage: "COST",
            source: "system",
            org_id: org_id,
            severity: "warn",
            details: {
              month: invoiceMonth,
              reason: "not_authenticated",
            },
          });
        } else {
          // Get profile and org_id
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, org_id")
            .eq("auth_user_id", user.id)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);

          const profile = profiles && profiles.length > 0 ? profiles[0] : null;
          const profileId = profile?.id ?? null;
          const userOrgId = profile?.org_id ?? null;

          // Verify org_id matches and user is admin/owner
          if (!profileId || userOrgId !== org_id) {
            force_recompute = false;
            logEvent({
              tag: "[BILLING][FORCE_RECOMPUTE_DENIED]",
              ts: Date.now(),
              stage: "COST",
              source: "system",
              org_id: org_id,
              severity: "warn",
              details: {
                month: invoiceMonth,
                reason: "org_mismatch_or_no_profile",
                user_org_id: userOrgId,
              },
            });
          } else {
            const isAuthorized = await isAdminOrOwner(org_id, profileId);
            if (!isAuthorized) {
              force_recompute = false;
              logEvent({
                tag: "[BILLING][FORCE_RECOMPUTE_DENIED]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: org_id,
                severity: "warn",
                details: {
                  month: invoiceMonth,
                  reason: "not_admin_or_owner",
                  profile_id: profileId,
                },
              });
            } else {
              logEvent({
                tag: "[BILLING][FORCE_RECOMPUTE_OK]",
                ts: Date.now(),
                stage: "COST",
                source: "system",
                org_id: org_id,
                severity: "info",
                details: {
                  month: invoiceMonth,
                  profile_id: profileId,
                },
              });
            }
          }
        }
      } catch (authErr) {
        // Non-blocking: if auth check fails, deny force_recompute
        force_recompute = false;
        logEvent({
          tag: "[BILLING][FORCE_RECOMPUTE_DENIED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id,
          severity: "warn",
          details: {
            month: invoiceMonth,
            reason: "auth_check_error",
            error: authErr instanceof Error ? authErr.message : String(authErr),
          },
        });
      }
    }

    // 1) Check idempotency: if billing_invoice_runs exists with stripe_invoice_id AND status='draft', return it
    // BUT if force_recompute=true OR status is 'stale'/'blocked' OR stripe_invoice_id is null, proceed to recompute
    if (!force_recompute) {
      const { data: existingRun } = await supabaseAdmin
        .from("billing_invoice_runs")
        .select("stripe_invoice_id, estimated_total_due_usd, status")
        .eq("org_id", org_id)
        .eq("month", invoiceMonth)
        .maybeSingle<{
          stripe_invoice_id: string | null;
          estimated_total_due_usd: number | null;
          status: string | null;
        }>();

      // Only return early if we have a valid draft invoice
      if (
        existingRun?.stripe_invoice_id &&
        existingRun.status === "draft"
      ) {
        logEvent({
          tag: "[BILLING][INVOICE][IDEMPOTENT_HIT]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id,
          severity: "info",
          details: {
            month: invoiceMonth,
            stripe_invoice_id: existingRun.stripe_invoice_id,
          },
        });

        return NextResponse.json({
          status: "draft",
          stripe_invoice_id: existingRun.stripe_invoice_id,
          estimated_total_due_usd: existingRun.estimated_total_due_usd ?? 0,
        });
      }
    }

    // 2) Read billing truth from org_monthly_invoice_preview
    const { data: preview, error: previewError } = await supabaseAdmin
      .from("org_monthly_invoice_preview")
      .select(
        "plan_code, monthly_fee_usd, estimated_overage_cost_usd, overage_minutes, overage_rate_usd_per_min, estimated_total_due_usd, billable_minutes, concurrency_limit"
      )
      .eq("org_id", org_id)
      .eq("month", invoiceMonth)
      .maybeSingle<{
        plan_code: string | null;
        monthly_fee_usd: number | null;
        estimated_overage_cost_usd: number | null;
        overage_minutes: number | null;
        overage_rate_usd_per_min: number | null;
        estimated_total_due_usd: number | null;
        billable_minutes: number | null;
        concurrency_limit: number | null;
      }>();

    if (previewError || !preview) {
      const errorMsg = previewError?.message || "No invoice preview found";
      logEvent({
        tag: "[BILLING][INVOICE][PREVIEW_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          month: invoiceMonth,
          error: errorMsg,
        },
      });

      // Upsert error state (composite key: org_id, month)
      await supabaseAdmin
        .from("billing_invoice_runs")
        .upsert(
          {
            org_id: org_id,
            month: invoiceMonth,
            estimated_total_due_usd: null,
            stripe_invoice_id: null,
            status: "error",
          },
          { onConflict: "org_id,month" }
        )
        .select();

      return NextResponse.json(
        {
          status: "error",
          message: errorMsg,
        },
        { status: 200 }
      );
    }

    // 3) Fetch billing guardrails via RPC
    type Guardrails = {
      max_billable_minutes_per_month: number;
      max_estimated_total_due_usd_per_month: number;
      spike_multiplier: number;
    };

    let guardrails: Guardrails | null = null;

    try {
      const { data, error: guardrailsError } = await supabaseAdmin.rpc(
        "get_billing_guardrails",
        { p_org_id: org_id }
      );

      if (!guardrailsError && data) {
        // Normalize RPC response (handle array or object)
        const raw = data;
        const row = Array.isArray(raw) ? raw[0] : raw;
        
        if (row) {
          guardrails = {
            max_billable_minutes_per_month: Number((row as any).max_billable_minutes_per_month ?? 0),
            max_estimated_total_due_usd_per_month: Number((row as any).max_estimated_total_due_usd_per_month ?? 0),
            spike_multiplier: Number((row as any).spike_multiplier ?? 0),
          };

          // Log raw guardrails for debugging
          logEvent({
            tag: "[BILLING][GUARDRAIL][RAW]",
            ts: Date.now(),
            stage: "COST",
            source: "system",
            org_id: org_id,
            severity: "info",
            details: {
              month: invoiceMonth,
              raw_type: typeof raw,
              is_array: Array.isArray(raw),
              raw_keys: row ? Object.keys(row) : [],
              normalized: guardrails,
            },
          });
        }
      }
    } catch (guardrailsErr) {
      // Non-blocking: log but continue
      logEvent({
        tag: "[BILLING][GUARDRAIL][FETCH_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          month: invoiceMonth,
          error: guardrailsErr instanceof Error ? guardrailsErr.message : String(guardrailsErr),
        },
      });
    }

    // 4) Guardrails check - if missing, log and skip blocking (allow invoice creation)
    if (!guardrails) {
      logEvent({
        tag: "[BILLING][GUARDRAIL_MISSING]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: invoiceMonth,
          org_id: org_id,
        },
      });
      // Skip hard-cap checks entirely and proceed to invoice creation
    } else {
      // 4a) Hard cap enforcement (blocking) - MUST execute BEFORE Stripe invoice creation
      // Coerce all values to numbers safely
      const billableMinutes = Number(preview?.billable_minutes ?? 0);
      const estDue = Number(preview?.estimated_total_due_usd ?? 0);
      // Use normalized guardrails values (already numbers, never null)
      const capMinutes = guardrails.max_billable_minutes_per_month;
      const capAmount = guardrails.max_estimated_total_due_usd_per_month;

      // Check for NaN and log parse errors (guardrails values are already normalized)
      if (
        !Number.isFinite(billableMinutes) ||
        !Number.isFinite(estDue) ||
        !Number.isFinite(capMinutes) ||
        !Number.isFinite(capAmount)
      ) {
      logEvent({
        tag: "[BILLING][GUARDRAIL][PARSE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          month: invoiceMonth,
          raw_billable_minutes: preview?.billable_minutes,
          raw_estimated_total_due_usd: preview?.estimated_total_due_usd,
          normalized_cap_minutes: guardrails.max_billable_minutes_per_month,
          normalized_cap_amount: guardrails.max_estimated_total_due_usd_per_month,
          billableMinutes: Number.isFinite(billableMinutes) ? billableMinutes : 0,
          estDue: Number.isFinite(estDue) ? estDue : 0,
          capMinutes: Number.isFinite(capMinutes) ? capMinutes : 0,
          capAmount: Number.isFinite(capAmount) ? capAmount : 0,
        },
      });
      }

      // Use safe coerced values (treat NaN as 0)
      const safeBillableMinutes = Number.isFinite(billableMinutes) ? billableMinutes : 0;
      const safeEstDue = Number.isFinite(estDue) ? estDue : 0;
      const safeCapMinutes = Number.isFinite(capMinutes) ? capMinutes : 0;
      const safeCapAmount = Number.isFinite(capAmount) ? capAmount : 0;

      // Check billable_minutes cap (blocking)
      if (safeBillableMinutes > capMinutes) {
        // Insert anomaly event (use normalized guardrails value, never 0 fallback)
        try {
          await supabaseAdmin.from("billing_anomaly_events").insert({
            org_id: org_id,
            month: invoiceMonth,
            severity: "block",
            type: "minutes_cap",
            details: {
              billable_minutes: safeBillableMinutes,
              cap: guardrails.max_billable_minutes_per_month,
            },
          });
        } catch (anomalyErr) {
          // Non-blocking: log but continue
          console.error("[BILLING] Failed to insert anomaly event:", anomalyErr);
        }

        logEvent({
          tag: "[BILLING][GUARDRAIL_BLOCKED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id,
          severity: "warn",
          details: {
            month: invoiceMonth,
            type: "minutes_cap",
            billable_minutes: safeBillableMinutes,
            cap: guardrails.max_billable_minutes_per_month,
          },
        });

        // Upsert blocked state
        await supabaseAdmin
          .from("billing_invoice_runs")
          .upsert(
            {
              org_id: org_id,
              month: invoiceMonth,
              estimated_total_due_usd: safeEstDue > 0 ? safeEstDue : null,
              stripe_invoice_id: null,
              status: "blocked",
            },
            { onConflict: "org_id,month" }
          )
          .select();

        return NextResponse.json(
          {
            status: "blocked",
            reason: "minutes_cap",
            cap: guardrails.max_billable_minutes_per_month,
            value: safeBillableMinutes,
          },
          { status: 200 }
        );
      }

      // Check estimated_total_due_usd cap (blocking)
      if (safeEstDue > capAmount) {
        // Insert anomaly event (use normalized guardrails value, never 0 fallback)
        try {
          await supabaseAdmin.from("billing_anomaly_events").insert({
            org_id: org_id,
            month: invoiceMonth,
            severity: "block",
            type: "amount_cap",
            details: {
              estimated_total_due_usd: safeEstDue,
              cap: guardrails.max_estimated_total_due_usd_per_month,
            },
          });
        } catch (anomalyErr) {
          // Non-blocking: log but continue
          console.error("[BILLING] Failed to insert anomaly event:", anomalyErr);
        }

        logEvent({
          tag: "[BILLING][GUARDRAIL_BLOCKED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id,
          severity: "warn",
          details: {
            month: invoiceMonth,
            type: "amount_cap",
            estimated_total_due_usd: safeEstDue,
            cap: guardrails.max_estimated_total_due_usd_per_month,
          },
        });

        // Upsert blocked state
        await supabaseAdmin
          .from("billing_invoice_runs")
          .upsert(
            {
              org_id: org_id,
              month: invoiceMonth,
              estimated_total_due_usd: safeEstDue > 0 ? safeEstDue : null,
              stripe_invoice_id: null,
              status: "blocked",
            },
            { onConflict: "org_id,month" }
          )
          .select();

        return NextResponse.json(
          {
            status: "blocked",
            reason: "amount_cap",
            cap: guardrails.max_estimated_total_due_usd_per_month,
            value: safeEstDue,
          },
          { status: 200 }
        );
      }

      // Log guardrail OK if we passed all checks (BEFORE Stripe invoice creation)
      logEvent({
        tag: "[BILLING][GUARDRAIL_OK]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          month: invoiceMonth,
          billableMinutes: safeBillableMinutes,
          capMinutes: guardrails.max_billable_minutes_per_month,
          estDue: safeEstDue,
          capAmount: guardrails.max_estimated_total_due_usd_per_month,
          hasGuardrails: true,
        },
      });
    }

    // 5) Anomaly detection (non-blocking, log-only)
    if (guardrails && guardrails.spike_multiplier !== null) {
      try {
        // Get today's date (UTC)
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

        // Get date 7 days ago (excluding today)
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

        // Fetch org_daily_usage for last 7 days (excluding today) and today
        const { data: dailyUsage } = await supabaseAdmin
          .from("org_daily_usage")
          .select("date, billable_minutes, total_cost_usd, peak_concurrent_calls")
          .eq("org_id", org_id)
          .gte("date", sevenDaysAgoStr)
          .lte("date", todayStr)
          .order("date", { ascending: true });

        if (dailyUsage && dailyUsage.length > 0) {
          // Separate today from last 7 days
          const todayUsage = dailyUsage.find((u) => u.date === todayStr);
          const last7Days = dailyUsage.filter((u) => u.date !== todayStr);

          if (last7Days.length > 0 && todayUsage) {
            // Compute averages over last 7 days
            const avgBillableMinutes =
              last7Days.reduce((sum, u) => sum + (u.billable_minutes || 0), 0) / last7Days.length;
            const avgTotalCostUsd =
              last7Days.reduce((sum, u) => sum + (u.total_cost_usd || 0), 0) / last7Days.length;

            const spikeThreshold = guardrails.spike_multiplier;

            // Check for sudden spike in billable_minutes
            if (
              todayUsage.billable_minutes &&
              todayUsage.billable_minutes > avgBillableMinutes * spikeThreshold &&
              todayUsage.billable_minutes >= 30
            ) {
              try {
                await supabaseAdmin.from("billing_anomaly_events").insert({
                  org_id: org_id,
                  month: invoiceMonth,
                  severity: "warn",
                  type: "sudden_spike",
                  details: {
                    billable_minutes: todayUsage.billable_minutes,
                    avg_billable_minutes: avgBillableMinutes,
                    multiplier: spikeThreshold,
                  },
                });

                logEvent({
                  tag: "[BILLING][ANOMALY]",
                  ts: Date.now(),
                  stage: "COST",
                  source: "system",
                  org_id: org_id,
                  severity: "warn",
                  details: {
                    month: invoiceMonth,
                    type: "sudden_spike",
                    billable_minutes: todayUsage.billable_minutes,
                    avg_billable_minutes: avgBillableMinutes,
                  },
                });
              } catch (anomalyErr) {
                // Non-blocking: log but continue
                console.error("[BILLING] Failed to insert anomaly event:", anomalyErr);
              }
            }

            // Check for cost spike
            if (
              todayUsage.total_cost_usd &&
              todayUsage.total_cost_usd > avgTotalCostUsd * spikeThreshold &&
              todayUsage.total_cost_usd >= 10
            ) {
              try {
                await supabaseAdmin.from("billing_anomaly_events").insert({
                  org_id: org_id,
                  month: invoiceMonth,
                  severity: "warn",
                  type: "cost_spike",
                  details: {
                    total_cost_usd: todayUsage.total_cost_usd,
                    avg_total_cost_usd: avgTotalCostUsd,
                    multiplier: spikeThreshold,
                  },
                });

                logEvent({
                  tag: "[BILLING][ANOMALY]",
                  ts: Date.now(),
                  stage: "COST",
                  source: "system",
                  org_id: org_id,
                  severity: "warn",
                  details: {
                    month: invoiceMonth,
                    type: "cost_spike",
                    total_cost_usd: todayUsage.total_cost_usd,
                    avg_total_cost_usd: avgTotalCostUsd,
                  },
                });
              } catch (anomalyErr) {
                // Non-blocking: log but continue
                console.error("[BILLING] Failed to insert anomaly event:", anomalyErr);
              }
            }

            // Check for concurrency spike
            if (
              preview.concurrency_limit !== null &&
              todayUsage.peak_concurrent_calls !== null &&
              todayUsage.peak_concurrent_calls > preview.concurrency_limit
            ) {
              try {
                await supabaseAdmin.from("billing_anomaly_events").insert({
                  org_id: org_id,
                  month: invoiceMonth,
                  severity: "warn",
                  type: "concurrency_spike",
                  details: {
                    peak_concurrent_calls: todayUsage.peak_concurrent_calls,
                    concurrency_limit: preview.concurrency_limit,
                  },
                });

                logEvent({
                  tag: "[BILLING][ANOMALY]",
                  ts: Date.now(),
                  stage: "COST",
                  source: "system",
                  org_id: org_id,
                  severity: "warn",
                  details: {
                    month: invoiceMonth,
                    type: "concurrency_spike",
                    peak_concurrent_calls: todayUsage.peak_concurrent_calls,
                    concurrency_limit: preview.concurrency_limit,
                  },
                });
              } catch (anomalyErr) {
                // Non-blocking: log but continue
                console.error("[BILLING] Failed to insert anomaly event:", anomalyErr);
              }
            }
          }
        }
      } catch (anomalyErr) {
        // Non-blocking: log but continue
        logEvent({
          tag: "[BILLING][ANOMALY][ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id,
          severity: "error",
          details: {
            month: invoiceMonth,
            error: anomalyErr instanceof Error ? anomalyErr.message : String(anomalyErr),
          },
        });
      }
    }


    // 6) Initialize Stripe client
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch (stripeInitError) {
      const errorMsg =
        stripeInitError instanceof Error
          ? stripeInitError.message
          : "Failed to initialize Stripe client";

      logEvent({
        tag: "[BILLING][INVOICE][STRIPE_INIT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          month: invoiceMonth,
          error: errorMsg,
        },
      });

      await supabaseAdmin
        .from("billing_invoice_runs")
        .upsert(
          {
            org_id: org_id,
            month: invoiceMonth,
            estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
            stripe_invoice_id: null,
            status: "error",
          },
          { onConflict: "org_id,month" }
        );

      return NextResponse.json(
        {
          status: "error",
          message: errorMsg,
        },
        { status: 200 }
      );
    }

    // 7) Ensure Stripe customer exists
    let stripeCustomerId: string;
    try {
      stripeCustomerId = await ensureStripeCustomer(stripe, org_id);
    } catch (customerError) {
      const errorMsg =
        customerError instanceof Error
          ? customerError.message
          : "Failed to ensure Stripe customer";

      logEvent({
        tag: "[BILLING][INVOICE][CUSTOMER_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          month: invoiceMonth,
          error: errorMsg,
        },
      });

      await supabaseAdmin
        .from("billing_invoice_runs")
        .upsert(
          {
            org_id: org_id,
            month: invoiceMonth,
            estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
            stripe_invoice_id: null,
            status: "error",
          },
          { onConflict: "org_id,month" }
        );

      return NextResponse.json(
        {
          status: "error",
          message: errorMsg,
        },
        { status: 200 }
      );
    }

    // 8) Fetch Stripe monthly price ID from billing_stripe_prices (for future use, not used in invoice items)
    // Note: Recurring prices cannot be used in invoice items, so we use custom amounts instead
    let stripePriceId: string | null = null;
    if (preview.plan_code) {
      const { data: priceRow } = await supabaseAdmin
        .from("billing_stripe_prices")
        .select("stripe_monthly_price_id")
        .eq("plan_code", preview.plan_code)
        .maybeSingle<{ stripe_monthly_price_id: string | null }>();

      stripePriceId = priceRow?.stripe_monthly_price_id ?? null;
    }

    // 9) Create draft invoice
    let stripeInvoiceId: string | null = null;
    try {
      // Create invoice with auto_advance=false (draft)
      const invoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        auto_advance: false, // Draft invoice
        collection_method: "charge_automatically",
        metadata: {
          org_id: org_id,
          month: invoiceMonth,
        },
      });

      stripeInvoiceId = invoice.id;

      // Add invoice item for monthly fee (always use custom amount, not recurring price)
      if (preview.monthly_fee_usd && preview.monthly_fee_usd > 0) {
        const planCodeUpper = preview.plan_code?.toUpperCase() || "PLAN";
        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice: invoice.id,
          amount: Math.round(preview.monthly_fee_usd * 100), // Convert to cents
          currency: "usd",
          description: `${planCodeUpper} Plan – Monthly fee`,
        });
      }

      // Add overage invoice item if applicable
      if (
        preview.estimated_overage_cost_usd &&
        preview.estimated_overage_cost_usd > 0
      ) {
        const overageMinutes = preview.overage_minutes ?? 0;
        const overageRate = preview.overage_rate_usd_per_min ?? 0;

        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice: invoice.id,
          amount: Math.round(preview.estimated_overage_cost_usd * 100), // Convert to cents
          currency: "usd",
          description: `Overage minutes (${overageMinutes} min @ $${overageRate}/min)`,
        });
      }
    } catch (stripeError) {
      const errorMsg =
        stripeError instanceof Error
          ? stripeError.message
          : "Failed to create Stripe invoice";

      logEvent({
        tag: "[BILLING][INVOICE][STRIPE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          month: invoiceMonth,
          error: errorMsg,
          stripe_error_type:
            stripeError instanceof Stripe.errors.StripeError
              ? stripeError.type
              : null,
        },
      });

      // Upsert error state (composite key: org_id, month)
      await supabaseAdmin
        .from("billing_invoice_runs")
        .upsert(
          {
            org_id: org_id,
            month: invoiceMonth,
            estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
            stripe_invoice_id: null,
            status: "error",
          },
          { onConflict: "org_id,month" }
        )
        .select();

      return NextResponse.json(
        {
          status: "error",
          message: errorMsg,
        },
        { status: 200 }
      );
    }

    // 10) Persist run in billing_invoice_runs (composite key: org_id, month)
    await supabaseAdmin
      .from("billing_invoice_runs")
      .upsert(
        {
          org_id: org_id,
          month: invoiceMonth,
          estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
          stripe_invoice_id: stripeInvoiceId,
          status: "draft",
        },
        { onConflict: "org_id,month" }
      )
      .select();

    logEvent({
      tag: "[BILLING][INVOICE][CREATED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        month: invoiceMonth,
        stripe_invoice_id: stripeInvoiceId,
        estimated_total_due_usd: preview.estimated_total_due_usd ?? null,
      },
    });

    // 11) Return success response
    return NextResponse.json({
      status: "draft",
      stripe_invoice_id: stripeInvoiceId,
      estimated_total_due_usd: preview.estimated_total_due_usd ?? 0,
    });
  } catch (err) {
    // Catch-all error handler
    const errorMsg =
      err instanceof Error ? err.message : "Unknown error occurred";

    logEvent({
      tag: "[BILLING][INVOICE][UNEXPECTED_ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        error: errorMsg,
      },
    });

    return NextResponse.json(
      {
        status: "error",
        message: errorMsg,
      },
      { status: 200 }
    );
  }
}
