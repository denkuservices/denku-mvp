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
