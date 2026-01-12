import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function requireToolSecret(req: NextRequest) {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return null; // allow if not configured
  const incoming = req.headers.get("x-denku-secret");
  if (!incoming || incoming !== expected) return "Unauthorized";
  return null;
}

const BodySchema = z.object({
  call_id: z.string().uuid(),
  
  requester_email: z.string().email().optional().nullable(),
  requester_phone: z.string().optional().nullable(),
  requester_name: z.string().optional().nullable(),
  
  subject: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).optional().nullable(),
}).passthrough();

export async function POST(req: NextRequest) {
  const authErr = requireToolSecret(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Require at least one contact method
  const hasEmail = !!input.requester_email && input.requester_email.trim().length > 0;
  const hasPhone = !!input.requester_phone && normalizePhone(input.requester_phone) !== null;
  
  if (!hasEmail && !hasPhone) {
    return NextResponse.json(
      { error: "At least one of requester_email or requester_phone is required" },
      { status: 400 }
    );
  }

  // Look up call to get org_id (do NOT trust client-sent org_id)
  const { data: call, error: callErr } = await supabaseAdmin
    .from("calls")
    .select("id, org_id, agent_id, vapi_call_id")
    .eq("id", input.call_id)
    .maybeSingle<{
      id: string;
      org_id: string | null;
      agent_id: string | null;
      vapi_call_id: string | null;
    }>();

  if (callErr || !call) {
    return NextResponse.json(
      { error: "Call not found", call_id: input.call_id },
      { status: 404 }
    );
  }

  if (!call.org_id) {
    return NextResponse.json(
      { error: "Call has no org_id" },
      { status: 400 }
    );
  }

  const orgId = call.org_id;

  // Resolve lead by requester_phone or requester_email if available
  let leadId: string | null = null;
  const normalizedPhone = normalizePhone(input.requester_phone);
  
  if (normalizedPhone) {
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", normalizedPhone)
      .maybeSingle<{ id: string }>();

    if (existingLead?.id) {
      leadId = existingLead.id;
    } else {
      // Create lead if phone provided
      const { data: newLead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .insert({
          org_id: orgId,
          name: input.requester_name ?? null,
          phone: normalizedPhone,
          email: input.requester_email ?? null,
          source: "vapi",
          status: "new",
        })
        .select("id")
        .single();

      if (!leadErr && newLead?.id) {
        leadId = newLead.id;
      }
    }
  } else if (hasEmail) {
    // Try to find lead by email if no phone
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("email", input.requester_email)
      .maybeSingle<{ id: string }>();

    if (existingLead?.id) {
      leadId = existingLead.id;
    } else {
      // Create lead by email
      const { data: newLead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .insert({
          org_id: orgId,
          name: input.requester_name ?? null,
          email: input.requester_email,
          source: "vapi",
          status: "new",
        })
        .select("id")
        .single();

      if (!leadErr && newLead?.id) {
        leadId = newLead.id;
      }
    }
  }

  // Prepare ticket fields
  const subject = (input.subject ?? "Support Request").trim();
  const description = input.description?.trim() || "Created via Vapi tool call";

  // Create ticket
  const { data: ticket, error: tErr } = await supabaseAdmin
    .from("tickets")
    .insert({
      org_id: orgId,
      lead_id: leadId,
      call_id: input.call_id,
      subject,
      description,
      status: "open",
      priority: input.priority ?? "normal",
      requester_email: input.requester_email ?? null,
      requester_phone: normalizedPhone,
      requester_name: input.requester_name ?? null,
    })
    .select("id")
    .single();

  if (tErr || !ticket) {
    return NextResponse.json(
      { error: "Failed to create ticket", details: tErr?.message ?? "unknown" },
      { status: 500 }
    );
  }

  console.log("[TOOLS] create-ticket", {
    call_id: input.call_id,
    org_id: orgId,
    ticket_id: ticket.id,
    has_email: hasEmail,
    has_phone: hasPhone,
  });

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.id,
    call_id: input.call_id,
  });
}
