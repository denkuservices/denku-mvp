import "server-only";

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import type { CommerceConnection, CommerceProvider } from "@/lib/commerce/types";
import { defaultStoreLabel } from "@/lib/commerce/storeUrl";

/**
 * Commerce connection lifecycle: start a connect, finish it, read it, drop it.
 *
 * Mirrors `lib/telegram/connections.ts` because the trust shape is the same — a credential a
 * business hands us to act on their behalf — and two rules carry over unchanged:
 *
 *   - **Encrypted before stored, and REFUSE to store at all when no key is configured.** A
 *     plaintext fallback would be silent and wrong, and this row holds two months of access to a
 *     real store's catalogue and orders.
 *   - **Decryption happens in one place per secret** and the plaintext never leaves this module's
 *     immediate callers.
 *
 * What is different from Telegram: a connection exists BEFORE it works. The customer registers a
 * redirect URL in their own IdeaSoft panel, we mint a `state`, and they leave to approve. The row
 * that waits for them is `status = 'pending'` with no tokens, and nothing may read it as usable.
 */

const COLUMNS =
  "id, org_id, provider, store_base_url, store_label, client_id, status, granted_scope, " +
  "last_error, last_verified_at, access_expires_at, refresh_expires_at, created_at";

type Row = {
  id: string;
  org_id: string;
  provider: CommerceProvider;
  store_base_url: string;
  store_label: string | null;
  client_id: string;
  status: CommerceConnection["status"];
  granted_scope: string | null;
  last_error: string | null;
  last_verified_at: string | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  created_at: string;
};

function toConnection(row: Row): CommerceConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    storeBaseUrl: row.store_base_url,
    storeLabel: row.store_label,
    clientId: row.client_id,
    status: row.status,
    grantedScope: row.granted_scope,
    lastError: row.last_error,
    lastVerifiedAt: row.last_verified_at,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    createdAt: row.created_at,
  };
}

/** How long the customer has to approve on their own panel before the nonce goes stale. */
const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

export interface StartConnectInput {
  orgId: string;
  provider: CommerceProvider;
  storeBaseUrl: string;
  storeLabel: string | null;
  clientId: string;
  clientSecret: string;
}

export type StartConnectResult =
  | { ok: true; connectionId: string; state: string }
  | { ok: false; reason: string };

/**
 * Create (or re-arm) the row the OAuth callback will find.
 *
 * Re-connecting the same store UPDATES rather than inserting: a customer who mistyped a secret and
 * tries again must not end up with two rows, one of which holds credentials that will never work.
 */
