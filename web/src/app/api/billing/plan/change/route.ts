import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { VOICE_PLAN_CODES } from "@/lib/billing/chatPlanKeys";
import { guard } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";

const RequestSchema = z.object({
  // Voice plans only, on purpose: moving an existing workspace onto `chat_only` would
  // strand the phone number it is already paying for. That is a migration, not a switch.
  plan_code: z.enum(VOICE_PLAN_CODES),
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
 * POST /api/billing/plan/change
 * 
 * Changes the plan for authenticated user's organization.
 * Updates org_plan_overrides and marks current month invoice as stale.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate AND authorize. Being signed in was never enough here: this route moves a
    // workspace between a $149 and an $899 plan, and until the capability check landed a `viewer`
    // could do it. `manage_billing` is owner/admin — see lib/auth/permissions.ts.
    const gate = await guard("manage_billing");
    if (!gate.ok) return gate.response;
    const org_id = gate.viewer.orgId;

    // 2) Read the plan we are leaving, so the audit row can say what changed rather than only
    // what it became. Best-effort: a missing override row simply means "on the catalogue plan".
    const { data: previousOverride } = await supabaseAdmin
      .from("org_plan_overrides")
      .select("plan_code")
      .eq("org_id", org_id)
      .maybeSingle<{ plan_code: string | null }>();

    // 3) Parse and validate request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { plan_code } = parseResult.data;

    // 4) Upsert org_plan_overrides
    const { error: overrideError } = await supabaseAdmin
      .from("org_plan_overrides")
      .upsert(
        {
          org_id: org_id,
          plan_code: plan_code,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    if (overrideError) {
      logEvent({
        tag: "[BILLING][PLAN_CHANGE][OVERRIDE_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          plan_code: plan_code,
          error: overrideError.message,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Failed to update plan override" },
        { status: 500 }
      );
    }

    // 5) Mark current month invoice run as stale
    const currentMonth = getCurrentMonthStart();
    await supabaseAdmin
      .from("billing_invoice_runs")
      .update({
        status: "stale",
        stripe_invoice_id: null,
      })
      .eq("org_id", org_id)
      .eq("month", currentMonth);

    // 6) Log event
    logEvent({
      tag: "[BILLING][PLAN_CHANGE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        plan_code: plan_code,
        month: currentMonth,
      },
    });

    // 7) Record it in the audit log. The Audit page told customers it covered "plan changes"
    // while nothing on this path ever wrote a row — the most expensive action in the product was
    // the least traceable one. Never throws (logAuditEvent swallows its own errors); the plan
    // change already happened and must not be reported as failed because a log write did not.
    await logAuditEvent({
      org_id,
      actor_user_id: gate.viewer.profileId,
      action: "billing.plan.change",
      entity_type: "billing.plan",
      entity_id: org_id,
      diff: { plan_code: { before: previousOverride?.plan_code ?? null, after: plan_code } },
    });

    // 8) Return success
    return NextResponse.json({
      ok: true,
      plan_code: plan_code,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][PLAN_CHANGE][ERROR]",
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
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
