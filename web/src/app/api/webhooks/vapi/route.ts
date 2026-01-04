import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VapiWebhookSchema = z
  .object({
    message: z.any(),
  })
  .passthrough();

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

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function safeInt(v: unknown): number | null {
  const n =
    typeof v === "number" ? v :
    typeof v === "string" ? Number(v) :
    NaN;

  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n)); // istersen Math.floor da olur
}

function toIsoOrNull(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  return digits.replace(/\D/g, "");
}

function compact<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Cost extraction
 * - cost yoksa null (0 yazma)
 */
function extractCost(body: any): number | null {
  const rawCost =
    body?.cost ??
    body?.message?.cost ??
    body?.message?.call?.cost ??
    body?.message?.summary_table?.cost ??
    body?.message?.call?.summary_table?.cost;

  if (rawCost === undefined || rawCost === null) return null;

  const parsed = parseFloat(String(rawCost));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCallId(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  // Vapi eventlerinde id farklı yerlerde gelebilir
  return (
    call?.id ??
    msg?.summary_table?.id ??
    msg?.callId ??
    msg?.id ??
    body?.callId ??
    body?.id ??
    null
  );
}

function extractStartedEnded(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  const startedAt =
    toIsoOrNull(call?.startedAt) ??
    toIsoOrNull(call?.createdAt) ??
    toIsoOrNull(msg?.startedAt) ??
    toIsoOrNull(msg?.summary_table?.createdAt) ??
    null;

  const endedAt =
    toIsoOrNull(call?.endedAt) ??
    toIsoOrNull(msg?.endedAt) ??
    toIsoOrNull(msg?.summary_table?.endedAt) ??
    null;

  return { startedAt, endedAt };
}

function extractPhones(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  const from =
    normalizePhone(asString(msg?.customer?.number)) ??
    normalizePhone(asString(call?.customer?.number)) ??
    normalizePhone(asString(call?.from)) ??
    null;

  // bizim numaramız genelde phoneNumber.number veya call.phoneNumber.number
  const to =
    normalizePhone(asString(msg?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.to)) ??
    null;

  return { from_phone: from, to_phone: to };
}

function extractTranscript(body: any) {
  const msg = body?.message;
  const call = msg?.call;
  return (
    asString(call?.transcript) ??
    asString(msg?.transcript) ??
    asString(msg?.artifact?.transcript) ??
    null
  );
}

async function resolveAgentByVapi(body: any): Promise<{ agentId: string | null; orgId: string | null }> {
  const msg = body?.message;
  const call = msg?.call;

  const assistantId = call?.assistantId ?? msg?.assistantId ?? msg?.summary_table?.assistantId ?? null;
  const phoneNumberId = call?.phoneNumberId ?? msg?.phoneNumberId ?? null;

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
 * lead resolve/create by phone (opsiyonel ama lead_id doldurmak için gerekli)
 * Eğer leads tablon yoksa bunu tamamen kaldırabilirsin.
 */
async function resolveLeadId(orgId: string, phone: string | null) {
  const p = normalizePhone(phone);
  if (!p) return null;

  const { data: existing, error: e1 } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("phone", p)
    .maybeSingle();

  if (!e1 && existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await supabaseAdmin
    .from("leads")
    .insert({
      org_id: orgId,
      phone: p,
      name: null,
      email: null,
      source: "inbound_call",
      status: "new",
      notes: null,
    })
    .select("id")
    .single();

  if (e2) return null;
  return created?.id ?? null;
}

/* -----------------------------
   POST
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = body.message;
    const call = msg?.call;
    const eventType = msg?.type ?? null;
    const status = asString(call?.status) ?? asString(msg?.status) ?? null;

    // Normalize vapi_call_id once at the top
    const vapiCallId = asString(extractCallId(body));

    console.log("[WEBHOOK]", {
      eventType,
      status,
      vapiCallId,
      hasCall: !!call,
    });

    if (!vapiCallId) {
      return NextResponse.json({ ok: true, ignored: "no_call_id" });
    }

    const { agentId, orgId } = await resolveAgentByVapi(body);
    if (!agentId || !orgId) {
      return NextResponse.json({ ok: true, ignored: "agent_not_found" });
    }

    const { startedAt, endedAt } = extractStartedEnded(body);
    const { from_phone, to_phone } = extractPhones(body);

    const direction =
      (call?.type ?? msg?.summary_table?.type) === "inboundPhoneCall"
        ? "inbound"
        : (call?.type ?? msg?.summary_table?.type) === "outboundPhoneCall"
        ? "outbound"
        : "unknown";

    const vapi_assistant_id =
      call?.assistantId ?? msg?.assistantId ?? msg?.summary_table?.assistantId ?? null;

    const vapi_phone_number_id =
      call?.phoneNumberId ?? msg?.phoneNumberId ?? null;

    // Non-final’de de lead’i bağlayabiliriz (inbound için caller phone)
    const leadId = direction === "inbound" ? await resolveLeadId(orgId, from_phone) : null;

    // duration: final eventte daha doğru (summary_table.minutes vs / call.durationSeconds)
    const durationSeconds =
      safeNumber(call?.durationSeconds) ??
      safeNumber(msg?.durationSeconds) ??
      null;

    // 1) Her eventte row’u var etmek için UPSERT (cost_usd yazmıyoruz)
    const baseUpsert = {
      vapi_call_id: vapiCallId,
      org_id: orgId,
      agent_id: agentId,
      direction,
      from_phone,
      to_phone,
      started_at: startedAt,
      ended_at: endedAt ?? undefined, // finalde update edeceğiz
      duration_seconds: safeInt(call?.durationSeconds ?? msg?.durationSeconds),
      vapi_assistant_id,
      vapi_phone_number_id,
      lead_id: leadId ?? undefined,
      raw_payload: body,
      outcome: asString(call?.status) ?? asString(msg?.status) ?? undefined,
      transcript: undefined, // transcript’i final eventte daha iyi yaz
    };

    const { error: upsertErr } = await supabaseAdmin
      .from("calls")
      .upsert(compact(baseUpsert), { onConflict: "vapi_call_id" });

    if (upsertErr) {
      console.error("[VAPI] upsert failed", upsertErr);
      return NextResponse.json({ ok: false, error: "upsert_failed" }, { status: 500 });
    }

    // 2) Final event → UPDATE ile kesin final alanları yaz
    const isFinalEvent =
      eventType === "end-of-call-report" ||
      (eventType === "status-update" && status === "ended");

    if (isFinalEvent) {
      const costUsd = extractCost(body);
      const transcript = extractTranscript(body);

      // final duration: call.durationSeconds yoksa summary_table.minutes * 60
      const minutes = safeNumber(msg?.summary_table?.minutes);
      const finalDuration =
        durationSeconds ??
        (minutes != null ? Math.round(minutes * 60) : null);

      const finalEndedAt = endedAt ?? toIsoOrNull(msg?.summary_table?.endedAt) ?? new Date().toISOString();

      // Always update: ended_at, outcome, duration_seconds
      // Only update cost_usd if valid (do NOT overwrite with null or 0)
      // Only update transcript if present (do not wipe existing transcript)
      const finalUpdate = compact({
        ended_at: finalEndedAt,
        outcome: "completed",
        duration_seconds: safeInt(call?.durationSeconds ?? msg?.durationSeconds),
        cost_usd: costUsd != null ? costUsd : undefined,
        transcript: transcript ?? undefined,
        vapi_assistant_id,
        vapi_phone_number_id,
        lead_id: leadId ?? undefined,
        raw_payload: body,
      });

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("calls")
        .update(finalUpdate)
        .eq("vapi_call_id", vapiCallId)
        .select("id, vapi_call_id, cost_usd, duration_seconds, transcript, lead_id, vapi_assistant_id, vapi_phone_number_id");

      console.log("[FINAL UPDATE RESULT]", {
        vapiCallId,
        affectedRows: updated?.length ?? 0,
        costUsd,
        finalDuration,
        hasTranscript: !!transcript,
      });

      if (updateErr) {
        console.error("[VAPI] final update failed", updateErr);
        return NextResponse.json({ ok: false, error: "final_update_failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[VAPI WEBHOOK ERROR]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
