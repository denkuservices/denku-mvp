import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseSpokenTime } from "@/lib/time/spokenTime";

/**
 * `create_appointment` — the tool the assistant calls while the caller is still on the line.
 *
 * **The tool DEFINITION lives in the Vapi account, not in this repo** (`DENKU_TOOL_IDS` in
 * `lib/vapi/assistantConfig.ts`), so the contract it must have is written here, where the code
 * that depends on it lives. Three real bookings were lost to that definition drifting from this
 * handler, each in a different way.
 *
 * Headers — filled by Vapi, never by the model:
 *   x-denku-secret           the shared secret
 *   x-vapi-call-id           {{call.id}}          → identifies the org and links the appointment
 *   x-vapi-customer-number   {{customer.number}}  → the caller's own number, empty on a web call
 *
 * Body — only what the model can know from the conversation:
 *   start_at_text  (required)  when they want it, in their words
 *   lead_name, purpose, notes  what they said
 *   lead_phone                 ONLY if they volunteer a different callback number
 *
 * The rule behind all of it: **never make the model collect something the platform already
 * knows.** It asked one caller for a phone number and got, correctly, "you can take the number
 * I'm calling you with". `call_id`, `vapi_call_id` and `to_phone` were removed from the body for
 * the same reason — the first two the model cannot know, and the third it filled with the
 * caller's number because the field name meant nothing to it.
 */


/* ------------------ helpers ------------------ */

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const normalized = input.replace(/[^\d+]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");
  if (!digitsOnly || digitsOnly.length < 7) return null;
  return normalized;
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
  startAtText?: string | null,
  timeZone?: string | null
): { iso: string; rawText?: string } {
  // ISO wins if valid
  if (startAt) {
    const d = new Date(startAt);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString() };
    }
  }

  if (startAtText) {
    /**
     * The business's timezone, not the server's.
     *
     * This used to call chrono with no zone at all, so "tomorrow at 5 PM" resolved in whatever
     * zone the runtime happened to be in — UTC on Vercel. A New York business got its bookings
     * four hours early, silently. `parseSpokenTime` resolves the IANA zone properly (chrono
     * ignores IANA names outright); see lib/time/spokenTime.
     */
    const parsed = parseSpokenTime(startAtText, timeZone ?? null);

    if (!parsed) throw new Error("Could not parse natural date");
    return { iso: parsed.toISOString(), rawText: startAtText };
  }

  throw new Error("start_at or start_at_text required");
}

/* ------------------ schema ------------------ */

/**
 * Vapi sends "" for every declared property the model did not fill.
 *
 * The first real appointment call in production failed validation on exactly this: the model sent
 * `{lead_name, start_at_text}` and Vapi padded the rest with empty strings, so `lead_phone` tripped
 * `.min(7)` and the whole call was rejected — after which the assistant told the caller a person
 * would follow up. An empty string here means "not provided", and must be read that way.
 */
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional().nullable()
);

