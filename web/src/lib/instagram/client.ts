import "server-only";
import { INSTAGRAM_ENDPOINTS, getInstagramConfig } from "./config";

/**
 * Thin Meta/Instagram Graph client for the Business Login flow (Sprint 1.5).
 * Handles: code → short-lived token → long-lived token, long-lived refresh, and
 * fetching the connected account. No send/reply calls (out of scope).
 * Never logs token values.
 */

export type ShortLivedToken = { accessToken: string; userId: string; permissions?: string[] };
export type LongLivedToken = { accessToken: string; expiresInSec: number };
export type InstagramAccount = { id: string; username?: string; accountType?: string };

/** Exchange the OAuth `code` for a short-lived token (POST form-encoded). */
export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
  const c = getInstagramConfig();
  const form = new URLSearchParams({
    client_id: c.appId,
    client_secret: c.appSecret,
    grant_type: "authorization_code",
    redirect_uri: c.redirectUri,
    code,
  });
  const res = await fetch(INSTAGRAM_ENDPOINTS.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new Error(`instagram token exchange failed (${res.status}): ${safeErr(json)}`);
  }
  return {
    accessToken: String(json.access_token),
    userId: String(json.user_id ?? json.user_id ?? ""),
    permissions: Array.isArray(json.permissions) ? json.permissions : undefined,
  };
}

/** Exchange a short-lived token for a long-lived one (~60 days). */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const c = getInstagramConfig();
  const u = new URL(`${INSTAGRAM_ENDPOINTS.graph}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", c.appSecret);
  u.searchParams.set("access_token", shortLivedToken);
  const res = await fetch(u.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new Error(`instagram long-lived exchange failed (${res.status}): ${safeErr(json)}`);
  }
  return { accessToken: String(json.access_token), expiresInSec: Number(json.expires_in ?? 0) };
}

/** Refresh a long-lived token (valid, ≥24h old, <60d). */
export async function refreshLongLivedToken(longLivedToken: string): Promise<LongLivedToken> {
  const u = new URL(`${INSTAGRAM_ENDPOINTS.graph}/refresh_access_token`);
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", longLivedToken);
  const res = await fetch(u.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new Error(`instagram token refresh failed (${res.status}): ${safeErr(json)}`);
  }
  return { accessToken: String(json.access_token), expiresInSec: Number(json.expires_in ?? 0) };
}

/** Fetch the connected Instagram Business account (id / username / type). */
export async function fetchInstagramAccount(accessToken: string): Promise<InstagramAccount> {
  const u = new URL(`${INSTAGRAM_ENDPOINTS.graph}/me`);
  u.searchParams.set("fields", "id,username,account_type");
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    throw new Error(`instagram account fetch failed (${res.status}): ${safeErr(json)}`);
  }
  return {
    id: String(json.id),
    username: json.username ? String(json.username) : undefined,
    accountType: json.account_type ? String(json.account_type) : undefined,
  };
}

/**
 * Subscribe this app to the connected Instagram account's webhooks
 * (`POST /{ig-user-id}/subscribed_apps`). Without this, Meta delivers no events
 * for the account even after OAuth. Meta returns `{ "success": true }`.
 */
export async function subscribeAppToWebhooks(
  igUserId: string,
  accessToken: string,
  subscribedFields: string[]
): Promise<{ ok: boolean; error?: string }> {
  const form = new URLSearchParams({
    subscribed_fields: subscribedFields.join(","),
    access_token: accessToken,
  });
  const res = await fetch(`${INSTAGRAM_ENDPOINTS.graph}/${igUserId}/subscribed_apps`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    return { ok: false, error: safeErr(json) || `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Read back the account's current webhook subscriptions (for verification). */
export async function getSubscribedApps(
  igUserId: string,
  accessToken: string
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const u = new URL(`${INSTAGRAM_ENDPOINTS.graph}/${igUserId}/subscribed_apps`);
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: safeErr(json) || `HTTP ${res.status}` };
  return { ok: true, data: json?.data ?? json };
}

/** Extract a Meta error message without leaking tokens. */
function safeErr(json: unknown): string {
  const e = (json as { error?: { message?: string; type?: string } } | null)?.error;
  if (e?.message) return `${e.type ?? "error"}: ${e.message}`.slice(0, 200);
  return "unknown_error";
}
