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
  // Tenant binding
  to_phone: z.string().min(3),

  // Scheduling
  start_at: z.string().min(10),
  end_at: z.string().min(10).optional().nullable(),

  // Lead/customer
  lead_phone: z.string().min(7),
  lead_name: z.string().optional().nullable(),
  lead_email: z.string().email().optional().nullable(),

  purpose: z.string().optional().nullable(),
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

  // 1) Resolve org by to_phone
  const { data: org, error: orgErr } = await supabaseAdmin
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
  const { data: existingLead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", org.id)
    .eq("phone", leadPhone)
    .maybeSingle();

  let leadId: string;

  if (existingLead?.id) {
    leadId = existingLead.id;
  } else {
    const { data: newLead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: org.id,
        name: input.lead_name ?? null,
        phone: leadPhone,
        email: input.lead_email ?? null,
        source: "vapi",
        status: "new",
        notes: input.purpose ?? input.notes ?? null,
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

  // 3) Create appointment
  const startAtIso = new Date(input.start_at).toISOString();
  const endAtIso = input.end_at ? new Date(input.end_at).toISOString() : null;

  const { data: appt, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .insert({
      org_id: org.id,
      lead_id: leadId,
      start_at: startAtIso,
      end_at: endAtIso,
      status: "scheduled",
      notes: input.notes ?? input.purpose ?? "Created via Vapi tool",
    })
    .select("id, org_id, lead_id, start_at, end_at, status, created_at")
    .single();

  if (apptErr || !appt) {
    return NextResponse.json(
      { error: "Failed to create appointment", details: apptErr?.message ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, appointment: appt }, { status: 200 });
}