const BodySchema = z.object({
  /**
   * The business's own number. Optional since Inbox v2: a web call has no phone number at all, and
   * the org is then resolved from the call record instead (see below). Requiring it made the tool
   * unusable on exactly the channel we test with.
   */
  to_phone: optionalText,

  start_at: optionalText,
  start_at_text: optionalText,

  lead_phone: optionalText,
  lead_name: optionalText,
  lead_email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional().nullable()
  ),

  purpose: optionalText,
  notes: optionalText,

  call_id: optionalText,
  vapi_call_id: optionalText,
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

  /**
   * The call this tool was fired from, as told by Vapi rather than by the model.
   *
   * The model has no reason to know a call id and never sends one, so the first web-call booking
   * in production came back `org_not_found` even after the schema stopped rejecting it. The
   * assistant's tool definition now carries `x-vapi-call-id: {{call.id}}`, which Vapi fills in
   * itself — infrastructure telling us which call this is, instead of hoping the model volunteers
   * it. Body parameters still win when present; this is the fallback that always exists.
   */
  const headerCallId = req.headers.get("x-vapi-call-id")?.trim() || null;

  /**
   * The caller's own number, from Vapi rather than from the conversation.
   *
   * Watching a real booking: the assistant asked "could you provide your phone number?" and the
   * caller answered "you can take the number I'm already calling you with" — which is exactly
   * right, and exactly what the tool should never have had to ask. Vapi knows the caller ID, so
   * the tool definition sends `{{customer.number}}` and it arrives here. Empty on a web call,
   * where there is no number to know and asking would be the only way — which is why the booking
   * must still work without one.
   */
  const headerCustomerNumber = normalizePhone(req.headers.get("x-vapi-customer-number"));

  const toPhone = normalizePhone(input.to_phone);

  /* org — by the business's number when we have one, otherwise by the call itself */
  let orgId: string | null = null;
  /** Whether `to_phone` turned out to be a business number we know. Decides who owns that number. */
  let orgResolvedByPhone = false;

  if (toPhone) {
    // TODO: Migrate phone_number mapping to dedicated table/orgs. For now, using organizations VIEW
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("phone_number", toPhone)
      .maybeSingle<{ id: string }>();
    orgId = org?.id ?? null;
    orgResolvedByPhone = orgId !== null;
  }

  if (!orgId) {
    /**
     * Fall back to the call record. By the time a tool fires mid-call, the webhook has already
     * created the `calls` row (it is written at call start), and that row knows its org. This is
     * what makes the tool work on a web call, and it is a strictly additive path — the phone
     * lookup above still wins whenever a number is present.
     */
    const byId = input.call_id && /^[0-9a-fA-F-]{36}$/.test(input.call_id) ? input.call_id : null;
    const vapiCallId = input.vapi_call_id || headerCallId;
    if (byId || vapiCallId) {
      const q = supabaseAdmin.from("calls").select("org_id");
      const { data: call } = byId
        ? await q.eq("id", byId).maybeSingle<{ org_id: string | null }>()
        : await q.eq("vapi_call_id", vapiCallId!).maybeSingle<{ org_id: string | null }>();
      orgId = call?.org_id ?? null;
    }
  }

  if (!orgId) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }
  const org = { id: orgId };

  /**
   * The timezone the caller's words belong to.
   *
   * Looked up here, after the org is known, because parsing "tomorrow at 5 PM" before we know
   * WHOSE tomorrow it is can only be wrong. One row, org-scoped; a missing timezone simply falls
   * back to the runtime's, which is the behaviour this route had for its whole life.
   */
  let businessTimeZone: string | null = null;
  {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("timezone")
      .eq("org_id", org.id)
      .not("timezone", "is", null)
      .limit(1)
      .maybeSingle<{ timezone: string | null }>();
    businessTimeZone = agentRow?.timezone ?? null;
  }

  let startAt;
  try {
    startAt = parseStartAt(input.start_at, input.start_at_text, businessTimeZone);
  } catch {
    return NextResponse.json(
      { error: "invalid_datetime", message: "Could not understand the date/time" },
      { status: 400 }
    );
  }

  /* call lookup: resolve by call_id (UUID) or vapi_call_id */
  let callFromPhone: string | null = null;
  let callLeadId: string | null = null;
  let resolvedCallId: string | null = null;
  
  const validatedCallId = input.call_id && /^[0-9a-fA-F-]{36}$/.test(input.call_id) ? input.call_id : null;
  // The header is the only call identifier that always exists — without it here, an appointment
  // the tool creates is never linked to the conversation it came from.
  const validatedVapiCallId = input.vapi_call_id || headerCallId;

  if (validatedCallId) {
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("id, from_phone, lead_id")
      .eq("id", validatedCallId)
      .eq("org_id", org.id)
      .maybeSingle();

    if (call) {
      resolvedCallId = call.id;
      callFromPhone = normalizePhone(call.from_phone);
      callLeadId = call.lead_id;
    }
  } else if (validatedVapiCallId) {
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("id, from_phone, lead_id")
      .eq("vapi_call_id", validatedVapiCallId)
      .eq("org_id", org.id)
      .maybeSingle();

    if (call) {
      resolvedCallId = call.id;
      callFromPhone = normalizePhone(call.from_phone);
      callLeadId = call.lead_id;
    }
  }

  /* lead resolution: prefer callLeadId, else upsert/find by phone */
  let leadId: string | null = null;

  // 1) Prefer callLeadId if present
  if (callLeadId) {
    leadId = callLeadId;
  } else {
    /**
     * 2) Whose number is this?
     *
     * `callFromPhone` first (the caller ID the webhook recorded), then whatever the model passed.
     * `to_phone` is included as a last resort because of a failure mode we watched happen: told it
     * needed a phone number, the assistant asked the caller for one and put it in `to_phone` — the
     * field that means *the business's* number. It had already failed to resolve an org, so it is
     * not a business number; treating it as the caller's is the reading that matches reality.
     */
    const leadPhone =
      callFromPhone ||
      headerCustomerNumber ||
      normalizePhone(input.lead_phone) ||
      (orgResolvedByPhone ? null : normalizePhone(input.to_phone));

    /**
     * A booking without a contact is still a booking.
     *
     * This used to answer 400 `invalid_phone` when no number could be found — so on a web call,
     * where there is no caller ID and never will be, the assistant was told its booking failed and
     * fell back to "someone will follow up". Every channel we are about to add (Web Chat, Telegram,
     * Email) has the same shape. The appointment is what the caller asked for; the contact record
     * is bookkeeping we attach when we can, and `appointments.lead_id` has always been nullable.
     */
    if (!leadPhone) {
      leadId = null;
    } else {

    // 3) Find or create lead by (org_id, phone)
    const { data: leadExisting } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", org.id)
      .eq("phone", leadPhone)
      .maybeSingle();

    if (leadExisting?.id) {
      leadId = leadExisting.id;
    } else {
      const { data: leadNew, error: leadErr } = await supabaseAdmin
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

      if (leadErr || !leadNew?.id) {
        return NextResponse.json({ error: "lead_create_failed" }, { status: 500 });
      }

      leadId = leadNew.id;
    }
    }
  }


  /* appointment */
  const { data: appt, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      org_id: org.id,
      lead_id: leadId,
      call_id: resolvedCallId,
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

  /* link call to lead: update calls.lead_id if call found and lead_id is null */
  if (resolvedCallId && leadId) {
    const { error: updateErr } = await supabaseAdmin
      .from("calls")
      .update({ lead_id: leadId })
      .eq("id", resolvedCallId)
      .eq("org_id", org.id)
      .is("lead_id", null);

    if (!updateErr) {
      console.log("[create-appointment]", { resolvedCallId, vapi_call_id: validatedVapiCallId, leadId });
    }
  }

  return NextResponse.json({ ok: true, appointment: appt });
}