export async function startConnect(input: StartConnectInput): Promise<StartConnectResult> {
  if (!isSecretBoxConfigured()) {
    console.error("[COMMERCE][CONNECT][NO_ENCRYPTION_KEY]");
    return { ok: false, reason: "Secure storage is not configured on this deployment." };
  }

  const state = randomBytes(32).toString("base64url");
  const now = Date.now();

  try {
    const payload = {
      org_id: input.orgId,
      provider: input.provider,
      store_base_url: input.storeBaseUrl,
      store_label: input.storeLabel || defaultStoreLabel(input.storeBaseUrl),
      client_id: input.clientId,
      client_secret_encrypted: encryptSecret(input.clientSecret),
      // A re-connect starts over: whatever tokens the old attempt held are worthless now.
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      access_expires_at: null,
      refresh_expires_at: null,
      granted_scope: null,
      oauth_state: state,
      oauth_state_expires_at: new Date(now + OAUTH_STATE_TTL_MS).toISOString(),
      status: "pending" as const,
      last_error: null,
      refresh_lock_until: null,
      updated_at: new Date(now).toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .upsert(payload, { onConflict: "org_id,provider,store_base_url" })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("[COMMERCE][CONNECT][START][FAILED]", error?.message);
      return { ok: false, reason: "Could not start the connection." };
    }
    return { ok: true, connectionId: data.id, state };
  } catch (err) {
    console.error("[COMMERCE][CONNECT][START][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "Could not start the connection." };
  }
}

/**
 * Resolve the pending connection a callback claims to be for.
 *
 * The `state` is the ONLY thing believed here: it is unguessable, single-use, and short-lived.
 * Neither the org nor the store is read off the request.
 */
export async function consumeOauthState(
  state: string
): Promise<{ id: string; orgId: string; storeBaseUrl: string; clientId: string; clientSecret: string } | null> {
  if (!state) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select("id, org_id, store_base_url, client_id, client_secret_encrypted, oauth_state_expires_at")
      .eq("oauth_state", state)
      .maybeSingle<{
        id: string;
        org_id: string;
        store_base_url: string;
        client_id: string;
        client_secret_encrypted: string;
        oauth_state_expires_at: string | null;
      }>();

    if (error || !data) return null;
    if (data.oauth_state_expires_at && new Date(data.oauth_state_expires_at).getTime() < Date.now()) {
      console.warn("[COMMERCE][CONNECT][STATE][EXPIRED]", { connection_id: data.id });
      return null;
    }

    // Burn it before the exchange, not after: a replayed callback must find nothing, even if the
    // exchange below fails and the customer has to start over.
    await supabaseAdmin
      .from("commerce_connections")
      .update({ oauth_state: null, oauth_state_expires_at: null })
      .eq("id", data.id);

    return {
      id: data.id,
      orgId: data.org_id,
      storeBaseUrl: data.store_base_url,
      clientId: data.client_id,
      clientSecret: decryptSecret(data.client_secret_encrypted),
    };
  } catch (err) {
    console.error("[COMMERCE][CONNECT][STATE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** The client credentials for a token refresh. Isolated so the secret is read in one query. */
export async function getClientCredentials(
  connectionId: string
): Promise<{ clientId: string; clientSecret: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select("client_id, client_secret_encrypted")
      .eq("id", connectionId)
      .maybeSingle<{ client_id: string; client_secret_encrypted: string }>();
    if (error || !data?.client_secret_encrypted) return null;
    return { clientId: data.client_id, clientSecret: decryptSecret(data.client_secret_encrypted) };
  } catch (err) {
    console.error("[COMMERCE][CREDENTIALS][DECRYPT][FAILED]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Seconds, as the provider reported it. */
  expiresIn: number;
  scope: string | null;
}

/**
 * Store a freshly minted token pair and mark the connection usable.
 *
 * Written as ONE update so a crash between the two tokens is impossible: a row holding a new
 * access token beside a dead refresh token is a connection that works for 24 hours and then
 * cannot be repaired without the customer.
 */
export async function saveTokens(connectionId: string, tokens: TokenSet): Promise<boolean> {
  try {
    const now = Date.now();
    const { error } = await supabaseAdmin
      .from("commerce_connections")
      .update({
        access_token_encrypted: encryptSecret(tokens.accessToken),
        refresh_token_encrypted: encryptSecret(tokens.refreshToken),
        access_expires_at: new Date(now + tokens.expiresIn * 1000).toISOString(),
        // IdeaSoft's refresh token is good for two months, and every refresh restarts that clock.
        refresh_expires_at: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
        granted_scope: tokens.scope,
        status: "connected",
        last_error: null,
        refresh_lock_until: null,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", connectionId);

    if (error) {
      console.error("[COMMERCE][TOKENS][SAVE][FAILED]", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[COMMERCE][TOKENS][SAVE][ERROR]", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** The decrypted access token, with the moment it dies. Callers must check expiry themselves. */
export async function readTokenState(connectionId: string): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number | null;
  refreshLockUntil: number | null;
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select("access_token_encrypted, refresh_token_encrypted, access_expires_at, refresh_lock_until")
      .eq("id", connectionId)
      .maybeSingle<{
        access_token_encrypted: string | null;
        refresh_token_encrypted: string | null;
        access_expires_at: string | null;
        refresh_lock_until: string | null;
      }>();
    if (error || !data) return null;
    return {
      accessToken: data.access_token_encrypted ? decryptSecret(data.access_token_encrypted) : null,
      refreshToken: data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null,
      accessExpiresAt: data.access_expires_at ? new Date(data.access_expires_at).getTime() : null,
      refreshLockUntil: data.refresh_lock_until ? new Date(data.refresh_lock_until).getTime() : null,
    };
  } catch (err) {
    console.error("[COMMERCE][TOKENS][READ][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function markError(connectionId: string, reason: string, revoked = false): Promise<void> {
  try {
    await supabaseAdmin
      .from("commerce_connections")
      .update({
        status: revoked ? "revoked" : "error",
        last_error: reason.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
  } catch {
    // Never throw from bookkeeping — the caller is already handling a failure.
  }
}

export async function markVerified(connectionId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("commerce_connections")
      .update({
        status: "connected",
        last_error: null,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
  } catch {
    /* best effort */
  }
}

export async function listConnections(orgId: string): Promise<CommerceConnection[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as Row[]).map(toConnection);
  } catch (err) {
    console.error("[COMMERCE][CONNECTION][LIST][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * The org's usable store, if it has one.
 *
 * "Usable" excludes pending, revoked and errored rows — the AI must not be handed tools backed by
 * a connection that cannot answer. One store per workspace for now: the first customer has one,
 * and picking between two is a product question nobody has asked yet.
 */
export async function getActiveConnection(orgId: string): Promise<CommerceConnection | null> {
  if (!orgId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[COMMERCE][CONNECTION][ACTIVE][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getConnection(orgId: string, connectionId: string): Promise<CommerceConnection | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select(COLUMNS)
      .eq("id", connectionId)
      .eq("org_id", orgId)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch {
    return null;
  }
}

/** Disconnect: the row goes, and with it both credentials. There is nothing worth keeping. */
export async function deleteConnection(orgId: string, connectionId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("commerce_connections")
      .delete()
      .eq("id", connectionId)
      .eq("org_id", orgId);
    if (error) {
      console.error("[COMMERCE][CONNECTION][DELETE][FAILED]", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
