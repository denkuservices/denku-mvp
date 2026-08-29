import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildInboundAddress, inboundDomain } from "@/lib/email/channel/address";
import { normalizeEmailAddress } from "@/lib/platform/adapters/email";
import { addressBelongsToDomain } from "@/lib/email/channel/rules";

/**
 * Email connection lifecycle: issue a forwarding address, resolve it on inbound, drop it.
 *
 * This channel holds NO credential, which is the whole point of choosing forwarding over OAuth.
 * There is no token to encrypt, nothing to refresh, and nothing whose leak would let someone
 * read the customer's mailbox. What the row does grant — once a domain is verified — is the
 * ability to SEND as that business, which is why the table is still service-role only.
 *
 * Two asymmetries with Telegram worth knowing:
 *   - Inbound is resolved by ADDRESS, not by a path id, because a delivery tells us only who it
 *     was addressed to. Hence the global unique on `inbound_address`.
 *   - Connecting cannot verify anything up front. Telegram can call `getMe` and know the token
 *     is real before storing it; nobody can tell us a forwarding rule exists until the first
 *     mail arrives. So a connection is born unverified and is confirmed by traffic.
 */

export type ConnectionStatus = "connected" | "revoked" | "error";
export type SendingDomainStatus = "unverified" | "pending" | "verified" | "failed";
export type ReplyMode = "draft" | "auto";

export interface EmailConnection {
  id: string;
  orgId: string;
  inboundAddress: string;
  forwardFromAddress: string | null;
  forwardVerifiedAt: string | null;
  /** Shown only while forwarding is unconfirmed, as the manual way out. */
  forwardVerificationCode: string | null;
  forwardVerificationUrl: string | null;
  sendingDomain: string | null;
  sendingDomainStatus: SendingDomainStatus;
  /** The provider-side domain record, needed to re-check DNS. Never rendered. */
  resendDomainId: string | null;
  fromName: string | null;
  fromAddress: string | null;
  replyMode: ReplyMode;
  assignedAgentId: string | null;
  status: ConnectionStatus;
  lastError: string | null;
  lastInboundAt: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  org_id: string;
  inbound_address: string;
  forward_from_address: string | null;
  forward_verified_at: string | null;
  forward_verification_code: string | null;
  meta: Record<string, unknown> | null;
  sending_domain: string | null;
  sending_domain_status: SendingDomainStatus;
  resend_domain_id: string | null;
  from_name: string | null;
  from_address: string | null;
  reply_mode: ReplyMode;
  assigned_agent_id: string | null;
  status: ConnectionStatus;
  last_error: string | null;
  last_inbound_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, org_id, inbound_address, forward_from_address, forward_verified_at, forward_verification_code, meta, sending_domain, " +
  "sending_domain_status, resend_domain_id, from_name, from_address, reply_mode, assigned_agent_id, status, " +
  "last_error, last_inbound_at, created_at";

function toConnection(row: Row): EmailConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    inboundAddress: row.inbound_address,
    forwardFromAddress: row.forward_from_address,
    forwardVerifiedAt: row.forward_verified_at,
    forwardVerificationCode: row.forward_verification_code,
    forwardVerificationUrl:
      typeof row.meta?.gmail_verification_url === "string" ? row.meta.gmail_verification_url : null,
    sendingDomain: row.sending_domain,
    sendingDomainStatus: row.sending_domain_status,
    resendDomainId: row.resend_domain_id,
    fromName: row.from_name,
    fromAddress: row.from_address,
    replyMode: row.reply_mode,
    assignedAgentId: row.assigned_agent_id,
    status: row.status,
    lastError: row.last_error,
    lastInboundAt: row.last_inbound_at,
    createdAt: row.created_at,
  };
}

/**
 * Inbound resolution: which connection was this mail addressed to?
 *
 * The webhook's first real decision. Never throws — an unrecognised address must produce a
 * logged 200, not a retry storm.
 */
