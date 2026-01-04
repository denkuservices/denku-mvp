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

/**
 * Parse natural language date/time string to UTC ISO 8601
 * Handles ISO strings (backward compatibility) and natural language formats
 * Note: Natural language parsing uses Date.parse() which interprets dates in server timezone.
 * For proper America/New_York timezone handling, a timezone library would be needed.
 */
function parseDateTime(input: string): string {
  const trimmed = input.trim();
  
  // First, check if it's already a valid ISO string (backward compatibility)
  // Accept formats like: 2024-01-05T14:30:00Z or 2024-01-05T14:30:00.000Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // Try Date.parse for natural language formats
  // Handles formats like: "Jan 5 2024 2:30pm", "January 5, 2024 14:30", etc.
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // If parsing fails, throw to be caught by caller
  throw new Error("Invalid date format");
}

/**
 * Parse and normalize start_at from either ISO string or natural language
 * Returns UTC ISO 8601 string
 */
function parseStartAt(startAt?: string | null, startAtText?: string | null): string {
  // Prefer start_at if provided and valid
  if (startAt) {
    try {
      return parseDateTime(startAt);
    } catch {
      // Fall through to startAtText
    }
  }

  // Use startAtText if provided
  if (startAtText) {
    return parseDateTime(startAtText);
  }

  // Neither provided
  throw new Error("start_at or start_at_text is required");
}

const BodySchema = z.object({
  // Tenant binding
  to_phone: z.string().min(3),

  // Scheduling - accept either ISO string or natural language
  start_at: z.string().optional().nullable(),
  start_at_text: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
  end_at_text: z.string().optional().nullable(),

  // Lead/customer
  lead_phone: z.string().min(7),
  lead_name: z.string().optional().nullable(),
  lead_email: z.string().email().optional().nullable(),

  purpose: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),

  // Optional: link to call for outcome resolution
  call_id: z.string().uuid().optional().nullable(),
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

  // Validate that at least one date/time field is provided
  if (!input.start_at && !input.start_at_text) {
    return NextResponse.json(
      { ok: false, error: "invalid_datetime", message: "start_at or start_at_text is required" },
      { status: 400 }
    );
  }

  // Parse start_at
  let startAtIso: string;
  try {
    startAtIso = parseStartAt(input.start_at, input.start_at_text);
  } catch (err: any) {
    console.log("[create-appointment] Date parsing failed", { error: err.message });
    return NextResponse.json(
      { ok: false, error: "invalid_datetime", message: "Could not parse date/time" },
      { status: 400 }
    );
  }

  // Parse end_at (optional)
  let endAtIso: string | null = null;
  if (input.end_at || input.end_at_text) {
    try {
      endAtIso = input.end_at
        ? parseDateTime(input.end_at)
        : parseDateTime(input.end_at_text!);
    } catch (err: any) {
      console.log("[create-appointment] End date parsing failed", { error: err.message });
      // End date is optional, so we'll just log and continue
    }
  }

  const toPhone = normalizePhone(input.to_phone);
  const leadPhone = normalizePhone(input.lead_phone);

  if (!toPhone || !leadPhone) {
    return NextResponse.json(
      { error: "Invalid phone normalization" },
      { status: 400 }
    );
  }

  // Generate a simple event ID for logging (not a secret)
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log("[create-appointment]", { eventId, parsedStartAt: startAtIso });

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

  // 3) Resolve call_id if provided (for outcome resolution)
  let callId: string | null = input.call_id ?? null;

  // 4) Create appointment
  const { data: appt, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .insert({
      org_id: org.id,
      lead_id: leadId,
      call_id: callId,
      start_at: startAtIso,
      end_at: endAtIso,
      status: "scheduled",
      notes: input.notes ?? input.purpose ?? "Created via Vapi tool",
    })
    .select("id, org_id, lead_id, call_id, start_at, end_at, status, created_at")
    .single();

  if (apptErr || !appt) {
    console.error("[create-appointment] Database insert failed", { eventId, error: apptErr?.message });
    return NextResponse.json(
      { error: "Failed to create appointment", details: apptErr?.message ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, appointment_id: appt.id, appointment: appt }, { status: 200 });
}
