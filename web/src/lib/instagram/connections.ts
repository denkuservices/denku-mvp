import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox";

/**
 * Persistence for `instagram_connections` (Sprint 1.5). Service-role only (the
 * table is RLS-locked). Access tokens are encrypted at the app layer before
 * insert and decrypted only when needed (refresh). Tokens are NEVER returned to
 * the client — the dashboard reads status metadata only via `PublicConnection`.
 */

export type PublicConnection = {
  org_id: string;
  ig_user_id: string;
  username: string | null;
  account_type: string | null;
  status: "connected" | "revoked" | "error";
  scopes: string[] | null;
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
  connected_at: string;
};

const PUBLIC_COLUMNS =
  "org_id, ig_user_id, username, account_type, status, scopes, token_expires_at, last_refreshed_at, last_error, created_at";

function toPublic(row: Record<string, unknown> | null): PublicConnection | null {
  if (!row) return null;
  return {
    org_id: String(row.org_id),
    ig_user_id: String(row.ig_user_id),
    username: (row.username as string) ?? null,
    account_type: (row.account_type as string) ?? null,
    status: (row.status as PublicConnection["status"]) ?? "connected",
    scopes: (row.scopes as string[]) ?? null,
    token_expires_at: (row.token_expires_at as string) ?? null,
    last_refreshed_at: (row.last_refreshed_at as string) ?? null,
    last_error: (row.last_error as string) ?? null,
    connected_at: String(row.created_at),
  };
}

/** Dashboard-safe view of an org's connection (no token). */
export async function getConnectionByOrg(orgId: string): Promise<PublicConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("instagram_connections")
    .select(PUBLIC_COLUMNS)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[INSTAGRAM][CONN][GET][FAILED]", { orgId, error: error.message });
    return null;
  }
  return toPublic(data);
}

/** Resolve the org that owns an inbound IG account id (best-effort, webhook use). */
export async function getOrgIdByIgUserId(igUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("instagram_connections")
    .select("org_id")
    .eq("ig_user_id", igUserId)
    .maybeSingle<{ org_id: string }>();
  return data?.org_id ?? null;
}

/** Upsert an org's connection after a successful OAuth exchange (encrypts token). */
export async function upsertConnection(params: {
  orgId: string;
  igUserId: string;
  username?: string | null;
  accountType?: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  connectedBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const encrypted = encryptSecret(params.accessToken); // throws if key missing → caller handles
  const { error } = await supabaseAdmin.from("instagram_connections").upsert(
    {
      org_id: params.orgId,
      ig_user_id: params.igUserId,
      username: params.username ?? null,
      account_type: params.accountType ?? null,
      access_token_encrypted: encrypted,
      token_expires_at: params.tokenExpiresAt,
      scopes: params.scopes,
      status: "connected",
      last_error: null,
      connected_by: params.connectedBy,
      last_refreshed_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Disconnect: clear the stored token and mark revoked (keeps the row for audit). */
export async function disconnectConnection(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("instagram_connections")
    .update({ status: "revoked", access_token_encrypted: null, token_expires_at: null })
    .eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Meta DEAUTHORIZE callback: the user removed the app. Revoke the connection
 * (clear the token, mark revoked) — but keep the row + webhook events (deauth is
 * not a data-deletion request; that's a separate callback). Returns the org, if any.
 */
export async function revokeByIgUserId(igUserId: string): Promise<{ orgId: string | null }> {
  const { data } = await supabaseAdmin
    .from("instagram_connections")
    .update({ status: "revoked", access_token_encrypted: null, token_expires_at: null })
    .eq("ig_user_id", igUserId)
    .select("org_id")
    .maybeSingle<{ org_id: string }>();
  return { orgId: data?.org_id ?? null };
}

/**
 * Meta DATA DELETION callback: hard-delete everything tied to an IG account —
 * the connection row and its persisted webhook events. Returns the org, if any.
 */
export async function purgeByIgUserId(igUserId: string): Promise<{ orgId: string | null }> {
  const { data } = await supabaseAdmin
    .from("instagram_connections")
    .select("org_id")
    .eq("ig_user_id", igUserId)
    .maybeSingle<{ org_id: string }>();
  const orgId = data?.org_id ?? null;

  await supabaseAdmin.from("instagram_webhook_events").delete().eq("ig_user_id", igUserId);
  await supabaseAdmin.from("instagram_connections").delete().eq("ig_user_id", igUserId);
  return { orgId };
}

/** For the refresh job: connections with a decryptable token nearing expiry. */
export async function getRefreshableConnections(withinDays = 10): Promise<
  { orgId: string; accessToken: string }[]
> {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("instagram_connections")
    .select("org_id, access_token_encrypted, token_expires_at")
    .eq("status", "connected")
    .not("access_token_encrypted", "is", null)
    .lte("token_expires_at", cutoff);
  if (error || !data) return [];
  const out: { orgId: string; accessToken: string }[] = [];
  for (const row of data) {
    try {
      out.push({ orgId: String(row.org_id), accessToken: decryptSecret(String(row.access_token_encrypted)) });
    } catch {
      // undecryptable (rotated key etc.) — skip; refresh job will report none
    }
  }
  return out;
}

/** Internal: decrypted token + scopes + ig id for an org's connection (webhook subscribe). */
export async function getConnectionSecret(
  orgId: string
): Promise<{ igUserId: string; accessToken: string; scopes: string[] } | null> {
  const { data } = await supabaseAdmin
    .from("instagram_connections")
    .select("ig_user_id, access_token_encrypted, scopes")
    .eq("org_id", orgId)
    .eq("status", "connected")
    .maybeSingle<{ ig_user_id: string; access_token_encrypted: string | null; scopes: string[] | null }>();
  if (!data?.access_token_encrypted) return null;
  try {
    return {
      igUserId: String(data.ig_user_id),
      accessToken: decryptSecret(data.access_token_encrypted),
      scopes: data.scopes ?? [],
    };
  } catch {
    return null; // undecryptable (e.g. rotated key)
  }
}

/** All connected orgs (for the subscribe backfill). */
export async function listConnectedOrgIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("instagram_connections")
    .select("org_id")
    .eq("status", "connected");
  return (data ?? []).map((r) => String(r.org_id));
}

/**
 * Record the webhook-subscription result into the existing `meta` jsonb (no schema
 * change). `meta` currently has no other writer, so a direct overwrite is safe.
 */
export async function recordSubscriptionResult(
  orgId: string,
  result: { ok: boolean; fields: string[]; error?: string }
): Promise<void> {
  const meta = result.ok
    ? { webhook_subscribed: true, subscribed_fields: result.fields, subscribed_at: new Date().toISOString() }
    : { webhook_subscribed: false, subscribe_error: result.error ?? "unknown", subscribe_attempted_at: new Date().toISOString() };
  await supabaseAdmin.from("instagram_connections").update({ meta }).eq("org_id", orgId);
}

/** Persist a refreshed token. */
export async function saveRefreshedToken(
  orgId: string,
  accessToken: string,
  expiresInSec: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  await supabaseAdmin
    .from("instagram_connections")
    .update({
      access_token_encrypted: encryptSecret(accessToken),
      token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
}
