import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireBasicAuth } from "@/lib/auth/basic";
import { ensureAssistantConfig } from "@/lib/vapi/assistantConfig";
import { logEvent } from "@/lib/observability/logEvent";

export const dynamic = "force-dynamic";

/** Where a reconcile target was found. An assistant can be named by more than one. */
export type AssistantSource = "agents" | "phone_lines" | "phone_lines_paused";

export type AssistantTarget = { assistantId: string; sources: AssistantSource[] };

type AgentRow = { vapi_assistant_id?: string | null };
type PhoneLineRow = {
  vapi_assistant_id?: string | null;
  vapi_assistant_id_paused_backup?: string | null;
};

/**
 * Build the set of assistants to reconcile, from BOTH tables that can name one.
 *
 * `agents` is the obvious source and used to be the only one. It is not sufficient: on
 * 2026-09-03 a reconcile pass reported 3/3 succeeded while a FOURTH assistant
 * (`ca9cf616…`) sat on a `live` phone line answering a real number. Its id lived in
 * `phone_lines.vapi_assistant_id` and it had no `agents` row at all, so iterating `agents`
 * could never reach it — and the failure is silent in exactly the wrong way: the response
 * says `ok: true`, because every row it knew about did succeed.
 *
 * `vapi_assistant_id_paused_backup` is included deliberately. A paused workspace has its
 * line PATCHed to `assistantId: null` and the real id parked in the backup column; that
 * assistant is not answering today but will the moment billing resumes, and an assistant
 * missing its tools is not something anyone will think to check at un-pause time.
 *
 * Pure and exported so the union is pinned by a test — the bug this fixes was a wrong SET,
 * not a wrong PATCH, and a test that mocks Vapi would not have caught it.
 */
export function collectAssistantTargets(
  agents: AgentRow[],
  phoneLines: PhoneLineRow[],
): AssistantTarget[] {
  const byId = new Map<string, AssistantTarget>();

  const add = (id: string | null | undefined, source: AssistantSource) => {
    if (typeof id !== "string") return;
    const assistantId = id.trim();
    if (!assistantId) return;
    const existing = byId.get(assistantId);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    byId.set(assistantId, { assistantId, sources: [source] });
  };

  for (const agent of agents) add(agent.vapi_assistant_id, "agents");
  for (const line of phoneLines) {
    add(line.vapi_assistant_id, "phone_lines");
    add(line.vapi_assistant_id_paused_backup, "phone_lines_paused");
  }

  return [...byId.values()];
}

/**
 * POST /api/internal/reconcile-vapi-assistants  (Basic Auth — platform operators)
 *
 * The R-050 / R-077 reconciliation pass. Existing Vapi assistants were created before
 * the shared config helper existed, so they may be missing tools from `DENKU_TOOL_IDS`
 * and/or point their webhook `server.url` at a stale (localhost) address. This re-applies
 * `ensureAssistantConfig` to every assistant this workspace knows about — idempotent
 * (toolIds are merged, not replaced), so it is safe to run repeatedly. Run it once after
 * deploy, ideally right before flipping `VAPI_WEBHOOK_AUTH_MODE=enforce`, so every line
 * sends the `x-vapi-secret` header.
 *
 * Targets come from `agents` AND `phone_lines` — see `collectAssistantTargets` for why
 * the second one is not optional.
 *
 * NOTE: this PATCHes live Vapi assistants. Verify the result with a test call before
 * relying on it (per the sprint's verify-before-write guardrail).
 */
export async function POST(req: NextRequest) {
  if (!requireBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [agentsResult, linesResult] = await Promise.all([
      supabaseAdmin.from("agents").select("id, org_id, vapi_assistant_id"),
      supabaseAdmin
        .from("phone_lines")
        .select("id, org_id, vapi_assistant_id, vapi_assistant_id_paused_backup"),
    ]);

    // Either table failing means an incomplete pass. Reporting `ok: true` over a partial
    // set is precisely the failure mode this endpoint just had, so refuse instead.
    if (agentsResult.error) {
      return NextResponse.json(
        { ok: false, error: `agents: ${agentsResult.error.message}` },
        { status: 500 },
      );
    }
    if (linesResult.error) {
      return NextResponse.json(
        { ok: false, error: `phone_lines: ${linesResult.error.message}` },
        { status: 500 },
      );
    }

    const targets = collectAssistantTargets(
      (agentsResult.data ?? []) as AgentRow[],
      (linesResult.data ?? []) as PhoneLineRow[],
    );

    let succeeded = 0;
    const failures: { assistantId: string; sources: AssistantSource[]; error: string }[] = [];
    const reconciled: { assistantId: string; sources: AssistantSource[] }[] = [];

    for (const target of targets) {
      const result = await ensureAssistantConfig({ assistantId: target.assistantId });
      if (result.ok) {
        succeeded += 1;
        reconciled.push({ assistantId: target.assistantId, sources: target.sources });
      } else {
        failures.push({
          assistantId: target.assistantId,
          sources: target.sources,
          error: result.error ?? "unknown",
        });
      }
    }

    // An assistant found ONLY on a phone line is a workspace whose `agents` row is missing.
    // It is not this endpoint's job to fix that, but it should be visible rather than
    // discovered by a customer, so it is counted and logged.
    const untrackedByAgents = targets.filter((t) => !t.sources.includes("agents"));

    logEvent({
      tag: "[INTERNAL][RECONCILE_ASSISTANTS]",
      ts: Date.now(),
      stage: "TOOL",
      source: "system",
      severity: failures.length > 0 || untrackedByAgents.length > 0 ? "warn" : "info",
      details: {
        total: targets.length,
        succeeded,
        failed: failures.length,
        untrackedByAgents: untrackedByAgents.map((t) => t.assistantId),
      },
    });

    return NextResponse.json({
      ok: failures.length === 0,
      total: targets.length,
      succeeded,
      failed: failures.length,
      failures,
      reconciled,
      untrackedByAgents: untrackedByAgents.map((t) => t.assistantId),
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
