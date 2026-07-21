import "server-only";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";

/**
 * Instagram (Meta) integration configuration — Sprint 1.5.
 *
 * Uses the **Instagram API with Instagram Login** (Business Login) flow, which
 * connects an Instagram Business account directly without a Facebook Page step.
 * All values come from explicit env (set in Vercel + the Meta app); nothing is
 * request-derived. See docs/INSTAGRAM_SETUP.md.
 */

export const INSTAGRAM_ENDPOINTS = {
  authorize: "https://www.instagram.com/oauth/authorize",
  token: "https://api.instagram.com/oauth/access_token", // short-lived, code exchange
  graph: "https://graph.instagram.com", // long-lived exchange, refresh, /me
} as const;

/** Default scopes for receiving messaging/comment webhooks (no send in this sprint). */
const DEFAULT_SCOPES = "instagram_business_basic,instagram_business_manage_messages";

export function getInstagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID ?? "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI ?? "";
  const scopes = (process.env.INSTAGRAM_SCOPES ?? DEFAULT_SCOPES).trim();
  return { appId, appSecret, verifyToken, redirectUri, scopes };
}

/** OAuth connect needs app id/secret, a redirect URI, and the encryption key. */
export function isInstagramOAuthConfigured(): boolean {
  const c = getInstagramConfig();
  return Boolean(c.appId && c.appSecret && c.redirectUri) && isSecretBoxConfigured();
}

/** The webhook only needs the verify token (GET) and app secret (POST signature). */
export function isInstagramWebhookConfigured(): boolean {
  const c = getInstagramConfig();
  return Boolean(c.verifyToken && c.appSecret);
}

/** Build the Meta authorize URL for the connect flow. */
export function buildAuthorizeUrl(state: string): string {
  const c = getInstagramConfig();
  const u = new URL(INSTAGRAM_ENDPOINTS.authorize);
  u.searchParams.set("client_id", c.appId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", c.scopes);
  u.searchParams.set("state", state);
  return u.toString();
}
