import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

const RequestSchema = z.object({
  org_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/).optional(), // YYYY-MM-01 format
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

    const { org_id, month } = parseResult.data;
    const invoiceMonth = month || getCurrentMonthStart();

    // 1) Check idempotency: if billing_invoice_runs exists with stripe_invoice_id, return it
    const { data: existingRun } = await supabaseAdmin
      .from("billing_invoice_runs")
      .select("stripe_invoice_id, estimated_total_due_usd")
      .eq("org_id", org_id)
      .eq("month", invoiceMonth)
      .maybeSingle<{
        stripe_invoice_id: string | null;
        estimated_total_due_usd: number | null;
      }>();

    if (existingRun?.stripe_invoice_id) {
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

    // 2) Read billing truth from org_monthly_invoice_preview
    const { data: preview, error: previewError } = await supabaseAdmin
      .from("org_monthly_invoice_preview")
      .select(
        "plan_code, monthly_fee_usd, estimated_overage_cost_usd, overage_minutes, overage_rate_usd_per_min, estimated_total_due_usd"
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

    // 3) Initialize Stripe client
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

    // 4) Ensure Stripe customer exists
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

    // 5) Fetch Stripe monthly price ID from billing_stripe_prices (for future use, not used in invoice items)
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

    // 6) Create draft invoice
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

    // 7) Persist run in billing_invoice_runs (composite key: org_id, month)
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

    // 8) Return success response
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
