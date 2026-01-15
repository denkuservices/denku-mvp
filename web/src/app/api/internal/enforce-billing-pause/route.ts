import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { unbindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";
import { logEvent } from "@/lib/observability/logEvent";
import { requireBasicAuth } from "@/lib/auth/basic";

const BodySchema = z.object({
  orgId: z.string().uuid(),
});

/**
 * POST /api/internal/enforce-billing-pause
 * 
 * Internal repair endpoint to enforce telephony pause for already-paused orgs.
 * If org is billing-paused (workspace_status='paused' and paused_reason in 'hard_cap','past_due'),
 * unbinds phone numbers from assistants.
 * 
 * Purpose: Fix already-paused orgs deterministically (enforce VAPI phone number unbind).
 * Protected with Basic Auth (ADMIN_USER/ADMIN_PASS).
 */
export async function POST(req: NextRequest) {
  // Auth: Basic Auth required
  if (!requireBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { orgId } = parsed.data;

    // Read organization_settings to check pause status
    const { data: orgSettings, error: settingsErr } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{
        workspace_status: "active" | "paused" | null;
        paused_reason: "manual" | "hard_cap" | "past_due" | null;
      }>();

    if (settingsErr) {
      return NextResponse.json(
        { error: `Failed to read org settings: ${settingsErr.message}` },
        { status: 500 }
      );
    }

    if (!orgSettings) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const workspaceStatus = orgSettings.workspace_status ?? "active";
    const pausedReason = orgSettings.paused_reason;

    // Only unbind if org is billing-paused
    const isBillingPaused =
      workspaceStatus === "paused" &&
      (pausedReason === "hard_cap" || pausedReason === "past_due");

    if (!isBillingPaused) {
      return NextResponse.json({
        ok: true,
        message: "Organization is not billing-paused, no action needed",
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
      });
    }

    // Unbind phone numbers
    await unbindOrgPhoneNumbers(orgId, pausedReason);

    logEvent({
      tag: "[INTERNAL][ENFORCE_PAUSE]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        action: "unbind_phone_numbers",
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Phone numbers unbound successfully",
      workspace_status: workspaceStatus,
      paused_reason: pausedReason,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logEvent({
      tag: "[INTERNAL][ENFORCE_PAUSE][ERROR]",
      ts: Date.now(),
      stage: "CALL",
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
