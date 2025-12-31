import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Vapi payloads come in multiple shapes.
 * We normalize to:
 * - callId
 * - phoneNumberId
 * - assistantId
 * - toPhone (with fallback)
 * - fromPhone
 * - timestamps
 * - transcript / status
 */

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function inferIntent(text?: string | null) {
  const t = (text ?? "").toLowerCase();
  if (["appointment", "book", "booking", "schedule", "demo"].some(k => t.includes(k))) {
    return "appointment";
  }
  if (["support", "problem", "issue", "refund", "help"].some(k => t.includes(k))) {
    return "ticket";
  }
  return "none";
}

const VapiWebhookSchema = z.object({
  message: z
    .object({
      type: z.string().optional().nullable(),
      cost: z.number().optional().nullable(),
      call: z
        .object({
          id: z.string().min(1),
          assistantId: z.string().optional().nullable(),
          phoneNumberId: z.string().optional().nullable(),
          status: z.string().optional().nullable(),
          startedAt: z.string().optional().nullable(),
          endedAt: z.string().optional().nullable(),
          transcript: z.string().optional().nullable(),
          customer: z
            .object({
              number: z.string().optional().nullable(),
            })
            .optional()
            .nullable(),
          to: z.string().optional().nullable(),
          from: z.string().optional().nullable(),
        })
        .passthrough(),
    })
    .optional()
    .nullable(),
})
.passthrough();

function extractNormalized(payload: any) {
  const msg = payload?.message ?? null;
  const call = msg?.call ?? null;

  return {
    callId: call?.id ?? null,
    assistantId: call?.assistantId ?? null,
    phoneNumberId: call?.phoneNumberId ?? null,
    fromPhone: normalizePhone(call?.customer?.number ?? call?.from),
    toPhone: normalizePhone(call?.to),
    startedAt: call?.startedAt ? new Date(call.startedAt).toISOString() : null,
    endedAt: call?.endedAt ? new Date(call.endedAt).toISOString() : null,
    transcript: call?.transcript ?? null,
    status: call?.status ?? msg?.type ?? null,
    costUsd: msg?.cost ?? null,
  };
}

export async function POST(request: NextRequest) {
  // 1) Secret check
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incoming =
      request.headers.get("x-vapi-secret") ||
      request.headers.get("x-webhook-secret");

    if (!incoming || incoming !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2) Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VapiWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload: any = parsed.data;
  const norm = extractNormalized(payload);

  if (!norm.callId) {
    return NextResponse.json({ error: "Missing call id" }, { status: 400 });
  }

  // 3) Agent + org mapping
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id, org_id, name, phone_number, vapi_phone_number_id, vapi_assistant_id")
    .or(
      [
        norm.phoneNumberId ? `vapi_phone_number_id.eq.${norm.phoneNumberId}` : null,
        norm.assistantId ? `vapi_assistant_id.eq.${norm.assistantId}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .maybeSingle();

  if (agentErr || !agent?.org_id) {
    return NextResponse.json(
      { error: "Agent/org mapping failed" },
      { status: 404 }
    );
  }

  const orgId = agent.org_id;

  // 4) Lead
  let leadId: string | null = null;
  if (norm.fromPhone) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", norm.fromPhone)
      .maybeSingle();

    if (lead?.id) {
      leadId = lead.id;
    } else {
      const { data: newLead } = await supabaseAdmin
        .from("leads")
        .insert({
          org_id: orgId,
          phone: norm.fromPhone,
          source: "vapi",
          status: "new",
        })
        .select("id")
        .single();

      leadId = newLead?.id ?? null;
    }
  }

  // 5) KPI calculations
  const durationSeconds =
    norm.startedAt && norm.endedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(norm.endedAt).getTime() -
              new Date(norm.startedAt).getTime()) / 1000
          )
        )
      : null;

  const toPhoneFinal = norm.toPhone ?? agent.phone_number ?? null;
  const intent = inferIntent(norm.transcript);

  // 6) Upsert call
  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("calls")
    .upsert(
      {
        org_id: orgId,
        agent_id: agent.id,
        vapi_call_id: norm.callId,
        vapi_assistant_id: norm.assistantId,
        vapi_phone_number_id: norm.phoneNumberId,
        direction: "inbound",
        from_phone: norm.fromPhone,
        to_phone: toPhoneFinal,
        started_at: norm.startedAt,
        ended_at: norm.endedAt,
        duration_seconds: durationSeconds,
        cost_usd: norm.costUsd,
        outcome: norm.status,
        transcript: norm.transcript,
        intent,
        raw_payload: payload,
      },
      { onConflict: "org_id,vapi_call_id" }
    )
    .select("*")
    .single();

  if (callErr) {
    return NextResponse.json(
      { error: "Failed to upsert call", details: callErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mapped: {
        org_id: orgId,
        agent_id: agent.id,
        agent_name: agent.name,
      },
      call: callRow,
      lead_id: leadId,
      intent,
    },
    { status: 200 }
  );
}
