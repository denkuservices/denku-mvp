import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConversationViews, sortByActivityDesc } from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";
import type { Channel } from "@/lib/platform/channels";

/**
 * Contacts read model (Sprint 5.5, Q0). Presents people in platform shape sourced from
 * `leads` today (id = lead id → 1:1 with legacy /leads/:id, so redirects are lossless);
 * prefers `contacts`/`contact_identities` once backfilled (R-081) with no view/UI change.
 * Pure mapper exported for tests. Org-scoped; never throws.
 */

export interface ContactIdentity {
  channel: Channel;
  value: string;
}
export interface ContactListView {
  id: string;
  displayName: string | null;
  primaryHandle: string | null;
  channels: Channel[];
  source: string | null;
  status: string | null;
  lastSeenAt: string | null;
}
export interface ContactDetailView extends ContactListView {
  phone: string | null;
  email: string | null;
  notes: string | null;
  identities: ContactIdentity[];
  conversations: ConversationView[];
}

export interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Infer the channels a lead has been seen on from its source. Conservative. */
function channelsFromSource(source: string | null): Channel[] {
  const s = (source ?? "").toLowerCase();
  if (s === "inbound_call" || s === "voice") return ["voice"];
  if (s === "instagram") return ["instagram"];
  if (s === "web") return ["web"];
  return [];
}

export function leadRowToContactListView(row: LeadRow): ContactListView {
  return {
    id: row.id,
    displayName: row.name,
    primaryHandle: row.phone || row.email || null,
    channels: channelsFromSource(row.source),
    source: row.source,
    status: row.status,
    lastSeenAt: row.updated_at ?? row.created_at,
  };
}

function identitiesFromLead(row: LeadRow): ContactIdentity[] {
  const out: ContactIdentity[] = [];
  if (row.phone) out.push({ channel: "voice", value: row.phone });
  if (row.email) out.push({ channel: "email", value: row.email });
  return out;
}

export async function listContactViews(
  orgId: string,
  opts: { limit?: number } = {},
  db: SupabaseClient = supabaseAdmin
): Promise<ContactListView[]> {
  if (!orgId) return [];
  try {
    const { data } = await db
      .from("leads")
      .select("id, name, phone, email, source, status, notes, created_at, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(opts.limit ?? 200);
    return ((data ?? []) as LeadRow[]).map(leadRowToContactListView);
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONTACTS]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getContactView(
  orgId: string,
  id: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ContactDetailView | null> {
  if (!orgId || !id) return null;
  try {
    const { data: lead } = await db
      .from("leads")
      .select("id, name, phone, email, source, status, notes, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<LeadRow>();
    if (!lead) return null;

    const base = leadRowToContactListView(lead);
    const handle = base.primaryHandle;

    /**
     * Conversation history, fetched TWO ways and merged:
     *
     *  1. `contactId` — pushed into the query (`calls.lead_id` / `conversations.contact_id`), so
     *     a contact's linked history is complete regardless of how old it is. This is the part
     *     that used to be lost: scanning the org's recent 200 and filtering afterwards silently
     *     dropped a customer's earlier conversations once the org grew past that.
     *  2. A recent-window scan matched on `handle` — voice calls from a number we never linked to
     *     a lead carry no `lead_id`, so they are only findable by phone number. Bounded on
     *     purpose: it is a heuristic, and widening it would trade a real cost for a guess.
     */
    const [linked, recent] = await Promise.all([
      listConversationViews(orgId, { contactId: lead.id, limit: 200 }, db),
      handle ? listConversationViews(orgId, { limit: 200 }, db) : Promise.resolve([]),
    ]);

    const seen = new Set(linked.map((c) => `${c.source}:${c.id}`));
    const conversations = [...linked];
    for (const c of recent) {
      const key = `${c.source}:${c.id}`;
      if (seen.has(key)) continue;
      if (handle && c.contact.handle === handle) {
        seen.add(key);
        conversations.push(c);
      }
    }
    conversations.sort(sortByActivityDesc);

    return {
      ...base,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      identities: identitiesFromLead(lead),
      conversations,
    };
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CONTACT_DETAIL]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
