import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireBasicAuth } from "@/lib/auth/basic";
import { ensureAssistantConfig } from "@/lib/vapi/assistantConfig";
import { logEvent } from "@/lib/observability/logEvent";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/reconcile-vapi-assistants  (Basic Auth — platform operators)
 *
 * The R-050 / R-077 reconciliation pass. Existing Vapi assistants were created before
 * the shared config helper existed, so they may be missing the create_ticket /
 * create_appointment tools and/or point their webhook `server.url` at a stale
 * (localhost) address. This re-applies `ensureAssistantConfig` to every assistant in
 * the `agents` table — idempotent (toolIds are merged, not replaced), so it is safe to
 * run repeatedly. Run it once after deploy, ideally right before flipping
 * `VAPI_WEBHOOK_AUTH_MODE=enforce`, so every line sends the `x-vapi-secret` header.
 *
 * NOTE: this PATCHes live Vapi assistants. Verify the result with a test call before
 * relying on it (per the sprint's verify-before-write guardrail).
 */
export async function POST(req: NextRequest) {
  if (!requireBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: agents, error } = await supabaseAdmin
      .from("agents")
      .select("id, org_id, vapi_assistant_id")
      .not("vapi_assistant_id", "is", null);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Dedupe by assistant id (guard against duplicate agent rows).
    const seen = new Set<string>();
    const targets = (agents ?? []).filter((a) => {
      const id = a.vapi_assistant_id as string | null;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    let succeeded = 0;
    const failures: { assistantId: string; error: string }[] = [];

    for (const agent of targets) {
      const assistantId = agent.vapi_assistant_id as string;
      const result = await ensureAssistantConfig({ assistantId });
      if (result.ok) {
        succeeded += 1;
      } else {
        failures.push({ assistantId, error: result.error ?? "unknown" });
      }
    }

    logEvent({
      tag: "[INTERNAL][RECONCILE_ASSISTANTS]",
      ts: Date.now(),
      stage: "TOOL",
      source: "system",
      severity: failures.length > 0 ? "warn" : "info",
      details: { total: targets.length, succeeded, failed: failures.length },
    });

    return NextResponse.json({
      ok: failures.length === 0,
      total: targets.length,
      succeeded,
      failed: failures.length,
      failures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent({
      tag: "[INTERNAL][RECONCILE_ASSISTANTS][ERROR]",
      ts: Date.now(),
      stage: "TOOL",
      source: "system",
      severity: "error",
      details: { error: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
