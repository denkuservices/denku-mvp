import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -------------------------------------------------
   Schema (minimum ama güvenli)
------------------------------------------------- */
const VapiWebhookSchema = z.object({
  message: z.object({
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
      })
      .passthrough()
      .optional()
      .nullable(),
    cost: z.number().optional().nullable(),
  }).passthrough(),
}).passthrough();

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

    console.log("VAPI WEBHOOK HIT ✅", msg.type, call?.id);

    // end-of-call-report değilse DB yazma, ama 200 dön
    if (msg.type !== "end-of-call-report" || !call?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    /* 3) Agent → org mapping */
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("id, org_id, name, phone_number")
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
      console.error("Agent mapping failed", agentErr);
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
          })
          .select("id")
          .single();

        leadId = newLead?.id ?? null;
      }
    }

    /* 5) Call upsert */
    await supabaseAdmin.from("calls").upsert(
      {
        org_id: orgId,
        agent_id: agent.id,
        vapi_call_id: call.id,
        direction: "inbound",
        from_phone: fromPhone,
        to_phone: normalizePhone(call.to) ?? agent.phone_number,
        started_at: call.startedAt,
        ended_at: call.endedAt,
        transcript: call.transcript,
        cost_usd: msg.cost ?? null,
        outcome: msg.type,
        raw_payload: body,
        lead_id: leadId,
      },
      { onConflict: "org_id,vapi_call_id" }
    );

    /* 6) Done */
    return NextResponse.json({ ok: true });
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
