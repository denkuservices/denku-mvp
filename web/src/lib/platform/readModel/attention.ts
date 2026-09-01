import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listInboxPage } from "@/lib/platform/readModel/inbox";
import { appointmentHref } from "@/lib/platform/readModel/requests";
import {
  EMPTY_ATTENTION_FEED,
  type AttentionFeed,
  type AttentionItem,
} from "@/lib/platform/readModel/attentionTypes";

/**
 * The notification bell's feed — "what needs you right now", assembled from signals the product
 * ALREADY computes.
 *
 * **Nothing here is a new notification system, and that is the point.** There is no in-app
 * notifications table in Denku; inventing one to fill a bell would mean a bell that is empty
 * until someone writes rows into it. Instead this reads the four states the product can already
 * prove: the workspace is paused, usage is close to the plan's included minutes, conversations
 * have been handed to a person, and conversations the viewer has not read. Each maps to a place
 * in the product that already explains it, so every row in the bell is a link that goes
 * somewhere real.
 *
 * Consequences worth knowing: it is **derived, not a log** — an item disappears when the state
 * clears (a read conversation leaves the list), and there is no "mark as read" because there is
 * nothing persisted to mark. Unread counts are per-viewer (`lib/platform/reads.ts`); the billing
 * items are per-org, so every member of the org sees them.
 *
 * Never throws: each source is independently guarded, and a dead source contributes nothing
 * rather than emptying the feed.
 */

export type {
  AttentionKind,
  AttentionSeverity,
  AttentionItem,
  AttentionFeed,
} from "@/lib/platform/readModel/attentionTypes";

/** How many unread conversations are listed individually before they are worth summarising. */
const UNREAD_ROWS = 4;
/** How far back the Inbox scan reaches for unread rows. */
const INBOX_SCAN = 25;

/**
 * The warning thresholds the billing cron emails on (`lib/billing/usageAlerts.ts`), restated
 * rather than imported: that module pulls in Stripe, Resend and the pause machinery at load, and
 * a bell rendered on every dashboard request must not drag the billing graph in behind it. Keep
 * the two lists in step — they describe the same promise to the customer.
 */
const USAGE_THRESHOLDS = [50, 75, 90] as const;

/** The highest threshold this usage has crossed, or 0. Pure. */
function highestCrossedThreshold(billableMinutes: number, includedMinutes: number): number {
  if (includedMinutes <= 0) return 0;
  const pct = (billableMinutes / includedMinutes) * 100;
  let highest = 0;
  for (const t of USAGE_THRESHOLDS) if (pct >= t) highest = t;
  return highest;
}

function currentMonthStartUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The workspace being paused is the single most consequential state a customer can be in. */
async function pausedItem(orgId: string, db: SupabaseClient): Promise<AttentionItem | null> {
  try {
    const { data } = await db
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{ workspace_status: string | null; paused_reason: string | null }>();

    if ((data?.workspace_status ?? "active") !== "paused") return null;

    const reason = data?.paused_reason ?? null;
    const body =
      reason === "hard_cap"
        ? "You've used all of your plan's included minutes this month. Upgrade or raise your limit to resume."
        : reason === "past_due"
          ? "A payment is needed before calls can be answered again."
          : "Inbound calls are not being answered until the workspace is resumed.";

    return {
      id: "workspace_paused",
      kind: "workspace_paused",
      severity: "critical",
      title: "Your AI line is paused",
      body,
      href: "/dashboard/settings/workspace/billing",
      at: null,
    };
  } catch {
    return null;
  }
}

/**
 * Usage against the plan's included minutes, using the SAME thresholds the billing cron emails
 * on (50/75/90). Only the highest crossed one is shown — three rows saying the same thing is
 * how a bell becomes noise people stop opening.
 */
async function usageItem(orgId: string, db: SupabaseClient): Promise<AttentionItem | null> {
  try {
    const { data } = await db
      .from("org_monthly_overages")
      .select("billable_minutes, included_minutes")
      .eq("org_id", orgId)
      .eq("month", currentMonthStartUtc())
      .maybeSingle<{ billable_minutes: number | null; included_minutes: number | null }>();

    const billable = Number(data?.billable_minutes ?? 0);
    const included = Number(data?.included_minutes ?? 0);
    if (included <= 0) return null;

    const highest = highestCrossedThreshold(billable, included);
    if (highest < 75) return null;

    return {
      id: `usage_${highest}`,
      kind: "usage",
      severity: "warning",
      title: `You've used ${highest}% of this month's minutes`,
      body: `${Math.round(billable)} of ${Math.round(included)} included minutes. Calls past the limit bill as overage.`,
      href: "/dashboard/usage",
      at: null,
    };
  } catch {
    return null;
  }
}

/**
 * How far back a request still counts as something that needs looking at.
 *
 * There is no "seen" state on a ticket, so the honest signal is a recent one that is still open.
 * A week is long enough that a Friday booking is still in the bell on Monday, and short enough
 * that a permanently-open ticket from March does not sit in the bell forever, training the reader
 * to ignore it.
 */
const REQUEST_WINDOW_DAYS = 7;

/** How many requests are named individually before they collapse into a count. */
const REQUEST_ROWS = 3;

