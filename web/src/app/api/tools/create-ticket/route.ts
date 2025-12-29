import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

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
  to_phone: z.string().min(3),

  lead_phone: z.string().min(7),
  lead_name: z.string().optional().nullable(),
  lead_email: z.string().email().optional().nullable(),

  subject: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).optional().nullable(),
  notes: z.string().optional().nullable(),
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

  const toPhone = normalizePhone(input.to_phone);
  const leadPhone = normalizePhone(input.lead_phone);

  if (!toPhone || !leadPhone) {
    return NextResponse.json(
      { error: "Invalid phone normalization" },
      { status: 400 }
    );
  }

  const subject = (input.subject ?? "").trim();
  const description = (input.description ?? "").trim();

  if (!subject && !description) {
    return NextResponse.json(
      { error: "Either subject or description is required" },
      { status: 400 }
    );
  }

  // 1) Resolve org by to_phone
  const { data: org, error: orgErr } = await supabaseServer
    .from("organizations")
    .select("id, phone_number")
    .eq("phone_number", toPhone)
    .single();

  if (orgErr || !org) {
    return NextResponse.json(
      { error: "Organization not found for phone_number", phone_number: toPhone },
      { status: 404 }
    );
  }

  // 2) Upsert lead by (org_id, phone)
  const { data: existingLead } = await supabaseServer
    .from("leads")
    .select("id")
    .eq("org_id", org.id)
    .eq("phone", leadPhone)
    .maybeSingle();

  let leadId: string;

  if (existingLead?.id) {
    leadId = existingLead.id;
  } else {
    const { data: newLead, error: leadErr } = await supabaseServer
      .from("leads")
      .insert({
        org_id: org.id,
        name: input.lead_name ?? null,
        phone: leadPhone,
        email: input.lead_email ?? null,
        source: "vapi",
        status: "new",
        notes: input.notes ?? null,
      })
      .select("id")
      .single();

    if (leadErr || !newLead?.id) {
      return NextResponse.json(
        { error: "Failed to create lead", details: leadErr?.message ?? "unknown" },
        { status: 500 }
      );
    }

    leadId = newLead.id;
  }

  // 3) Create ticket
  const { data: ticket, error: tErr } = await supabaseServer
    .from("tickets")
    .insert({
      org_id: org.id,
      lead_id: leadId,
      subject: subject || "Support Request",
      description: description || input.notes || "Created via Vapi tool",
      status: "open",
      priority: input.priority ?? "normal",
    })
    .select("id, org_id, lead_id, subject, status, priority, created_at")
    .single();

  if (tErr || !ticket) {
    return NextResponse.json(
      { error: "Failed to create ticket", details: tErr?.message ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ticket }, { status: 200 });
}
