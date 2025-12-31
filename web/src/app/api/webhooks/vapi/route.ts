import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Vapi payloads come in multiple shapes.
 * We normalize to:
 * - callId
 * - phoneNumberId
 * - assistantId
 * - toPhone (if present)
 * - fromPhone (customer.number if present)
 * - status / transcript / timestamps (if present)
 */

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function inferIntent(text?: string | null) {
  const t = (text ?? "").toLowerCase();

  const appointmentKeywords = [
    "appointment",
    "book",
    "booking",
    "schedule",
    "reschedule",
    "calendar",
    "meet",
    "demo",
  ];

  const supportKeywords = [
    "support",
    "problem",
    "issue",
    "complaint",
    "broken",
    "refund",
    "return",
    "help",
  ];

  if (appointmentKeywords.some((k) => t.includes(k))) return "appointment";
  if (supportKeywords.some((k) => t.includes(k))) return "ticket";
  return "none";
}

// Accept either:
// 1) { message: { call: {...}, type: "end-of-call-report", ... } }
// 2) { call: {...}, type: "end-of-call-report", ... }
// 3) (legacy/minimal) { id: "...", to: "...", from: "...", ... }   -> fallback
const VapiWebhookSchema = z
  .object({
    // "message" wrapper (most common)
    message: z
      .object({
        type: z.string().optional().nullable(),
        endedAt: z.string().optional().nullable(),
        startedAt: z.string().optional().nullable(),
        transcript: z.string().optional().nullable(),
        summary: z.string().optional().nullable(),
        call: z
          .object({
            id: z.string().min(1),
            status: z.string().optional().nullable(),
            createdAt: z.string().optional().nullable(),
            endedAt: z.string().optional().nullable(),
            startedAt: z.string().optional().nullable(),
            assistantId: z.string().optional().nullable(),
            phoneNumberId: z.string().optional().nullable(),
            customer: z
              .object({
                number: z.string().optional().nullable(),
              })
              .optional()
              .nullable(),
            // sometimes phone numbers are here
            to: z.string().optional().nullable(),
            from: z.string().optional().nullable(),
            transcript: z.string().optional().nullable(),
          })
          .passthrough(),
      })
      .optional()
      .nullable(),

    // unwrapped shape
    type: z.string().optional().nullable(),
    endedAt: z.string().optional().nullable(),
    startedAt: z.string().optional().nullable(),
    transcript: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    call: z
      .object({
        id: z.string().min(1),
        status: z.string().optional().nullable(),
        createdAt: z.string().optional().nullable(),
        endedAt: z.string().optional().nullable(),
        startedAt: z.string().optional().nullable(),
        assistantId: z.string().optional().nullable(),
        phoneNumberId: z.string().optional().nullable(),
        customer: z
          .object({
            number: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
        to: z.string().optional().nullable(),
        from: z.string().optional().nullable(),
        transcript: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),

    // legacy/minimal
    id: z.string().optional().nullable(),
    to: z.string().optional().nullable(),
    from: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    startedAtLegacy: z.string().optional().nullable(),
    endedAtLegacy: z.string().optional().nullable(),
  })
  .passthrough();

function extractNormalized(payload: any) {
  // prefer wrapped message.call
  const msg = payload?.message ?? null;
  const msgCall = msg?.call ?? null;

  const topCall = payload?.call ?? null;

  // legacy
  const legacyCallId = payload?.id ?? null;

  const call = msgCall ?? topCall ?? null;

  const callId: string | null = call?.id ?? legacyCallId ?? null;

  const assistantId: string | null =
    call?.assistantId ?? payload?.assistantId ?? null;

  const phoneNumberId: string | null =
    call?.phoneNumberId ?? payload?.phoneNumberId ?? null;

  // from phone
  const fromPhoneRaw: string | null =
    call?.customer?.number ??
    call?.from ??
    payload?.from ??
    null;

  // to phone (sometimes present)
  const toPhoneRaw: string | null =
    call?.to ??
    payload?.to ??
    null;

  // timestamps
  const startedAtRaw: string | null =
    call?.startedAt ??
    call?.createdAt ??
    msg?.startedAt ??
    payload?.startedAt ??
    null;

  const endedAtRaw: string | null =
    call?.endedAt ??
    msg?.endedAt ??
    payload?.endedAt ??
    null;

  // transcript
  const transcriptRaw: string | null =
    call?.transcript ??
    msg?.transcript ??
    payload?.transcript ??
    null;

  const statusRaw: string | null =
    call?.status ??
    msg?.type ??
    payload?.status ??
    payload?.type ??
    null;

  return {
    callId,
    assistantId,
    phoneNumberId,
    fromPhone: normalizePhone(fromPhoneRaw),
    toPhone: normalizePhone(toPhoneRaw),
    startedAt: startedAtRaw ? new Date(startedAtRaw).toISOString() : null,
    endedAt: endedAtRaw ? new Date(endedAtRaw).toISOString() : null,
    transcript: transcriptRaw ?? null,
    status: statusRaw ?? null,
  };
}

export async function POST(request: NextRequest) {
  // 1) Shared secret check (webhook only)
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incoming =
      request.headers.get("x-vapi-secret") || // Vapi standard
      request.headers.get("x-webhook-secret"); // legacy fallback
    if (!incoming || incoming !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2) Parse JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Missing call id" },
      { status: 400 }
    );
  }

  // 3) Tenant mapping via public.agents (NOT organizations)
  // We use vapi_phone_number_id and/or vapi_assistant_id to find the agent row,
  // then agent.org_id is guaranteed to be a valid orgs.id (FK chain).
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id, org_id, name, vapi_phone_number_id, vapi_assistant_id")
    .or(
      [
        norm.phoneNumberId ? `vapi_phone_number_id.eq.${norm.phoneNumberId}` : null,
        norm.assistantId ? `vapi_assistant_id.eq.${norm.assistantId}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .maybeSingle();

  if (agentErr) {
    return NextResponse.json(
      { error: "Failed to map agent", details: agentErr.message },
      { status: 500 }
    );
  }

  if (!agent?.org_id) {
    return NextResponse.json(
      {
        error: "Organization not found (no agent mapping matched)",
        phoneNumberId: norm.phoneNumberId ?? null,
        assistantId: norm.assistantId ?? null,
        toPhone: norm.toPhone ?? null,
      },
      { status: 404 }
    );
  }

  const orgId = agent.org_id;

  // 4) Lead lookup/create by from_phone (optional)
  let leadId: string | null = null;

  if (norm.fromPhone) {
    const { data: existingLead, error: leadFindErr } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", norm.fromPhone)
      .maybeSingle();

    if (leadFindErr) {
      return NextResponse.json(
        { error: "Failed to lookup lead", details: leadFindErr.message },
        { status: 500 }
      );
    }

    if (existingLead?.id) {
      leadId = existingLead.id;
    } else {
      const { data: newLead, error: leadCreateErr } = await supabaseAdmin
        .from("leads")
        .insert({
          org_id: orgId,
          name: null,
          phone: norm.fromPhone,
          email: null,
          source: "vapi",
          status: "new",
          notes: "Auto-created from Vapi webhook",
        })
        .select("id")
        .single();

      if (leadCreateErr) {
        return NextResponse.json(
          { error: "Failed to create lead", details: leadCreateErr.message },
          { status: 500 }
        );
      }

      leadId = newLead.id;
    }
  }

  // 5) Upsert call record
  const intent = inferIntent(norm.transcript);

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
        to_phone: norm.toPhone,
        started_at: norm.startedAt,
        ended_at: norm.endedAt,
        outcome: norm.status,
        transcript: norm.transcript,
        intent,
        raw_payload: payload,
      },
      { onConflict: "org_id,vapi_call_id" }
    )
    .select(
      "id, org_id, agent_id, vapi_call_id, from_phone, to_phone, started_at, ended_at, outcome, created_at"
    )
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
