import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import * as chrono from "chrono-node";


/* ------------------ helpers ------------------ */

function normalizePhone(input?: string | null) {
  if (!input) return null;
  return input.replace(/[^\d+]/g, "") || null;
}

function requireToolSecret(req: NextRequest) {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return null;
  const incoming = req.headers.get("x-denku-secret");
  if (incoming !== expected) return "Unauthorized";
  return null;
}

function parseStartAt(
  startAt?: string | null,
  startAtText?: string | null
): { iso: string; rawText?: string } {
  // ISO wins if valid
  if (startAt) {
    const d = new Date(startAt);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString() };
    }
  }

  if (startAtText) {
    const parsed = chrono.parseDate(startAtText, new Date());

    if (!parsed) throw new Error("Could not parse natural date");
    return { iso: parsed.toISOString(), rawText: startAtText };
  }

  throw new Error("start_at or start_at_text required");
}

/* ------------------ schema ------------------ */

const BodySchema = z.object({
  to_phone: z.string().min(3),

  start_at: z.string().optional().nullable(),
  start_at_text: z.string().optional().nullable(),

  lead_phone: z.string().min(7),
  lead_name: z.string().optional().nullable(),
  lead_email: z.string().email().optional().nullable(),

  purpose: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),

  call_id: z.string().optional().nullable(), // relaxed
}).passthrough();

/* ------------------ handler ------------------ */

export async function POST(req: NextRequest) {
  const authErr = requireToolSecret(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  let startAt;
  try {
    startAt = parseStartAt(input.start_at, input.start_at_text);
  } catch {
    return NextResponse.json(
      { error: "invalid_datetime", message: "Could not understand the date/time" },
      { status: 400 }
    );
  }

  const toPhone = normalizePhone(input.to_phone);
  const leadPhone = normalizePhone(input.lead_phone);
  if (!toPhone || !leadPhone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  /* org */
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("phone_number", toPhone)
    .single();

  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  /* lead */
  const { data: leadExisting } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", org.id)
    .eq("phone", leadPhone)
    .maybeSingle();

  let leadId = leadExisting?.id;

  if (!leadId) {
    const { data: leadNew } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: org.id,
        name: input.lead_name ?? null,
        phone: leadPhone,
        email: input.lead_email ?? null,
        source: "vapi",
        status: "new",
      })
      .select("id")
      .single();

    if (!leadNew) {
      return NextResponse.json({ error: "lead_create_failed" }, { status: 500 });
    }
    leadId = leadNew.id;
  }

  /* appointment */
  const { data: appt, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      org_id: org.id,
      lead_id: leadId,
      call_id:
        input.call_id && /^[0-9a-fA-F-]{36}$/.test(input.call_id)
          ? input.call_id
          : null,
      start_at: startAt.iso,
      status: "scheduled",
      notes:
        [
          input.purpose,
          startAt.rawText ? `Requested: "${startAt.rawText}"` : null,
          input.notes,
        ]
          .filter(Boolean)
          .join(" | ") || null,
    })
    .select()
    .single();

  if (error || !appt) {
    return NextResponse.json({ error: "appointment_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, appointment: appt });
}
