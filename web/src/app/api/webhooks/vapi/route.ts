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
          durationSeconds: z.number().optional().nullable(),
          endedAt: z.string().optional().nullable(),
          startedAt: z.string().optional().nullable(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});

/* -----------------------------
   Helpers
----------------------------- */
function asString(v: unknown) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return null;
  }
}

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;

  // Keep a leading + if present, otherwise keep digits only
  if (digits.startsWith("+")) return digits;
  return digits.replace(/\D/g, "");
}

function safeNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toIsoOrNull(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function computeDurationSec(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return null;
  const s = new Date(startedAt).getTime();
  const e = new Date(endedAt).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const diff = Math.round((e - s) / 1000);
  return diff >= 0 ? diff : null;
}

/**
 * Extract started/ended from either msg/call variants.
 */
function extractStartedEnded(msg: any, call: any) {
  const startedAt =
    toIsoOrNull(call?.startedAt) ??
    toIsoOrNull(msg?.startedAt) ??
    toIsoOrNull(msg?.artifact?.startedAt) ??
    null;

  const endedAt =
    toIsoOrNull(call?.endedAt) ??
    toIsoOrNull(msg?.endedAt) ??
    toIsoOrNull(msg?.artifact?.endedAt) ??
    null;

  return { startedAt, endedAt };
}

/**
 * Extract transcript if present (keep backward compatible).
 */
function extractTranscript(msg: any, call: any) {
  return (
    asString(call?.transcript) ??
    asString(msg?.transcript) ??
    asString(msg?.artifact?.transcript) ??
    null
  );
}

/**
 * Extract cost.
 */
function extractCost(msg: any, call: any) {
  const direct =
    safeNumber(call?.costUsd) ??
    safeNumber(call?.cost) ??
    safeNumber(msg?.costUsd) ??
    safeNumber(msg?.cost);

  if (direct != null) return direct;

  // Some payloads include costs in artifacts/variables
  const artifactCost =
    safeNumber(msg?.artifact?.costUsd) ??
    safeNumber(msg?.artifact?.cost) ??
    safeNumber(msg?.variables?.costUsd) ??
    safeNumber(msg?.variableValues?.costUsd);

  return artifactCost ?? null;
}

/**
 * Extract phone(s).
 * - from_phone: caller/customer
 * - to_phone: destination/agent number
 */
function extractPhones(msg: any, call: any) {
  // Vapi end-of-call-report payload commonly includes:
  // msg.customer.number = caller
  // msg.phoneNumber.number = our number
  const from =
    normalizePhone(asString(msg?.customer?.number)) ??
    normalizePhone(asString(call?.customer?.number)) ??
    normalizePhone(asString(msg?.variables?.customer?.number)) ??
    normalizePhone(asString(msg?.variableValues?.customer?.number)) ??
    normalizePhone(asString(call?.from)) ??
    normalizePhone(asString(msg?.artifact?.from)) ??
    null;

  const to =
    normalizePhone(asString(msg?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.phoneNumber?.number)) ??
    normalizePhone(asString(msg?.variables?.phoneNumber?.number)) ??
    normalizePhone(asString(msg?.variableValues?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.to)) ??
    normalizePhone(asString(msg?.artifact?.to)) ??
    null;

  return { from_phone: from, to_phone: to };
}


function safeRawPayload(body: unknown) {
  // calls.raw_payload is jsonb in your schema; any JSON value is acceptable
  if (body === null) return null;
  if (typeof body === "object") return body;
  if (typeof body === "string") {
    // attempt parse; if fails store as string (still valid JSON)
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
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
  return { agentId: data.id, orgId: (data as any).org_id ?? null };
}

/**
 * Resolve (or create) a lead by phone within org.
 * - Uses leads.phone exact match (store normalized).
 * - Creates lead with status='new' and source='inbound_call' if missing.
 */
async function resolveLeadId(input: {
  orgId: string;
  phone: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const phone = normalizePhone(input.phone) ?? null;
  if (!phone) return null;

  // 1) Try existing
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("phone", phone)
    .maybeSingle();

  if (!findErr && existing?.id) return existing.id as string;

  // 2) Create (non-breaking)
  const { data: created, error: insErr } = await supabaseAdmin
    .from("leads")
    .insert({
      org_id: input.orgId,
      name: input.name ?? null,
      phone,
      email: input.email ?? null,
      source: "inbound_call",
      status: "new",
      notes: null,
    })
    .select("id")
    .single();

  if (insErr) {
    // If insert fails (e.g., constraints), do not break webhook; just skip lead_id
    console.warn("[vapi-webhook] lead insert failed", {
      message: insErr.message,
      code: (insErr as any).code,
    });
    return null;
  }

  return created?.id ?? null;
}

/* -----------------------------
   POST
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-vapi-secret") ?? "";
    if (process.env.VAPI_WEBHOOK_SECRET && secret !== process.env.VAPI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = parsed.data.message as any;
    const call = msg.call as any;

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

    // Lead linking: caller is lead for inbound calls in your current payload
    const leadId = await resolveLeadId({
      orgId,
      phone: from_phone,
      name:
        asString(msg?.variables?.customer?.name) ??
        asString(msg?.variableValues?.customer?.name) ??
        asString(msg?.customer?.name) ??
        null,
      email:
        asString(msg?.variables?.customer?.email) ??
        asString(msg?.variableValues?.customer?.email) ??
        asString(msg?.customer?.email) ??
        null,
    });
const direction =
  call?.type === "inboundPhoneCall" ? "inbound" :
  call?.type === "outboundPhoneCall" ? "outbound" :
  "unknown";

const payload = {
  org_id: orgId,
  agent_id: agentId,
  vapi_call_id: call.id,

  vapi_assistant_id: call.assistantId ?? null,
  vapi_phone_number_id: call.phoneNumberId ?? null,

  direction,
  from_phone,
  to_phone,

  lead_id: leadId,

  started_at: startedAt,
  ended_at: endedAt,
  duration_seconds: durationSec,
  cost_usd: costUsd,

  transcript,
  outcome: call?.outcome ?? "completed",
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

    return NextResponse.json({ ok: true, lead_id: leadId ?? null });
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
