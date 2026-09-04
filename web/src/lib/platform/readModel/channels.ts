import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_ORDER, channelMeta, type Channel } from "@/lib/platform/channels";
import { evaluateConnectionHealth } from "@/lib/platform/connectionHealth";
import type { ChannelView } from "@/lib/platform/readModel/types";

/**
 * Channels read model (Sprint 5; made registry-driven in Sprint 7 / R-099).
 *
 * BEFORE: this file hardcoded one query + one mapper per channel, so adding WhatsApp meant editing
 * it (audit C-001). NOW: each channel declares a **connection source** — table + column names — and
 * `listChannelViews` iterates `CHANNEL_ORDER` generically. A channel with no source (not built yet)
 * renders truthfully as "coming soon". Adding a channel = add its registry entry + (when it has one)
 * a `CONNECTION_SOURCES` line; no per-channel query, mapper, or UI edit.
 *
 * Health for every channel comes from the shared `evaluateConnectionHealth` (R-101), so a new
 * channel gets expiry/error signalling for free.
 */

/** Where a channel's per-org connection rows live, and which columns mean what. */
export interface ConnectionSource {
  table: string;
  /** Column holding the human-readable identifier (phone number, @handle). */
  identifierColumn: string;
  /** Column holding the raw status, if any. */
  statusColumn?: string;
  /** Column holding credential expiry, if any. */
  expiresColumn?: string;
  /** Column holding the last provider error, if any. */
  errorColumn?: string;
  /**
   * Column linking this connection to the AI Employee that owns it, if the channel supports
   * per-employee assignment. Makes Employee↔Channel ownership registry-driven (R-104): a future
   * channel that assigns connections to employees works with no code change.
   */
  ownerColumn?: string;
  /** Extra columns to carry into `meta` (e.g. the agent a line is assigned to). */
  metaColumns?: string[];
}

/**
 * Declared per channel. Only channels that are actually connectable have an entry; everything else
 * is coming-soon. **This is the one place a new channel's storage is named.**
 */
export const CONNECTION_SOURCES: Partial<Record<Channel, ConnectionSource>> = {
  voice: {
    table: "phone_lines",
    identifierColumn: "phone_number_e164",
    statusColumn: "status",
    ownerColumn: "assigned_agent_id",
    // `provider` and `verification_status` let a surface tell a Denku-provisioned line from a
    // customer-connected one, and show a BYO line that is still waiting for its first call.
    metaColumns: ["line_type", "vapi_phone_number_id", "assigned_agent_id", "provider", "verification_status"],
  },
  instagram: {
    table: "instagram_connections",
    identifierColumn: "username",
    statusColumn: "status",
    expiresColumn: "token_expires_at",
    errorColumn: "last_error",
    metaColumns: ["ig_user_id"],
  },
  telegram: {
    table: "telegram_connections",
    // A bot is known by its @handle, the same way a phone line is known by its number.
    identifierColumn: "bot_username",
    statusColumn: "status",
    // Bot tokens do not expire — there is nothing to warn about, so no expiry column.
    errorColumn: "last_error",
    ownerColumn: "assigned_agent_id",
    metaColumns: ["bot_id", "bot_name", "last_inbound_at"],
  },
  email: {
    table: "email_connections",
    // The customer recognises this channel by THEIR address (info@theirshop.com), not by the
    // forwarding address we issued them — that one is plumbing they set up once and forget.
    identifierColumn: "forward_from_address",
    statusColumn: "status",
    // Nothing expires: a forwarding rule and a DKIM record both keep working until someone
    // removes them, so there is no credential expiry to warn about.
    errorColumn: "last_error",
    ownerColumn: "assigned_agent_id",
    metaColumns: ["inbound_address", "sending_domain", "sending_domain_status", "reply_mode", "last_inbound_at"],
  },
  web: {
    table: "web_chat_connections",
    // The customer recognises this install by the site it is on, not by the key — which is why
    // `site_name` is the identifier and the key is only ever shown on the install screen.
    identifierColumn: "site_name",
    statusColumn: "status",
    // A site key does not expire; it is rotated deliberately. Nothing to warn about.
    errorColumn: "last_error",
    ownerColumn: "assigned_agent_id",
    // `allowed_origins` travels with the view so a surface can tell an install that is live
    // from one that is embedded nowhere yet — the difference between working and silent.
    metaColumns: ["site_key", "allowed_origins", "last_inbound_at"],
  },
};

