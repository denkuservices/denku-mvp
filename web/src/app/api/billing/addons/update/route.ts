import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import { z } from "zod";

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
 * Request schema for addon update.
 */
const RequestSchema = z.object({
  addon_key: z.enum(["extra_concurrency", "extra_phone"]),
  qty: z.number().int().min(0).max(100),
});

/**
 * POST /api/billing/addons/update
 * 
 * Updates add-on quantity for authenticated user's organization.
 * Updates billing_org_addons and marks current month invoice as stale.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Get authenticated user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) Get profile and org_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const profile = profiles && profiles.length > 0 ? profiles[0] : null;
    const org_id = profile?.org_id ?? null;

    if (!org_id) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 400 }
      );
    }

    // 3) Check if workspace is billing-paused
    const { data: orgSettings } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", org_id)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: string | null;
      }>();

    const workspaceStatus = orgSettings?.workspace_status ?? "active";
    const pausedReason = orgSettings?.paused_reason;
    const isBillingPaused =
      workspaceStatus === "paused" &&
      (pausedReason === "hard_cap" || pausedReason === "past_due");

    // 4) Parse and validate request body
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

    const { addon_key, qty } = parseResult.data;

    // 5) Get current quantity
    const { data: currentAddon } = await supabaseAdmin
      .from("billing_org_addons")
      .select("qty, status")
      .eq("org_id", org_id)
      .eq("addon_key", addon_key)
      .maybeSingle<{ qty: number; status: string | null }>();

    const currentQty = currentAddon?.qty ? Number(currentAddon.qty) : 0;
    const isIncreasing = qty > currentQty;

    // 6) Block increases if billing-paused (but allow decreases to 0)
    if (isBillingPaused && isIncreasing) {
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][BLOCKED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "warn",
        details: {
          addon_key: addon_key,
          current_qty: currentQty,
          requested_qty: qty,
          paused_reason: pausedReason,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Cannot increase add-ons while billing is paused. Update payment method to resume." },
        { status: 409 }
      );
    }

    // 7) Upsert billing_org_addons
    const upsertData: {
      org_id: string;
      addon_key: string;
      qty: number;
      status: string;
      updated_at: string;
    } = {
      org_id: org_id,
      addon_key: addon_key,
      qty: qty,
      status: qty > 0 ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabaseAdmin
      .from("billing_org_addons")
      .upsert(upsertData, { onConflict: "org_id,addon_key" });

    if (upsertError) {
      logEvent({
        tag: "[BILLING][ADDON_UPDATE][UPSERT_ERROR]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "error",
        details: {
          addon_key: addon_key,
          qty: qty,
          error: upsertError.message,
        },
      });

      return NextResponse.json(
        { ok: false, error: "Failed to update add-on" },
        { status: 500 }
      );
    }

    // 8) Mark current month invoice as stale (invalidate draft invoice)
    const currentMonth = getCurrentMonthStart();
    await supabaseAdmin
      .from("billing_invoice_runs")
      .update({
        status: "stale",
        stripe_invoice_id: null,
      })
      .eq("org_id", org_id)
      .eq("month", currentMonth);

    // 9) Log event
    logEvent({
      tag: "[BILLING][ADDON_UPDATE]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        addon_key: addon_key,
        previous_qty: currentQty,
        new_qty: qty,
        month: currentMonth,
      },
    });

    // 10) Return success
    return NextResponse.json({
      ok: true,
      addon_key: addon_key,
      qty: qty,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    logEvent({
      tag: "[BILLING][ADDON_UPDATE][ERROR]",
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
