import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -----------------------------
   Schema
----------------------------- */
const VapiWebhookSchema = z.object({
  message: z.object({
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
  }),
});

/* -----------------------------
   Helpers
----------------------------- */
function normalizePhone(v?: string | null) {
  if (!v) return null;
  return v.replace(/[^\d+]/g, "") || null;
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

    /* Agent mapping */
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, org_id")
      .or(
        [
          call.assistantId
            ? `vapi_assistant_id.eq.${call.assistantId}`
            : null,
          call.phoneNumberId
            ? `vapi_phone_number_id.eq.${call.phoneNumberId}`
            : null,
        ]
          .filter(Boolean)
          .join(",")
      )
      .maybeSingle();

    if (!agent?.id || !agent.org_id) {
      return NextResponse.json({ ok: true, warning: "agent_not_found" });
    }

    const startedAt = call.startedAt ?? null;
    const endedAt = call.endedAt ?? null;
    const durationSec =
      safeNumber(call.durationSeconds) ??
      computeDurationSec(startedAt, endedAt);

    const costUsd = extractCost(msg, call);

    /* Call upsert — TEK KAYNAK */
    await supabaseAdmin.from("calls").upsert(
      {
        org_id: agent.org_id,
        agent_id: agent.id,
        vapi_call_id: call.id,
        started_at: startedAt,
        ended_at: endedAt,
        duration_sec: durationSec,
        cost_usd: costUsd,
        transcript: call.transcript ?? null,
        outcome: "completed",
        raw: body,
      },
      { onConflict: "vapi_call_id" }
    );

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
