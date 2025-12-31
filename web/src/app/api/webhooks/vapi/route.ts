import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

/**
 * Accept both:
 *  A) Vapi webhook:
 *     { message: { call: { id, assistantId?, phoneNumberId?, customer?.number?, to?, from?, createdAt?, ... }, type?, endedAt?, transcript? } }
 *  B) Legacy flat:
 *     { id, to?, from?, startedAt?, endedAt?, status?, transcript? }
 */
const VapiWebhookSchema = z
  .object({
    message: z
      .object({
        call: z
          .object({
            id: z.string().min(1),
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
            createdAt: z.string().optional().nullable(),
            endedAt: z.string().optional().nullable(),
            status: z.string().optional().nullable(),
            transcript: z.string().optional().nullable(),
          })
          .passthrough(),
        type: z.string().optional().nullable(),
        endedAt: z.string().optional().nullable(),
        transcript: z.string().optional().nullable(),
      })
      .optional(),
    // legacy flat fallback
    id: z.string().optional(),
    to: z.string().optional().nullable(),
    from: z.string().optional().nullable(),
    startedAt: z.string().optional().nullable(),
    endedAt: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    transcript: z.string().optional().nullable(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  // 1) Shared secret check (webhook only)
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incoming =
      request.headers.get("x-vapi-secret") || // Vapi standard
      request.headers.get("x-webhook-secret"); // legacy / manual tests
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

  const payload = parsed.data;
  const call = payload.message?.call;

  // Normalize core fields
  const vapiCallId = call?.id ?? payload.id;
  if (!vapiCallId) {
    return NextResponse.json({ error: "Missing call id" }, { status: 400 });
  }

  const phoneNumberId = call?.phoneNumberId ?? null;
  const assistantId = call?.assistantId ?? null;

  const toPhone = normalizePhone(call?.to ?? payload.to ?? null);
  const fromPhone = normalizePhone(
    call?.from ?? payload.from ?? call?.customer?.number ?? null
  );

  const startedAtRaw = call?.createdAt ?? payload.startedAt ?? null;
  const endedAtRaw =
    payload.message?.endedAt ?? call?.endedAt ?? payload.endedAt ?? null;

  const startedAt = startedAtRaw ? new Date(startedAtRaw).toISOString() : null;
  const endedAt = endedAtRaw ? new Date(endedAtRaw).toISOString() : null;

  const status =
    (call?.status ?? payload.status ?? payload.message?.type ?? null) as
      | string
      | null;

  const transcript =
    (call?.transcript ??
      payload.transcript ??
      payload.message?.transcript ??
      null) as string | null;

  // 3) Multi-tenant mapping
  // Prefer: agents.vapi_phone_number_id == phoneNumberId
  // Fallback: agents.vapi_assistant_id == assistantId
  // Last resort: organizations.phone_number == toPhone (legacy)
  let orgId: string | null = null;

  if (phoneNumberId) {
    const { data: agentByPhone, error } = await supabaseAdmin
      .from("agents")
      .select("org_id")
      .eq("vapi_phone_number_id", phoneNumberId)
      .maybeSingle<{ org_id: string }>();

    if (error) {
      return NextResponse.json(
        { error: "Failed to map org via phoneNumberId", details: error.message },
        { status: 500 }
      );
    }

    if (agentByPhone?.org_id) orgId = agentByPhone.org_id;
  }

  if (!orgId && assistantId) {
    const { data: agentByAssistant, error } = await supabaseAdmin
      .from("agents")
      .select("org_id")
      .eq("vapi_assistant_id", assistantId)
      .maybeSingle<{ org_id: string }>();

    if (error) {
      return NextResponse.json(
        { error: "Failed to map org via assistantId", details: error.message },
        { status: 500 }
      );
    }

    if (agentByAssistant?.org_id) orgId = agentByAssistant.org_id;
  }

  if (!orgId && toPhone) {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id, phone_number")
      .eq("phone_number", toPhone)
      .maybeSingle<{ id: string; phone_number: string | null }>();

    if (orgErr) {
      return NextResponse.json(
        { error: "Failed to map org via organizations.phone_number", details: orgErr.message },
        { status: 500 }
      );
    }

    if (org?.id) orgId = org.id;
  }

  if (!orgId) {
    return NextResponse.json(
      {
        error: "Organization not found (no mapping matched)",
        phoneNumberId,
        assistantId,
        toPhone,
      },
      { status: 404 }
    );
  }

  // 4) Lead lookup/create by from_phone (optional)
  let leadId: string | null = null;

  if (fromPhone) {
    const { data: existingLead, error: leadFindErr } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", fromPhone)
      .maybeSingle<{ id: string }>();

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
          phone: fromPhone,
          email: null,
          source: "vapi",
          status: "new",
          notes: "Auto-created from call webhook",
        })
        .select("id")
        .single<{ id: string }>();

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
  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("calls")
    .upsert(
      {
        org_id: orgId,
        vapi_call_id: vapiCallId,
        vapi_phone_number_id: phoneNumberId,
        vapi_assistant_id: assistantId,
        direction: "inbound",
        from_phone: fromPhone,
        to_phone: toPhone,
        started_at: startedAt,
        ended_at: endedAt,
        outcome: status ?? null,
        transcript: transcript ?? null,
        raw_payload: payload,
      },
      { onConflict: "org_id,vapi_call_id" }
    )
    .select(
      "id, org_id, vapi_call_id, from_phone, to_phone, started_at, ended_at, outcome, created_at"
    )
    .single();

  if (callErr) {
    return NextResponse.json(
      { error: "Failed to upsert call", details: callErr.message },
      { status: 500 }
    );
  }

  // 6) Intent inference (logging only; no auto-create)
  const intent = inferIntent(transcript);

  return NextResponse.json(
    {
      ok: true,
      call: callRow,
      lead_id: leadId,
      intent,
    },
    { status: 200 }
  );
}
