import "server-only";

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
    metaColumns: ["line_type", "vapi_phone_number_id", "assigned_agent_id"],
  },
  instagram: {
    table: "instagram_connections",
    identifierColumn: "username",
    statusColumn: "status",
    expiresColumn: "token_expires_at",
    errorColumn: "last_error",
    metaColumns: ["ig_user_id"],
  },
};

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
  const health = evaluateConnectionHealth({ status, expiresAt, lastError, adopted: meta.adopted });

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
 * Channels owned by each Employee, across every channel that supports assignment — registry-driven
 * (R-104). Returns employeeId → ChannelView[]. A new assignable channel needs only an `ownerColumn`.
 */
export async function listChannelsByEmployee(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<Map<string, ChannelView[]>> {
  const byEmployee = new Map<string, ChannelView[]>();
  if (!orgId) return byEmployee;

  for (const channel of CHANNEL_ORDER) {
    const source = CONNECTION_SOURCES[channel];
    if (!source?.ownerColumn) continue;
    const rows = await fetchChannelRows(orgId, source, db);
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
  const out: ChannelView[] = [];
  for (const channel of CHANNEL_ORDER) {
    const source = CONNECTION_SOURCES[channel];
    if (!source) continue;
    const rows = await fetchChannelRows(orgId, source, db);
    out.push(...rows.map((row) => rowToChannelView(channel, source, row)));
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
