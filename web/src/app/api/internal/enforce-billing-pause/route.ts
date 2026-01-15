import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/observability/logEvent";
import { requireBasicAuth } from "@/lib/auth/basic";
import { enforceTelephonyPause } from "@/lib/workspace/enforcePause";

const BodySchema = z.object({
  orgId: z.string().uuid(),
});

/**
 * POST /api/internal/enforce-billing-pause
 * 
 * Internal repair endpoint to enforce telephony pause for already-paused orgs.
 * Uses the shared enforceTelephonyPause() function to ensure VAPI state matches DB state.
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

    // Call shared enforcement function (reads DB and enforces VAPI state)
    const result = await enforceTelephonyPause(orgId);

    logEvent({
      tag: "[INTERNAL][ENFORCE_PAUSE]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        message: result.message,
        action: "enforce_telephony_pause",
      },
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
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
