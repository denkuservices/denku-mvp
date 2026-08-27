import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseSpokenTime } from "@/lib/time/spokenTime";
import type { ReplyArtifact, ReplyEmployee } from "@/lib/platform/reply/types";

/**
 * The two things a chat AI is allowed to actually DO: book, or hand over to a human.
 *
 * These are the chat twins of the Vapi tools in `app/api/tools/*`, and they deliberately do NOT
 * call those routes over HTTP. Those handlers are shaped by the voice contract — they read
 * `x-vapi-call-id` and `{{customer.number}}` headers to find the org and the caller, neither of
 * which exists in a chat. Calling them would mean faking a call id. The domain rules they encode
 * are re-stated here in the two places they matter:
 *
 *   - **A booking without a contact is still a booking.** `lead_id` stays null on a channel with
 *     no phone number; the appointment is what the customer asked for, the contact row is
 *     bookkeeping. (This is the bug that cost three real bookings.)
 *   - **One conversation books one appointment.** Calling again corrects the existing row rather
 *     than filling the owner's calendar with one booking per sentence.
 *
 * Every executor returns a short, model-readable result. What it says matters: the model repeats
 * it to the customer, so "booked for Thursday 3 PM" and "could not understand the time" have to
 * be distinguishable without reading a status code.
 */

export interface ToolContext {
  orgId: string;
  conversationId: string;
  contactId: string | null;
  employee: ReplyEmployee;
  db?: SupabaseClient;
}

export interface ToolOutcome {
  /** Handed back to the model verbatim as the tool result. */
  message: string;
  artifact?: ReplyArtifact;
  ok: boolean;
}