/**
 * How many CHAT channels this workspace has actually connected — registry-driven.
 *
 * Written because the dashboard was counting this by hand, naming `telegram_connections` and
 * `email_connections` in a query and nothing else. Web Chat shipped, a customer connected it, and
 * their dashboard told them they were paying for two channels and using zero — while the widget on
 * their site was answering people. The count was not wrong about the database; it was wrong about
 * the product, because it had to be edited to learn about a channel and nobody did.
 *
 * That is precisely what `CONNECTION_SOURCES` exists to prevent, so this asks the registry: every
 * chat channel that declares a table gets counted, and the next one is counted the day its source
 * is declared.
 *
 * Never throws — a nudge is the least important thing on a dashboard. A channel whose table is
 * missing (migration not yet applied) contributes zero rather than failing the whole count.
 */
export async function countConnectedChatChannels(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<number> {
  if (!orgId) return 0;

  // Counted off the shared row fetch rather than one head-count query per channel: this used to
  // be four more sequential round-trips for tables the same render had already read.
  const rows = await channelRows(orgId, db);

  let total = 0;
  for (const channel of CHANNEL_ORDER) {
    if (channelMeta(channel).kind !== "chat") continue;
    const source = CONNECTION_SOURCES[channel];
    if (!source) continue;

    for (const row of rows.get(channel) ?? []) {
      // A channel with no status column is connected by existing at all — the same rule the
      // per-channel `.eq(statusColumn, "connected")` filter expressed.
      if (!source.statusColumn || row[source.statusColumn] === "connected") total += 1;
    }
  }
  return total;
}

/** Build the view for a channel that has no connection rows for this org. Pure. */
export function emptyChannelView(channel: Channel): ChannelView {
  const meta = channelMeta(channel);
  const health = evaluateConnectionHealth({ adopted: meta.adopted });
  return {
    channel,
    label: meta.label,
    kind: meta.kind,
    productionReady: meta.productionReady,
    status: meta.adopted ? "disconnected" : "coming_soon",
    connectionId: null,
    identifier: null,
    assignedTo: null,
    meta: { description: meta.description, connection: meta.connection, health },
  };
}

/** Map one raw connection row to a ChannelView using the channel's source descriptor. Pure. */
export function rowToChannelView(
  channel: Channel,
  source: ConnectionSource,
  row: Record<string, unknown>
): ChannelView {
  const meta = channelMeta(channel);
  const status = source.statusColumn ? (row[source.statusColumn] as string | null) : null;
  const expiresAt = source.expiresColumn ? (row[source.expiresColumn] as string | null) : null;
  const lastError = source.errorColumn ? (row[source.errorColumn] as string | null) : null;
  // A channel is assignable when the registry names the column that binds it to an employee.
  // Passing ownership in lets health distinguish "plumbed" from "actually answered".
  const assignable = Boolean(source.ownerColumn);
  const assignedTo = source.ownerColumn ? ((row[source.ownerColumn] as string | null) ?? null) : null;
  const health = evaluateConnectionHealth({
    status,
    expiresAt,
    lastError,
    adopted: meta.adopted,
    assignable,
    assignedTo,
  });

  const extra: Record<string, unknown> = {};
  for (const col of source.metaColumns ?? []) extra[col] = row[col] ?? null;

  return {
    channel,
    label: meta.label,
    kind: meta.kind,
    productionReady: meta.productionReady,
    // `status` stays the coarse legacy value the UI already understands; `meta.health` carries the
    // rich lifecycle state (R-101).
    status: health.state === "connected" || health.state === "degraded" ? "connected" : health.state === "coming_soon" ? "coming_soon" : "disconnected",
    connectionId: (row.id as string) ?? null,
    identifier: (row[source.identifierColumn] as string | null) ?? null,
    assignedTo,
    meta: { ...extra, description: meta.description, connection: meta.connection, health },
  };
}

function sourceColumns(source: ConnectionSource): string[] {
  return [...new Set([
    "id",
    source.identifierColumn,
    source.statusColumn,
    source.expiresColumn,
    source.errorColumn,
    source.ownerColumn,
    ...(source.metaColumns ?? []),
  ].filter(Boolean) as string[])];
}

/** Raw connection rows for a channel (generic; used for views and for ownership). */
async function fetchChannelRows(
  orgId: string,
  source: ConnectionSource,
  db: SupabaseClient
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await db.from(source.table).select(sourceColumns(source).join(", ")).eq("org_id", orgId);
    if (error) return [];
    return (data ?? []) as unknown as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/**
 * Every declared channel's rows, in one stage and once per request (perf, 2026-09-04).
 *
 * Two separate costs were stacked here, and together they were the single most expensive thing on
 * the dashboard home. First, each function below walked `CHANNEL_ORDER` and **awaited one channel
 * before asking about the next** — five declared sources meant five sequential round-trips to fetch
 * rows that have nothing to do with each other. Second, three different callers wanted the same
 * answer in one render (`PlatformDashboard`, `WorkspaceLaunchpad`, and the chat-channel count), so
 * the workspace's connection tables were being read three times over.
 *
 * Measured on a real workspace: the home page issued `web_chat_connections` three times,
 * `email_connections` three times, `telegram_connections` three times and `instagram_connections`
 * twice — with each set arriving in series.
 *
 * So the sources are fetched together and memoized for the request. `cache()` is keyed on `orgId`
 * alone, which is why the custom-`db` path below bypasses it: a caller that injects its own client
 * (the tests do) must not be served another client's rows, and a fake would poison the key.
 */
type ChannelRows = Map<Channel, Record<string, unknown>[]>;

async function fetchAllChannelRows(orgId: string, db: SupabaseClient): Promise<ChannelRows> {
  const declared = CHANNEL_ORDER.filter((c): c is Channel => Boolean(CONNECTION_SOURCES[c]));
  const results = await Promise.all(
    declared.map((channel) => fetchChannelRows(orgId, CONNECTION_SOURCES[channel]!, db))
  );

  const out: ChannelRows = new Map();
  declared.forEach((channel, i) => out.set(channel, results[i]));
  return out;
}

const cachedChannelRows = cache(async function cachedChannelRows(orgId: string): Promise<ChannelRows> {
  return fetchAllChannelRows(orgId, supabaseAdmin);
});

/** Rows for every declared channel — memoized per request when using the default client. */
async function channelRows(orgId: string, db: SupabaseClient): Promise<ChannelRows> {
  return db === supabaseAdmin ? cachedChannelRows(orgId) : fetchAllChannelRows(orgId, db);
}

/**
 * Channels owned by each Employee, across every channel that supports assignment — registry-driven
 * (R-104). Returns employeeId → ChannelView[]. A new assignable channel needs only an `ownerColumn`.
 */
export async function listChannelsByEmployee(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<Map<string, ChannelView[]>> {
  const byEmployee = new Map<string, ChannelView[]>();
  if (!orgId) return byEmployee;

  const allRows = await channelRows(orgId, db);

  for (const channel of CHANNEL_ORDER) {
    const source = CONNECTION_SOURCES[channel];
    if (!source?.ownerColumn) continue;
    const rows = allRows.get(channel) ?? [];
    for (const row of rows) {
      const owner = row[source.ownerColumn] as string | null;
      if (!owner) continue;
      byEmployee.set(owner, [...(byEmployee.get(owner) ?? []), rowToChannelView(channel, source, row)]);
    }
  }
  return byEmployee;
}

/** Connected (or previously-connected) channel rows for an org — registry-driven. */
export async function listConnectedChannelViews(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ChannelView[]> {
  if (!orgId) return [];

  const allRows = await channelRows(orgId, db);
  const out: ChannelView[] = [];
  for (const channel of CHANNEL_ORDER) {
    const source = CONNECTION_SOURCES[channel];
    if (!source) continue;
    out.push(...(allRows.get(channel) ?? []).map((row) => rowToChannelView(channel, source, row)));
  }
  return out;
}

/** Declared-but-unbuilt channels as truthful "coming soon" affordances. Pure. */
export function comingSoonChannelViews(): ChannelView[] {
  return CHANNEL_ORDER.filter((c) => !channelMeta(c).adopted).map(emptyChannelView);
}

/**
 * The Channels page inventory: every channel in the registry, in order — connected rows where they
 * exist, an empty/coming-soon card otherwise. Adding a channel makes it appear here automatically.
 */
export async function listChannelViews(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ChannelView[]> {
  const connected = await listConnectedChannelViews(orgId, db);
  const byChannel = new Map<Channel, ChannelView[]>();
  for (const v of connected) {
    byChannel.set(v.channel, [...(byChannel.get(v.channel) ?? []), v]);
  }

  const out: ChannelView[] = [];
  for (const channel of CHANNEL_ORDER) {
    const rows = byChannel.get(channel);
    if (rows && rows.length > 0) out.push(...rows);
    else out.push(emptyChannelView(channel));
  }
  return out;
}
