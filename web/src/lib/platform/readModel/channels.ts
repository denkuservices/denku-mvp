import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNELS, channelMeta, type Channel } from "@/lib/platform/channels";
import type { ChannelView } from "@/lib/platform/readModel/types";

/**
 * Channels read model (Sprint 5, P0).
 *
 * The org-level channel inventory, sourced from the channel-native connection tables:
 *   - voice     ← `phone_lines`
 *   - instagram ← `instagram_connections`
 * Plus `comingSoonChannelViews()` — a registry-derived list of not-yet-built channels
 * (WhatsApp, Email, SMS) surfaced as disabled "coming soon" affordances, so the platform's
 * extensibility is visible without implementing those channels. Pure mappers exported.
 *
 * When `employee_channels` is backfilled (R-081), Employee↔Channel ownership comes from
 * there; the org inventory below stays sourced from the connection tables regardless.
 */

// --- pure mappers -----------------------------------------------------------

export interface PhoneLineRow {
  id: string;
  phone_number_e164: string | null;
  status: string | null;
  line_type: string | null;
  assigned_agent_id: string | null;
  vapi_phone_number_id: string | null;
}

export function phoneLineToChannelView(row: PhoneLineRow): ChannelView {
  const meta = channelMeta("voice");
  return {
    channel: "voice",
    label: meta.label,
    kind: meta.kind,
    productionReady: meta.productionReady,
    status: row.status === "live" || row.status === "active" ? "connected" : "disconnected",
    connectionId: row.id,
    identifier: row.phone_number_e164,
    meta: {
      lineType: row.line_type ?? null,
      vapiPhoneNumberId: row.vapi_phone_number_id ?? null,
      assignedEmployeeId: row.assigned_agent_id ?? null,
    },
  };
}

export interface InstagramConnectionRow {
  id: string;
  username: string | null;
  ig_user_id: string | null;
  status: string | null;
}

export function instagramConnectionToChannelView(row: InstagramConnectionRow): ChannelView {
  const meta = channelMeta("instagram");
  return {
    channel: "instagram",
    label: meta.label,
    kind: meta.kind,
    productionReady: meta.productionReady,
    status: row.status === "connected" ? "connected" : "disconnected",
    connectionId: row.id,
    identifier: row.username ?? row.ig_user_id,
    meta: { igUserId: row.ig_user_id ?? null },
  };
}

/** Registry-derived "coming soon" channels (not production, not adopted). Pure. */
export function comingSoonChannelViews(): ChannelView[] {
  const order: Channel[] = ["whatsapp", "email", "sms"];
  return order
    .filter((c) => !CHANNELS[c].productionReady && !CHANNELS[c].adopted)
    .map((c) => {
      const meta = channelMeta(c);
      return {
        channel: c,
        label: meta.label,
        kind: meta.kind,
        productionReady: meta.productionReady,
        status: "coming_soon" as const,
        connectionId: null,
        identifier: null,
        meta: {},
      };
    });
}

// --- fetch ------------------------------------------------------------------

/** All connected channels for an org (voice lines + IG connections). */
export async function listConnectedChannelViews(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ChannelView[]> {
  if (!orgId) return [];
  const out: ChannelView[] = [];
  try {
    const { data: lines } = await db
      .from("phone_lines")
      .select("id, phone_number_e164, status, line_type, assigned_agent_id, vapi_phone_number_id")
      .eq("org_id", orgId);
    for (const l of (lines ?? []) as PhoneLineRow[]) out.push(phoneLineToChannelView(l));

    const { data: igs } = await db
      .from("instagram_connections")
      .select("id, username, ig_user_id, status")
      .eq("org_id", orgId);
    for (const g of (igs ?? []) as InstagramConnectionRow[]) out.push(instagramConnectionToChannelView(g));
  } catch (err) {
    console.error("[PLATFORM][READMODEL][CHANNELS]", err instanceof Error ? err.message : String(err));
  }
  return out;
}

/** The Channels page inventory: connected channels + coming-soon affordances. */
export async function listChannelViews(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<ChannelView[]> {
  const connected = await listConnectedChannelViews(orgId, db);
  return [...connected, ...comingSoonChannelViews()];
}