/** OpenAI-compatible tool definitions (Gemini reads the same schema through its OpenAI door). */
export const CHAT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "create_appointment",
      description:
        "Book an appointment for this customer. Call this as soon as you know when they want to come. " +
        "Calling it again in the same conversation updates the same booking instead of creating a second one.",
      parameters: {
        type: "object",
        properties: {
          start_at_text: {
            type: "string",
            description:
              "When they want it, in their own words: 'tomorrow at 3pm', 'Friday morning', 'the 14th at noon'.",
          },
          name: { type: "string", description: "Their name, only if they gave it in this conversation." },
          purpose: { type: "string", description: "What the appointment is for, in a few words." },
          notes: { type: "string", description: "Anything else the business needs to know." },
        },
        required: ["start_at_text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_ticket",
      description:
        "Hand this request to the human team. Use it whenever you cannot answer, the customer asks for a person, " +
        "something is wrong, or you promised a follow-up. This is the only way a message reaches a human.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "A short title, e.g. 'Refund request'." },
          description: {
            type: "string",
            description: "What the customer needs, in enough detail that the team can act without reading the thread.",
          },
          name: { type: "string", description: "Their name, only if they gave it." },
          phone: { type: "string", description: "Only if they volunteered a phone number." },
          email: { type: "string", description: "Only if they volunteered an email." },
        },
        required: ["description"],
      },
    },
  },
];

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** How a time reads back to a customer, in the business's own zone. */
function describeWhen(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone ?? "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function executeCreateAppointment(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const db = ctx.db ?? supabaseAdmin;
  const startAtText = clean(args.start_at_text);

  const when = startAtText ? parseSpokenTime(startAtText, ctx.employee.timezone) : null;
  if (!when) {
    // Refusing beats guessing: an appointment invented from "sometime soon" is a customer who
    // turns up on the wrong day, and the owner never learns why.
    return {
      ok: false,
      message:
        "Could not understand that as a date and time. Ask the customer for a specific day and time, then call this again.",
    };
  }

  const iso = when.toISOString();
  const notes =
    [clean(args.purpose), startAtText ? `Requested: "${startAtText}"` : null, clean(args.notes)]
      .filter(Boolean)
      .join(" | ") || null;

  const payload = {
    org_id: ctx.orgId,
    conversation_id: ctx.conversationId,
    contact_id: ctx.contactId,
    // No phone number on a chat channel, and that is fine — lead_id has always been nullable.
    lead_id: null,
    call_id: null,
    start_at: iso,
    status: "scheduled",
    notes,
  };

  try {
    const { data: existing } = await db
      .from("appointments")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("conversation_id", ctx.conversationId)
      .maybeSingle<{ id: string }>();

    const saved = existing
      ? await db
          .from("appointments")
          .update({ start_at: iso, notes, status: "scheduled" })
          .eq("id", existing.id)
          .eq("org_id", ctx.orgId)
          .select("id")
          .single<{ id: string }>()
      : await db.from("appointments").insert(payload).select("id").single<{ id: string }>();

    if (saved.error || !saved.data) {
      console.error("[REPLY][TOOL][APPOINTMENT][FAILED]", saved.error?.message);
      return { ok: false, message: "The booking could not be saved. Tell the customer the team will follow up, and call create_ticket." };
    }

    console.info("[TOOL_RESULT]", {
      tool: "create_appointment",
      org_id: ctx.orgId,
      conversation_id: ctx.conversationId,
      appointment_id: saved.data.id,
      updated: Boolean(existing),
    });

    return {
      ok: true,
      artifact: { type: "appointment", id: saved.data.id },
      message: `Appointment ${existing ? "updated" : "booked"} for ${describeWhen(iso, ctx.employee.timezone)}. Confirm that time back to the customer.`,
    };
  } catch (err) {
    console.error("[REPLY][TOOL][APPOINTMENT][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, message: "The booking could not be saved. Tell the customer the team will follow up." };
  }
}

export async function executeCreateTicket(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const db = ctx.db ?? supabaseAdmin;
  const description = clean(args.description);
  if (!description) {
    return { ok: false, message: "A description is required. Say what the customer needs, then call this again." };
  }

  try {
    // One open ticket per conversation. A customer who describes a problem over four messages
    // has ONE problem; four tickets would be our plumbing showing up in the owner's queue.
    const { data: existing } = await db
      .from("tickets")
      .select("id, description")
      .eq("org_id", ctx.orgId)
      .eq("conversation_id", ctx.conversationId)
      .eq("status", "open")
      .maybeSingle<{ id: string; description: string | null }>();

    if (existing) {
      const merged = existing.description?.includes(description)
        ? existing.description
        : [existing.description, description].filter(Boolean).join("\n\n").slice(0, 2000);

      await db.from("tickets").update({ description: merged }).eq("id", existing.id).eq("org_id", ctx.orgId);
      console.info("[TOOL_RESULT]", { tool: "create_ticket", org_id: ctx.orgId, ticket_id: existing.id, merged: true });
      return {
        ok: true,
        artifact: { type: "ticket", id: existing.id },
        message: "Added to the request the team already has for this conversation. Tell the customer someone will follow up.",
      };
    }

    const { data, error } = await db
      .from("tickets")
      .insert({
        org_id: ctx.orgId,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        call_id: null,
        lead_id: null,
        subject: clean(args.subject) ?? "Customer request",
        description: description.slice(0, 2000),
        status: "open",
        priority: "normal",
        requester_name: clean(args.name),
        requester_phone: clean(args.phone),
        requester_email: clean(args.email),
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("[REPLY][TOOL][TICKET][FAILED]", error?.message);
      return { ok: false, message: "Could not reach the team. Tell the customer honestly that you could not pass the message on." };
    }

    console.info("[TOOL_RESULT]", { tool: "create_ticket", org_id: ctx.orgId, conversation_id: ctx.conversationId, ticket_id: data.id });
    return {
      ok: true,
      artifact: { type: "ticket", id: data.id },
      message: "The team has the request. Tell the customer someone will follow up.",
    };
  } catch (err) {
    console.error("[REPLY][TOOL][TICKET][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, message: "Could not reach the team. Tell the customer honestly that you could not pass the message on." };
  }
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case "create_appointment":
      return executeCreateAppointment(args, ctx);
    case "create_ticket":
      return executeCreateTicket(args, ctx);
    default:
      return { ok: false, message: `Unknown tool: ${name}` };
  }
}
