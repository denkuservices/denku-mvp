import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendOnce } from "@/lib/email/dispatch";
import { contactRequestTemplate, sourceLabel } from "@/lib/email/templates/contactRequest";
import { getSupportEmail } from "@/lib/support";
import { getBaseUrl } from "@/lib/utils/url";
import { DENKU_SELF_ORG_ID } from "@/lib/denku-agent/tools";
import { normalizeEmailLocale, type EmailLocale } from "@/lib/email/i18n";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Tell someone a request came in from the website.
 *
 * `POST /api/marketing/contact` used to insert a row into `contact_requests` and stop. Nothing
 * emailed, nothing ticketed, and no screen in the product read that table — verified 2026-09-03,
 * when a real submission was found sitting in the database with nobody aware of it. R-047 claimed
 * this form "now actually emails the team"; the route it points at has never done so.
 *
 * Two deliveries, because they fail differently and are worth having separately: an email to the
 * support address (arrives on a phone, at night, without anyone logging in) and a ticket in
 * **Denku's own workspace** — the same Requests list every customer uses, which is the point of
 * running as our own customer.
 *
 * **Never throws, and never fails the form.** The row in `contact_requests` is the record; this is
 * the notification. A lead is worth more than a tidy delivery, so the caller's response does not
 * depend on any of it.
 */

export interface ContactRequestRow {
  id: string;
  work_email: string;
  name?: string | null;
  company?: string | null;
  industry?: string | null;
  channels?: string[] | null;
  tools?: string | null;
  estimated_volume?: string | null;
  message?: string | null;
  source?: string | null;
}

/**
 * The ticket a website request becomes.
 *
 * Pure, because this is the text a human reads first and the part most likely to be edited later.
 * The subject names the form and the person — a Requests list full of "Website request" tells the
 * reader nothing — and the description keeps every field they filled in, including the ones the
 * ticket table has no column for.
 */
export function buildContactRequestTicket(row: ContactRequestRow): {
  subject: string;
  description: string;
  requesterName: string | null;
  requesterEmail: string;
} {
  const form = sourceLabel(row.source);
  const who = (row.name || "").trim() || (row.company || "").trim() || row.work_email;

  const lines: string[] = [`${form} request from the website.`, ""];
  const add = (label: string, value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (v) lines.push(`${label}: ${v}`);
  };
  add("Name", row.name);
  add("Company", row.company);
  add("Work email", row.work_email);
  add("Industry", row.industry);
  if (row.channels && row.channels.length > 0) lines.push(`Channels: ${row.channels.join(", ")}`);
  add("Tools", row.tools);
  add("Estimated volume", row.estimated_volume);

  if ((row.message ?? "").trim()) {
    lines.push("", "Message:", row.message!.trim());
  }

  return {
    subject: `${form} request — ${who}`,
    description: lines.join("\n"),
    requesterName: (row.name || "").trim() || null,
    requesterEmail: row.work_email,
  };
}

/** The workspace these tickets land in: the one Denku runs itself on. */
function denkuOrgId(): string {
  return process.env.DENKU_SELF_ORG_ID?.trim() || DENKU_SELF_ORG_ID;
}

/**
 * What language should this mail be in?
 *
 * The recipient is the Denku team, not the person who filled the form, so the prospect's browser
 * has no say. Read from the workspace owner's own UI language, defaulting to English — the same
 * value the dashboard language switcher writes.
 */
async function teamLocale(orgId: string): Promise<EmailLocale> {
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("ui_locale")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ ui_locale: string | null }>();
    return normalizeEmailLocale(data?.ui_locale ?? undefined);
  } catch {
    return "en";
  }
}

export interface FanoutResult {
  ticketId: string | null;
  emailed: boolean;
}

export async function fanoutContactRequest(row: ContactRequestRow): Promise<FanoutResult> {
  const orgId = denkuOrgId();
  const built = buildContactRequestTicket(row);
  let ticketId: string | null = null;
  let emailed = false;

  // 1) The ticket, in Denku's own Requests list.
  try {
    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        // Org scope on a service-role write is mandatory — there is no RLS backstop here.
        org_id: orgId,
        subject: built.subject,
        description: built.description,
        requester_name: built.requesterName,
        requester_email: built.requesterEmail,
        status: "open",
        priority: "normal",
        // No call_id and no conversation_id, on purpose: this request did not come from a
        // conversation, and both artifact-notification sweeps are scoped by those columns — so
        // leaving them null is also what stops this ticket being emailed about a second time.
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !ticket) {
      logEvent({
        tag: "[MARKETING][CONTACT][TICKET_FAILED]",
        ts: Date.now(),
        stage: "TOOL",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { contact_request_id: row.id, error: error?.message ?? "no row" },
      });
    } else {
      ticketId = ticket.id;
    }
  } catch (err) {
    console.error("[MARKETING][CONTACT] ticket insert threw (non-fatal)", err);
  }

  // 2) The email, to whoever answers support.
  try {
    const locale = await teamLocale(orgId);
    const { subject, html } = contactRequestTemplate({
      workEmail: row.work_email,
      name: row.name,
      company: row.company,
      industry: row.industry,
      channels: row.channels,
      tools: row.tools,
      estimatedVolume: row.estimated_volume,
      message: row.message,
      source: row.source,
      ticketUrl: ticketId ? `${getBaseUrl()}/dashboard/tickets/${ticketId}` : null,
      locale,
    });

    const sent = await sendOnce({
      kind: "contact_request",
      // The request row's id: stable, and one per submission. A retried POST creates a new row and
      // is a new lead; a retried DELIVERY of the same row must not mail twice.
      dedupeKey: row.id,
      to: getSupportEmail(),
      subject,
      html,
      orgId,
      sender: "notify",
    });

    emailed = sent.ok && sent.sent === true;
  } catch (err) {
    console.error("[MARKETING][CONTACT] notification email threw (non-fatal)", err);
  }

  // 3) Stamp the ticket as notified.
  //
  // Nothing sweeps it today (both artifact sweeps key on call_id/conversation_id, which are null
  // here), but the column means "someone has already been told about this" and leaving it null on
  // a ticket we just emailed about is the kind of small lie that becomes a duplicate later.
  if (ticketId && emailed) {
    try {
      await supabaseAdmin
        .from("tickets")
        .update({ notified_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", ticketId);
    } catch {
      // Bookkeeping only.
    }
  }

  logEvent({
    tag: "[MARKETING][CONTACT][DELIVERED]",
    ts: Date.now(),
    stage: "TOOL",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      contact_request_id: row.id,
      source: row.source ?? null,
      ticket_id: ticketId,
      emailed,
      to: getSupportEmail(),
    },
  });

  return { ticketId, emailed };
}
