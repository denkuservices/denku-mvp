import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -----------------------------
   Schema
   - message-level passthrough: allows artifact/variables/etc.
   - call passthrough: allows extra Vapi fields
----------------------------- */
const VapiWebhookSchema = z.object({
  message: z
    .object({
      type: z.string(),
      call: z
        .object({
          id: z.string(),
          assistantId: z.string().optional().nullable(),
          phoneNumberId: z.string().optional().nullable(),
          startedAt: z.string().optional().nullable(),
          endedAt: z.string().optional().nullable(),
          transcript: z.string().optional().nullable(),
          from: z.string().optional().nullable(),
          to: z.string().optional().nullable(),
          durationSeconds: z.number().optional().nullable(),
          cost: z.number().optional().nullable(),
        })
        .passthrough()
        .optional()
        .nullable(),
      cost: z.number().optional().nullable(),
      usage: z.any().optional(),
      data: z.any().optional(),
    })
    .passthrough(),
});

/* -----------------------------
   Helpers
----------------------------- */
function normalizePhone(v?: string | null) {
  if (!v) return null;
  const out = v.replace(/[^\d+]/g, "");
  return out ? out : null;
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function computeDurationSec(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.max(0, Math.round((e - s) / 1000));
}

function extractCost(msg: any, call: any): number | null {
  const candidates = [
    msg?.cost,
    call?.cost,
    msg?.usage?.costUsd,
    msg?.usage?.totalCostUsd,
    msg?.data?.costUsd,
  ];
  for (const c of candidates) {
    const n = safeNumber(c);
    if (n !== null) return n;
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function extractStartedEnded(msg: any, call: any) {
  const startedAt =
    asString(call?.startedAt) ?? asString(msg?.artifact?.startedAt) ?? null;
  const endedAt =
    asString(call?.endedAt) ?? asString(msg?.artifact?.endedAt) ?? null;
  return { startedAt, endedAt };
}

function extractTranscript(msg: any, call: any): string | null {
  return (
    asString(call?.transcript) ??
    asString(msg?.artifact?.transcript) ??
    asString(msg?.data?.transcript) ??
    null
  );
}

function extractPhones(msg: any, call: any) {
  const from =
    normalizePhone(asString(call?.from)) ??
    normalizePhone(asString(msg?.artifact?.from)) ??
    normalizePhone(asString(msg?.variables?.customer?.number)) ??
    normalizePhone(asString(msg?.variableValues?.customer?.number)) ??
    null;

  const to =
    normalizePhone(asString(call?.to)) ??
    normalizePhone(asString(msg?.artifact?.to)) ??
    normalizePhone(asString(msg?.variables?.phoneNumber?.number)) ??
    normalizePhone(asString(msg?.variableValues?.phoneNumber?.number)) ??
    null;

  return { from_phone: from, to_phone: to };
}

function safeRawPayload(body: unknown) {
  // DB column is text (raw_payload). Store as JSON string.
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/**
 * Resolve agents.id safely by vapi assistantId or phoneNumberId.
 * Returns null if not found.
 */
async function resolveAgentId(input: {
  assistantId?: string | null;
  phoneNumberId?: string | null;
}): Promise<{ agentId: string | null; orgId: string | null }> {
  const assistantId = input.assistantId ?? null;
  const phoneNumberId = input.phoneNumberId ?? null;

  const ors = [
    assistantId ? `vapi_assistant_id.eq.${assistantId}` : null,
    phoneNumberId ? `vapi_phone_number_id.eq.${phoneNumberId}` : null,
  ]
    .filter(Boolean)
    .join(",");

  if (!ors) return { agentId: null, orgId: null };

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("id, org_id")
    .or(ors)
    .maybeSingle();

  if (error || !data?.id) return { agentId: null, orgId: null };
  return { agentId: data.id, orgId: data.org_id ?? null };
}

/* -----------------------------
   POST
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-vapi-secret") ?? "";
    if (
      process.env.VAPI_WEBHOOK_SECRET &&
      secret !== process.env.VAPI_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = parsed.data.message;
    const call = msg.call;

    if (msg.type !== "end-of-call-report" || !call?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Resolve agent/org safely (assistantId / phoneNumberId)
    const { agentId, orgId } = await resolveAgentId({
      assistantId: call.assistantId ?? null,
      phoneNumberId: call.phoneNumberId ?? null,
    });

    console.log(
      `[vapi-webhook] resolved agent_id=${agentId ?? "null"} for call_id=${call.id}`
    );

    // If we cannot resolve, don't fail webhook (backward-compatible)
    if (!agentId || !orgId) {
      return NextResponse.json({ ok: true, warning: "agent_not_found" });
    }

    const { startedAt, endedAt } = extractStartedEnded(msg, call);

    const durationSec =
      safeNumber(call.durationSeconds) ?? computeDurationSec(startedAt, endedAt);

    const costUsd = extractCost(msg, call);
    const transcript = extractTranscript(msg, call);
    const { from_phone, to_phone } = extractPhones(msg, call);

    const payload = {
      org_id: orgId,
      agent_id: agentId,
      vapi_call_id: call.id,

      vapi_assistant_id: call.assistantId ?? null,
      vapi_phone_number_id: call.phoneNumberId ?? null,

      direction: "inbound",
      from_phone,
      to_phone,

      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSec,
      cost_usd: costUsd,

      transcript,
      outcome: "completed",
      raw_payload: safeRawPayload(body),
    };

    const { error: upErr } = await supabaseAdmin
      .from("calls")
      .upsert(payload, { onConflict: "vapi_call_id" });

    if (upErr) {
      console.error("[vapi-webhook] calls upsert failed", {
        message: upErr.message,
        details: (upErr as any).details,
        hint: (upErr as any).hint,
        code: (upErr as any).code,
      });
      return NextResponse.json(
        { ok: false, error: "calls_upsert_failed", details: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("VAPI WEBHOOK ERROR", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/* -----------------------------
   GET (debug)
----------------------------- */
export async function GET() {
  return NextResponse.json({ ok: true });
}
