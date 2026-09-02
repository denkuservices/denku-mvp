import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getClientCredentials,
  markError,
  readTokenState,
  saveTokens,
  type TokenSet,
} from "@/lib/commerce/connections";

/**
 * Getting a usable access token — the most fragile thing in this integration.
 *
 * IdeaSoft's refresh token is **single-use**: every refresh returns a new pair and kills the old
 * one. So two concurrent refreshes do not race harmlessly to the same answer — one wins, and the
 * loser is holding a token that is already dead. The connection then cannot be repaired without
 * the customer going back to their admin panel. A webhook and a live chat arriving in the same
 * second is enough to cause it.
 *
 * The fix is a claim, not a mutex: a conditional UPDATE on `refresh_lock_until` that exactly one
 * caller can win. Same pattern as `sendOnce()` in `lib/email/dispatch.ts` and the advisory-lock
 * lease in `lib/concurrency/leases.ts` — the database is the only thing all instances share.
 *
 * The loser does not fail. It waits briefly and re-reads, because by then the winner has written
 * a token that works for both of them.
 */

/** How long a claim is held before another caller may assume the holder died mid-request. */
const REFRESH_LOCK_MS = 30_000;

/**
 * Refresh this long before the token actually expires.
 *
 * Not an optimisation: a token that passes the check and then expires during the request is a
 * 401 the customer experiences as "the AI could not check that", and a retry storm behind it.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** How long a loser waits for the winner, and how often it looks. */
const LOSER_POLL_MS = 250;
const LOSER_MAX_WAIT_MS = 8_000;

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string; needsReauth?: boolean };

/** Exchange a refresh token for a new pair. Provider-specific, injected by the caller. */
export type RefreshFn = (input: {
  storeBaseUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) => Promise<{ ok: true; tokens: TokenSet } | { ok: false; reason: string; needsReauth?: boolean }>;

/**
 * Try to become the one caller that refreshes.
 *
 * Returns true only if the UPDATE actually matched a row — `.select()` is what makes the claim
 * observable. Without it Supabase reports success for an update that changed nothing, which would
 * hand the claim to everyone.
 */
async function claimRefresh(connectionId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + REFRESH_LOCK_MS).toISOString();
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .update({ refresh_lock_until: until })
      .eq("id", connectionId)
      .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${nowIso}`)
      .select("id");
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function releaseRefresh(connectionId: string): Promise<void> {
  try {
    await supabaseAdmin.from("commerce_connections").update({ refresh_lock_until: null }).eq("id", connectionId);
  } catch {
    /* the lock expires on its own; this only makes the next call faster */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stillValid(expiresAt: number | null): boolean {
  return expiresAt !== null && expiresAt - REFRESH_SKEW_MS > Date.now();
}

/**
 * A token that will still be alive when the request lands, refreshing once if it will not.
 *
 * Never throws. Every failure is a reason string, because the caller is a tool the AI is about to
 * repeat to a customer — and "could not check right now" must be distinguishable from "no such
 * product".
 */
export async function getAccessToken(
  connection: { id: string; storeBaseUrl: string },
  refresh: RefreshFn
): Promise<AccessTokenResult> {
  const state = await readTokenState(connection.id);
  if (!state) return { ok: false, reason: "connection_not_found" };
  if (!state.refreshToken) return { ok: false, reason: "not_authorized", needsReauth: true };

  if (state.accessToken && stillValid(state.accessExpiresAt)) {
    return { ok: true, accessToken: state.accessToken };
  }

  if (!(await claimRefresh(connection.id))) {
    // Someone else is refreshing. Wait for their answer rather than racing them to kill it.
    const deadline = Date.now() + LOSER_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(LOSER_POLL_MS);
      const fresh = await readTokenState(connection.id);
      if (fresh?.accessToken && stillValid(fresh.accessExpiresAt)) {
        return { ok: true, accessToken: fresh.accessToken };
      }
      // The holder finished (lock cleared) but produced nothing usable — stop waiting.
      if (fresh && fresh.refreshLockUntil === null && !stillValid(fresh.accessExpiresAt)) break;
    }
    return { ok: false, reason: "refresh_in_progress" };
  }

  try {
    const creds = await getClientCredentials(connection.id);
    if (!creds) {
      await markError(connection.id, "Client credentials could not be read.");
      return { ok: false, reason: "no_client_credentials", needsReauth: true };
    }

    // Re-read inside the claim: another instance may have refreshed between our first read and
    // winning the lock, and spending a single-use token we no longer need is how a connection
    // breaks for no reason at all.
    const current = await readTokenState(connection.id);
    if (current?.accessToken && stillValid(current.accessExpiresAt)) {
      return { ok: true, accessToken: current.accessToken };
    }
    const refreshToken = current?.refreshToken ?? state.refreshToken;

    const result = await refresh({
      storeBaseUrl: connection.storeBaseUrl,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken,
    });

    if (!result.ok) {
      console.warn("[COMMERCE][TOKEN][REFRESH][FAILED]", {
        connection_id: connection.id,
        reason: result.reason,
        needs_reauth: Boolean(result.needsReauth),
      });
      if (result.needsReauth) {
        await markError(connection.id, `Authorization expired: ${result.reason}`, true);
      } else {
        await markError(connection.id, result.reason);
      }
      return { ok: false, reason: result.reason, needsReauth: result.needsReauth };
    }

    const saved = await saveTokens(connection.id, result.tokens);
    if (!saved) {
      /**
       * The dangerous case, named so nobody "simplifies" it later.
       *
       * The provider has already rotated the pair — the old refresh token is dead on their side
       * whatever happens here — and we failed to write the new one. There is no recovery in code:
       * the connection genuinely needs re-authorizing, and saying so is the only honest move.
       */
      await markError(connection.id, "Refreshed but could not store the new token.", true);
      return { ok: false, reason: "token_store_failed", needsReauth: true };
    }

    console.info("[COMMERCE][TOKEN][REFRESHED]", { connection_id: connection.id });
    return { ok: true, accessToken: result.tokens.accessToken };
  } catch (err) {
    console.error("[COMMERCE][TOKEN][REFRESH][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "refresh_error" };
  } finally {
    await releaseRefresh(connection.id);
  }
}

/**
 * Connections due for a proactive refresh.
 *
 * Called by the cron. Without it, fact #2 of the design bites: IdeaSoft's refresh token expires
 * after two months, so a store nobody messages for two months forces the owner through the whole
 * authorization dance again. Refreshing daily keeps a connection alive indefinitely.
 */
export async function connectionsDueForRefresh(withinMs = 6 * 60 * 60 * 1000): Promise<
  { id: string; orgId: string; storeBaseUrl: string }[]
> {
  try {
    const { data, error } = await supabaseAdmin
      .from("commerce_connections")
      .select("id, org_id, store_base_url")
      .eq("status", "connected")
      .lt("access_expires_at", new Date(Date.now() + withinMs).toISOString())
      .limit(200);
    if (error || !data) return [];
    return (data as { id: string; org_id: string; store_base_url: string }[]).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      storeBaseUrl: r.store_base_url,
    }));
  } catch {
    return [];
  }
}
