import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -------------------------------------------------
   Schema (minimum ama güvenli)
------------------------------------------------- */
const VapiWebhookSchema = z
  .object({
    message: z
      .object({
        type: z.string(),
        timestamp: z.number().optional(),
        call: z
          .object({
            id: z.string(),
            assistantId: z.string().optional().nullable(),
            phoneNumberId: z.string().optional().nullable(),
            startedAt: z.string().optional().nullable(),
            endedAt: z.string().optional().nullable(),
            transcript: z.string().optional().nullable(),
            to: z.string().optional().nullable(),
            from: z.string().optional().nullable(),

            // bazen gelir
            durationSeconds: z.number().optional().nullable(),
            cost: z.number().optional().nullable(),
          })
          .passthrough()
          .optional()
          .nullable(),

        // bazen buradan gelir
        cost: z.number().optional().nullable(),
        usage: z.any().optional(),
        data: z.any().optional(),
      })
      .passthrough(),
  })
  .passthrough();

/* -------------------------------------------------
   Helpers
------------------------------------------------- */
function getHeader(req: NextRequest, name: string) {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? "";
}

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function computeDurationSec(startedAt?: string | null, endedAt?: string | null) {
  if (!startedAt || !endedAt) return null;
  const s = Date.parse(startedAt);
  const e = Date.parse(endedAt);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const diff = Math.round((e - s) / 1000);
  return diff >= 0 ? diff : null;
}

function extractCostUsd(msg: any, call: any): number | null {
  const candidates = [
    msg?.cost,
    call?.cost,
    msg?.usage?.costUsd,
    msg?.usage?.totalCostUsd,
    msg?.data?.costUsd,
    msg?.data?.totalCostUsd,
    msg?.billing?.totalUsd,
  ];
  for (const c of candidates) {
    const n = safeNumber(c);
    if (n !== null) return n;
  }
  return null;
}

/* -------------------------------------------------
   POST webhook
------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    /* 1) Secret check */
    const incomingSecret = getHeader(req, "x-vapi-secret");
    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || "";

    if (expectedSecret && incomingSecret !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    /* 2) Parse body */
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = parsed.data.message;
const call = msg.call;

console.log("VAPI IDS", {
  type: msg.type,
  callId: call?.id,
  assistantId: call?.assistantId,
  phoneNumberId: call?.phoneNumberId,
  rawAssistantId: (body as any)?.message?.call?.assistantId,
  rawPhoneNumberId: (body as any)?.message?.call?.phoneNumberId,
});


    console.log("VAPI WEBHOOK HIT ✅", msg.type, call?.id);

    // Sadece end-of-call-report → DB yaz
    if (msg.type !== "end-of-call-report" || !call?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    /* 3) Agent → org mapping */
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("id, org_id, name")
      .or(
        [
          call.assistantId ? `vapi_assistant_id.eq.${call.assistantId}` : null,
          call.phoneNumberId ? `vapi_phone_number_id.eq.${call.phoneNumberId}` : null,
        ]
          .filter(Boolean)
          .join(",")
      )
      .maybeSingle();

    if (agentErr || !agent?.org_id) {
      console.error("Agent mapping failed", agentErr, {
        assistantId: call.assistantId,
        phoneNumberId: call.phoneNumberId,
      });
      return NextResponse.json({ ok: true, warning: "agent_not_found" });
    }

    const orgId = agent.org_id;

    /* 4) Lead upsert */
    const fromPhone = normalizePhone(call.from);
    let leadId: string | null = null;

    if (fromPhone) {
      const { data: existingLead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("org_id", orgId)
        .eq("phone", fromPhone)
        .maybeSingle();

      if (existingLead?.id) {
        leadId = existingLead.id;
      } else {
        const { data: newLead } = await supabaseAdmin
          .from("leads")
          .insert({
            org_id: orgId,
            phone: fromPhone,
            source: "vapi",
            status: "new",
            notes: "Auto-created from Vapi end-of-call-report",
          })
          .select("id")
          .single();

        leadId = newLead?.id ?? null;
      }
    }

    /* 5) KPI-ready fields */
    const startedAt =
  call?.startedAt ??
  (body as any)?.message?.call?.startedAt ??
  (body as any)?.message?.call?.startAt ??
  (body as any)?.message?.startedAt ??
  null;

const endedAt =
  call?.endedAt ??
  (body as any)?.message?.call?.endedAt ??
  (body as any)?.message?.call?.endAt ??
  (body as any)?.message?.endedAt ??
  null;

const durationSec =
  safeNumber((call as any)?.durationSeconds) ??
  safeNumber((body as any)?.message?.call?.durationSeconds) ??
  computeDurationSec(startedAt, endedAt);


    const costUsd = extractCostUsd(msg, call);

    /* 6) Call upsert
       KRİTİK: kolon adın duration_seconds (duration_sec değil)
    */
    console.log("DURATION CALC", {
  startedAt,
  endedAt,
  durationSecduration_seconds: durationSec,
});

console.log("END REPORT FIELDS", {
  startedAt,
  endedAt,
  durationSec,
  rawStartedAt: (body as any)?.message?.call?.startedAt,
  rawEndedAt: (body as any)?.message?.call?.endedAt,
});

await supabaseAdmin.from("calls").upsert(
  {
    org_id: orgId,
    agent_id: agent.id,
    vapi_call_id: call.id,
    vapi_assistant_id: call.assistantId ?? null,
    vapi_phone_number_id: call.phoneNumberId ?? null,
    direction: "inbound",
    from_phone: fromPhone,
    to_phone: normalizePhone(call.to) ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSec,
    cost_usd: costUsd,
    transcript: call.transcript ?? null,
    outcome: "end-of-call-report",
    raw_payload: body,
    // lead_id: leadId,  // calls tablosunda yoksa sil
  },
  { onConflict: "org_id,vapi_call_id" }
);


    return NextResponse.json({
      ok: true,
      vapi_call_id: call.id,
      duration_seconds: durationSec,
      cost_usd: costUsd,
    });
  } catch (err) {
    console.error("VAPI WEBHOOK ERROR ❌", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/* -------------------------------------------------
   GET (debug)
------------------------------------------------- */
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/webhooks/vapi" });
}