/**
 * Tickets and appointments the AI has produced that nobody has closed.
 *
 * **The gap this fills.** The bell already covered billing and the Inbox, but not the artifacts —
 * so the two things the product exists to produce, a booking and a request for help, were the two
 * things it would not tell you about. A customer's appointment could sit unseen until someone
 * happened to open the Requests page.
 *
 * Still derived, not a log, like everything else here: the row disappears when the ticket is
 * closed or the appointment is completed, because at that point it genuinely no longer needs
 * anyone. Never throws — a dead source contributes nothing rather than emptying the feed.
 */
async function requestItems(orgId: string, db: SupabaseClient): Promise<AttentionItem[]> {
  const since = new Date(Date.now() - REQUEST_WINDOW_DAYS * 86_400_000).toISOString();

  try {
    const [tickets, appointments] = await Promise.all([
      db
        .from("tickets")
        .select("id, subject, requester_name, requester_phone, status, created_at")
        .eq("org_id", orgId)
        .in("status", ["open", "new"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("appointments")
        .select("id, status, start_at, created_at")
        .eq("org_id", orgId)
        .in("status", ["requested", "scheduled"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    type Row = { id: string; title: string; body: string | null; at: string; href: string };
    const rows: Row[] = [];

    for (const t of (tickets.data ?? []) as Array<{
      id: string;
      subject: string | null;
      requester_name: string | null;
      requester_phone: string | null;
      created_at: string;
    }>) {
      const who = t.requester_name?.trim() || t.requester_phone?.trim();
      rows.push({
        id: `request_ticket_${t.id}`,
        title: who ? `New request from ${who}` : "New request",
        body: t.subject?.trim() || null,
        at: t.created_at,
        href: `/dashboard/crm/requests/${t.id}?type=ticket`,
      });
    }

    for (const a of (appointments.data ?? []) as Array<{
      id: string;
      start_at: string | null;
      created_at: string;
    }>) {
      const when = a.start_at ? new Date(a.start_at) : null;
      rows.push({
        id: `request_appointment_${a.id}`,
        title: "New appointment booked",
        body:
          when && !Number.isNaN(when.getTime())
            ? when.toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : "No time recorded yet",
        at: a.created_at,
        href: appointmentHref(a.id),
      });
    }

    rows.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));

    const items: AttentionItem[] = rows.slice(0, REQUEST_ROWS).map((r) => ({
      id: r.id,
      kind: "new_request",
      severity: "info",
      title: r.title,
      body: r.body,
      href: r.href,
      at: r.at,
    }));

    const rest = rows.length - REQUEST_ROWS;
    if (rest > 0) {
      items.push({
        id: "new_request_more",
        kind: "new_request",
        severity: "info",
        title: `${rest} more open request${rest === 1 ? "" : "s"}`,
        body: null,
        href: "/dashboard/crm/requests",
        at: null,
      });
    }

    return items;
  } catch {
    return [];
  }
}

export async function loadAttentionFeed(
  orgId: string,
  userId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<AttentionFeed> {
  if (!orgId) return EMPTY_ATTENTION_FEED;

  const [paused, usage, inbox, requests] = await Promise.all([
    pausedItem(orgId, db),
    usageItem(orgId, db),
    listInboxPage(orgId, userId ?? "", { limit: INBOX_SCAN }, db).catch(() => null),
    requestItems(orgId, db),
  ]);

  const items: AttentionItem[] = [];
  if (paused) items.push(paused);
  if (usage) items.push(usage);

  /*
   * Requests sit above the Inbox rows.
   *
   * An unread conversation is something to read; a booking or an open request is something to
   * DO, and it has a customer waiting on the other end of it. Ordering the bell by what it costs
   * to ignore puts them here.
   */
  items.push(...requests);

  /**
   * "Needs a person" stays ONE row carrying the count, not one row per conversation: it is a
   * queue, the Inbox already renders it as a filter, and the bell's job is to say the queue is
   * not empty. The count is the Inbox's own facet, so the two can never disagree.
   */
  if (inbox && inbox.needsPersonCount > 0) {
    items.push({
      id: "needs_person",
      kind: "needs_person",
      severity: "warning",
      title:
        inbox.needsPersonCount === 1
          ? "1 conversation needs a person"
          : `${inbox.needsPersonCount} conversations need a person`,
      body: "Someone took these over from the AI — they're waiting on a reply.",
      href: "/dashboard/inbox?filter=human",
      at: null,
    });
  }

  /**
   * Unread conversations ARE listed one by one, because unlike the queue above each one names a
   * different customer, and the name is the whole reason to open the bell rather than the Inbox.
   * Past a handful they collapse into a count for the same reason.
   */
  if (inbox) {
    const unread = inbox.rows.filter((r) => r.unread > 0);
    for (const row of unread.slice(0, UNREAD_ROWS)) {
      items.push({
        id: `unread_${row.id}`,
        kind: "unread",
        severity: "info",
        title: row.displayName ?? row.handle ?? "Unknown contact",
        body: row.summary ?? `${row.unread} new message${row.unread === 1 ? "" : "s"}`,
        href: `/dashboard/inbox/${row.id}`,
        at: row.lastActivityAt,
      });
    }
    const rest = unread.length - UNREAD_ROWS;
    if (rest > 0) {
      items.push({
        id: "unread_more",
        kind: "unread",
        severity: "info",
        title: `${rest} more unread conversation${rest === 1 ? "" : "s"}`,
        body: null,
        href: "/dashboard/inbox",
        at: null,
      });
    }
  }

  return { items, count: items.length };
}