export async function getConnectionByInboundAddress(address: string | null): Promise<EmailConnection | null> {
  const normalized = normalizeEmailAddress(address);
  if (!normalized) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("email_connections")
      .select(COLUMNS)
      .eq("inbound_address", normalized)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[EMAIL][CONNECTION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Outbound resolution: the connection a reply must travel through. Never throws. */
export async function getConnectionById(connectionId: string): Promise<EmailConnection | null> {
  if (!connectionId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("email_connections")
      .select(COLUMNS)
      .eq("id", connectionId)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[EMAIL][CONNECTION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function listConnections(orgId: string): Promise<EmailConnection[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("email_connections")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as Row[]).map(toConnection);
  } catch (err) {
    console.error("[EMAIL][CONNECTION][LIST][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Every address that is US for this connection.
 *
 * Handed to the adapter's loop guard. Without it, the artifact-notification email Denku sends
 * the owner would arrive back at the connected mailbox, be read as a customer writing in,
 * answered, and generate another notification.
 */
export function selfAddressesFor(connection: EmailConnection, ownerNotificationAddress?: string | null): string[] {
  return [
    connection.inboundAddress,
    connection.forwardFromAddress,
    connection.fromAddress,
    ownerNotificationAddress ?? null,
  ].filter((address): address is string => Boolean(address));
}

export interface ConnectResult {
  ok: boolean;
  connection?: EmailConnection;
  /** A sentence a shop owner can act on — shown in the UI verbatim. */
  error?: string;
}

/**
 * Issue a forwarding address for an org.
 *
 * Unlike Telegram there is nothing to verify first: no provider can confirm a forwarding rule
 * exists before the first mail comes through it. So this writes an unverified row and the
 * customer's own mail settings do the rest. `forward_verified_at` is stamped later — either by
 * Gmail's confirmation mail landing at the new address, or by real traffic arriving.
 */
export async function createConnection(input: {
  orgId: string;
  workspaceName?: string | null;
  forwardFromAddress: string;
  connectedBy?: string | null;
  assignedAgentId?: string | null;
}): Promise<ConnectResult> {
  const { orgId } = input;
  if (!orgId) return { ok: false, error: "No workspace." };

  if (!inboundDomain()) {
    // Fail loudly rather than issuing an address at a domain that receives nothing. A customer
    // who sets up forwarding to a dead address gets silence and blames their own mail settings.
    console.error("[EMAIL][CONNECT][NO_INBOUND_DOMAIN]");
    return { ok: false, error: "Email receiving is not configured yet. Contact support." };
  }

  const forwardFrom = normalizeEmailAddress(input.forwardFromAddress);
  if (!forwardFrom) return { ok: false, error: "That does not look like an email address." };

  try {
    const existing = await listConnections(orgId);
    if (existing.some((c) => c.forwardFromAddress === forwardFrom)) {
      return { ok: false, error: "That address is already connected." };
    }

    /**
     * Auto-assign when the workspace has exactly one AI Employee.
     *
     * Same reasoning as Telegram's connect path: with one employee there is no choice to make,
     * and leaving the connection unassigned would show "Assign an employee" on a card whose
     * only possible answer is already known.
     */
    let assignedAgentId = input.assignedAgentId ?? null;
    if (!assignedAgentId) {
      const { data: agents } = await supabaseAdmin.from("agents").select("id").eq("org_id", orgId).limit(2);
      if (agents?.length === 1) assignedAgentId = agents[0].id as string;
    }

    const inboundAddress = buildInboundAddress(input.workspaceName);
    if (!inboundAddress) return { ok: false, error: "Email receiving is not configured yet. Contact support." };

    const { data, error } = await supabaseAdmin
      .from("email_connections")
      .insert({
        org_id: orgId,
        inbound_address: inboundAddress,
        forward_from_address: forwardFrom,
        assigned_agent_id: assignedAgentId,
        connected_by: input.connectedBy ?? null,
        // Sending stays off until a domain is verified. An AI that drafts but cannot send is a
        // useful half-built channel; one that sends from denku.io is an over-claim.
        sending_domain_status: "unverified",
        reply_mode: "draft",
        status: "connected",
      })
      .select(COLUMNS)
      .single<Row>();

    if (error || !data) {
      console.error("[EMAIL][CONNECT][INSERT][FAILED]", error?.message);
      return { ok: false, error: "Could not connect that address. Please try again." };
    }

    console.info("[EMAIL][CONNECT][OK]", { org_id: orgId, connection_id: data.id });
    return { ok: true, connection: toConnection(data) };
  } catch (err) {
    console.error("[EMAIL][CONNECT][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Could not connect that address. Please try again." };
  }
}

export async function disconnect(orgId: string, connectionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !connectionId) return { ok: false, error: "Nothing to disconnect." };
  try {
    const { error } = await supabaseAdmin
      .from("email_connections")
      .delete()
      .eq("id", connectionId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: "Could not disconnect. Please try again." };
    console.info("[EMAIL][DISCONNECT][OK]", { org_id: orgId, connection_id: connectionId });
    // The customer must also remove the forwarding rule in their own mail settings — the UI
    // says so, because we cannot do it for them and mail would otherwise keep arriving.
    return { ok: true };
  } catch (err) {
    console.error("[EMAIL][DISCONNECT][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Could not disconnect. Please try again." };
  }
}

async function patch(orgId: string, connectionId: string, values: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("email_connections")
      .update(values)
      .eq("id", connectionId)
      .eq("org_id", orgId);
    return !error;
  } catch (err) {
    console.error("[EMAIL][CONNECTION][UPDATE][ERROR]", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function assignEmployee(orgId: string, connectionId: string, agentId: string | null): Promise<boolean> {
  return patch(orgId, connectionId, { assigned_agent_id: agentId });
}

export async function setReplyMode(orgId: string, connectionId: string, mode: ReplyMode): Promise<boolean> {
  return patch(orgId, connectionId, { reply_mode: mode });
}

/**
 * Set the address replies are sent FROM, and the name shown beside it.
 *
 * Normally there is nothing to set: a business forwards `info@theirshop.com`, verifies
 * `theirshop.com`, and replies go back out as `info@theirshop.com` — the address their customers
 * already know. This exists for the case that default cannot serve: a small business whose
 * public address is `theshop@gmail.com`. Nobody can DKIM-sign `gmail.com`, so without a
 * separate reply address those businesses could never answer as themselves at all.
 *
 * The domain check is enforced HERE as well as at send time. Rejecting early gives the owner a
 * sentence they can act on instead of a reply that silently never leaves.
 */
export async function setReplyFrom(
  orgId: string,
  connectionId: string,
  fromAddress: string,
  fromName: string | null
): Promise<{ ok: boolean; error?: string }> {
  const connection = await getConnectionById(connectionId);
  if (!connection || connection.orgId !== orgId) return { ok: false, error: "Not found" };

  const address = normalizeEmailAddress(fromAddress);
  if (!address) return { ok: false, error: "That does not look like an email address." };

  if (connection.sendingDomainStatus !== "verified" || !connection.sendingDomain) {
    return { ok: false, error: "Verify your sending domain first." };
  }
  if (!addressBelongsToDomain(address, connection.sendingDomain)) {
    return {
      ok: false,
      error: `Use an address at ${connection.sendingDomain} — that is the domain you verified.`,
    };
  }

  const ok = await patch(orgId, connectionId, {
    from_address: address,
    from_name: fromName?.trim() || null,
  });
  return ok ? { ok: true } : { ok: false, error: "Could not save. Please try again." };
}

/** Stamped by the webhook the first time real mail arrives — the proof forwarding works. */
export async function markInbound(connectionId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("email_connections")
      .update({ last_inbound_at: now, last_error: null, forward_verified_at: now })
      .eq("id", connectionId)
      .is("forward_verified_at", null);
    // Separate, unconditional touch so the heartbeat updates on every delivery, not just the
    // first — the conditional above exists only to avoid rewriting the verification moment.
    await supabaseAdmin.from("email_connections").update({ last_inbound_at: now }).eq("id", connectionId);
  } catch (err) {
    console.error("[EMAIL][MARK_INBOUND][ERROR]", err instanceof Error ? err.message : String(err));
  }
}

export async function markError(connectionId: string, message: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("email_connections")
      .update({ last_error: message.slice(0, 500), status: "error" })
      .eq("id", connectionId);
  } catch (err) {
    console.error("[EMAIL][MARK_ERROR][ERROR]", err instanceof Error ? err.message : String(err));
  }
}
