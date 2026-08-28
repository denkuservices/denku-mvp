import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recallForStatedName } from "@/lib/platform/recall";

/**
 * `identify_caller` — the tool the assistant calls after asking who it is speaking with (R-139).
 *
 * **The tool DEFINITION lives in the Vapi account, not this repo** (like `create_ticket` and
 * `create_appointment`), so the contract it must satisfy is written here, beside the code that
 * depends on it. Three bookings were lost to that pair drifting apart.
 *
 * Headers — filled by Vapi, never by the model:
 *   x-denku-secret           the shared secret
 *   x-vapi-call-id           {{call.id}}          → identifies the org
 *   x-vapi-customer-number   {{customer.number}}  → the caller ID; empty on a web call
 *
 * Body — the one thing only the conversation can supply:
 *   name  (required)  what the caller said when asked who they are
 *
 * ---
 *
 * **Why this is a tool and not a line in the system prompt.**
 *
 * Injecting the caller's record into the prompt would deliver it before the caller has said a
 * word, leaving "do not use this until they identify themselves" as an *instruction to a model*
 * rather than a control. Here the model is simply never sent what it has not earned: a mismatch
 * returns `{ known: false }` and nothing else, so there is nothing to leak. (It would also mean
 * moving phone routing onto Vapi's `assistant-request`, and routing has broken before —
 * landmine #6.)
 *
 * **Why the assistant must ask an OPEN question.** "Am I speaking with Jack?" tells whoever picked
 * up that this number belongs to Jack, before they answer and regardless of what they answer. On a
 * shared line or a reassigned number the disclosure has already happened. The tool description in
 * the Vapi account must therefore instruct: ask *"Who am I speaking with?"*, never the name.
 *
 * Tier 1 only (spec §5): their own name, their own next appointment, and that a request is open.
 * Never an amount, never a ticket's contents, never anything about a third party — those are not
 * things to read aloud to whoever is holding a phone.
 */

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().min(1).max(120),
});

function requireToolSecret(req: NextRequest): string | null {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return null;
  const incoming = req.headers.get("x-denku-secret");
  return incoming === expected ? null : "Unauthorized";
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const normalized = input.replace(/[^\d+]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");
  if (!digitsOnly || digitsOnly.length < 7) return null;
  return normalized;
}

/** What the assistant hears back. `known: false` carries no other field, on purpose. */
type IdentifyResponse =
  | { ok: true; known: false; message: string }
  | {
      ok: true;
      known: true;
      greeting_name: string | null;
      next_appointment_at: string | null;
      has_open_request: boolean;
      message: string;
    };

export async function POST(req: NextRequest) {
  /**
   * An auth failure answers 401, not 200.
   *
   * Vapi reads a 200 as success, so a tool that answers 200 to a rejected request lets the AI
   * tell a caller something that never happened — the exact bug found in `create-ticket` on
   * 2026-08-27.
   */
  const authError = requireToolSecret(req);
  if (authError) {
    console.warn("[TOOL][IDENTIFY_CALLER][AUTH][REJECTED]");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let input: z.infer<typeof BodySchema>;
  try {
    input = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const callId = req.headers.get("x-vapi-call-id");
  const callerNumber = normalizePhone(req.headers.get("x-vapi-customer-number"));

  // Org from the call row: the webhook writes it at call start, so it exists by the time any tool
  // fires — and it is the only path that works on a web call, which has no caller ID at all.
  let orgId: string | null = null;
  if (callId) {
    const { data } = await supabaseAdmin
      .from("calls")
      .select("org_id")
      .eq("vapi_call_id", callId)
      .maybeSingle<{ org_id: string | null }>();
    orgId = data?.org_id ?? null;
  }

  if (!orgId) {
    return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });
  }

  const unknown: IdentifyResponse = {
    ok: true,
    known: false,
    // The assistant needs to know how to behave, not why. "No record" would invite it to say so,
    // which tells a caller whether a number is in the system — itself a small disclosure.
    message: "Continue normally. Do not mention records, accounts or previous visits.",
  };

  // A web call has no caller ID, so there is no identity to verify a name against. Nothing is
  // disclosed rather than falling back to a name-only lookup, which would let anyone who guesses
  // a customer's name hear that customer's appointment.
  if (!callerNumber) {
    console.info("[TOOL][IDENTIFY_CALLER][NO_CALLER_ID]", { org_id: orgId });
    return NextResponse.json(unknown, { status: 200 });
  }

  const facts = await recallForStatedName({
    orgId,
    phone: callerNumber,
    statedName: input.name,
  });

  if (!facts) {
    console.info("[TOOL][IDENTIFY_CALLER][NO_MATCH]", { org_id: orgId });
    return NextResponse.json(unknown, { status: 200 });
  }

  console.info("[TOOL][IDENTIFY_CALLER][MATCH]", { org_id: orgId, contact_id: facts.contactId });

  const response: IdentifyResponse = {
    ok: true,
    known: true,
    greeting_name: facts.name,
    next_appointment_at: facts.nextAppointmentAt,
    has_open_request: facts.hasOpenRequest,
    message:
      "This is a returning customer. Greet them by name once, use what you have naturally, and " +
      "never read these details back as a list. Do not discuss amounts, invoices, or anything " +
      "about another person.",
  };

  return NextResponse.json(response, { status: 200 });
}
