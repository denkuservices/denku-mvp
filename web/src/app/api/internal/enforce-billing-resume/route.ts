import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/observability/logEvent";
import { requireBasicAuth } from "@/lib/auth/basic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rebindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

const BodySchema = z.object({
  orgId: z.string().uuid(),
});

/**
 * POST /api/internal/enforce-billing-resume
 * 
 * Internal repair endpoint to enforce telephony resume for active orgs.
 * Uses the shared rebindOrgPhoneNumbers() function to restore VAPI phone number bindings.
 * 
 * Purpose: Fix already-active orgs deterministically (enforce VAPI phone number rebind).
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

    // Read organization_settings to check resume state
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

    // Guard: Only resume if org is active and not paused
    // If workspace_status != 'active' OR paused_reason IS NOT NULL -> cannot resume telephony
    if (workspaceStatus !== "active" || pausedReason !== null) {
      return NextResponse.json(
        {
          ok: false,
          message: "Org not active; cannot resume telephony",
          workspace_status: workspaceStatus,
          paused_reason: pausedReason,
        },
        { status: 409 }
      );
    }

    // Get agent count for logging
    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("org_id", orgId)
      .not("vapi_assistant_id", "is", null)
      .not("vapi_phone_number_id", "is", null);
    const numbersToRebind = agents?.length ?? 0;

    // Call shared rebind function (has guard - will not rebind if still paused)
    await rebindOrgPhoneNumbers(orgId);

    logEvent({
      tag: "[INTERNAL][ENFORCE_RESUME]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        workspace_status: workspaceStatus,
        paused_reason: pausedReason,
        numbers_rebound: numbersToRebind,
        message: "Phone numbers rebound successfully",
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Phone numbers rebound successfully",
      workspace_status: workspaceStatus,
      paused_reason: pausedReason,
      numbers_rebound: numbersToRebind,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logEvent({
      tag: "[INTERNAL][ENFORCE_RESUME][ERROR]",
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

// Return 405 for non-POST methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
