import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveSubkey } from "@/lib/crypto/secretBox";

/**
 * Signed tokens — what replaces a credential on a channel that cannot hold one.
 *
 * A visitor's browser has nothing secret in it, and the widget's own requests are same-origin
 * (it runs in an iframe on our domain), so the `Origin` header on them says "denku.io" and
 * proves nothing about whose website the visitor is actually on. The origin allowlist therefore
 * cannot be enforced request-by-request. It is enforced ONCE, where the browser does tell the
 * truth — when it loads the iframe document and sends the embedding page's `Referer` — and the
 * result is carried forward in a signature.
 *
 * Hence two token kinds, and the handoff between them is the whole security model:
 *
 *   **frame**   — minted by `/embed/chat` after the embedding origin has been checked against
 *                 the install's allowlist. Says: this iframe is running on an origin allowed to
 *                 use this connection. Short-lived; used once, to open a session.
 *   **session** — minted by `/api/webchat/session` in exchange for a valid frame token. Says:
 *                 this browser owns this session, in this org. Presented on every later call.
 *
 * Nothing in a request body is ever believed about identity. `orgId` is read out of a
 * signature, never off the wire — which is what stops anyone who guesses a session id from
 * posting into another business's Inbox.
 *
 * Format: `<base64url(payload json)>.<base64url(hmac-sha256)>`. Not a JWT: there is no
 * algorithm field to confuse, no key id to resolve, and no library that might accept
 * `alg:none`. The only thing that can verify one of these is this file.
 */

const TOKEN_LABEL = "denku:webchat:token:v1";

/**
 * Frame tokens are short-lived because they are single-purpose: the iframe exchanges one for a
 * session within a second of loading. Ten minutes covers a slow load and a clock that disagrees
 * with ours, and expires long before the token is worth copying out of a page source.
 */
export const FRAME_TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Sessions last two hours: long enough that a visitor reading a long page and then asking a
 * question is not interrupted, short enough that a token lifted from a network tab stops
 * working before it is useful. The widget re-opens silently on expiry, so nobody sees this.
 */
export const SESSION_TOKEN_TTL_SECONDS = 2 * 60 * 60;

interface BaseClaims {
  /** `web_chat_connections.id` */
  cid: string;
  /** owning org */
  org: string;
  /** The origin the widget is embedded on, established by the Referer check at frame time. */
  po: string;
  iat: number;
  exp: number;
}

export interface FrameClaims extends BaseClaims {
  kind: "frame";
}

export interface SessionClaims extends BaseClaims {
  kind: "session";
  /** `web_chat_sessions.id` */
  sid: string;
  /** browser-local visitor id, carried so a re-issue keeps the same thread */
  vid: string;
}

export type WebChatClaims = FrameClaims | SessionClaims;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", deriveSubkey(TOKEN_LABEL)).update(body).digest());
}

/** True when the deployment can sign at all. Callers must refuse the channel if false. */
export function isTokenSigningConfigured(): boolean {
  try {
    deriveSubkey(TOKEN_LABEL);
    return true;
  } catch {
    return false;
  }
}

function issue(claims: Omit<WebChatClaims, "iat" | "exp">, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + ttlSeconds };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

export function issueFrameToken(input: { cid: string; org: string; po: string }): string {
  return issue({ kind: "frame", ...input }, FRAME_TOKEN_TTL_SECONDS);
}

export function issueSessionToken(input: {
  cid: string;
  org: string;
  po: string;
  sid: string;
  vid: string;
}): string {
  return issue({ kind: "session", ...input }, SESSION_TOKEN_TTL_SECONDS);
}

/**
 * Verify and decode. Returns null for anything at all wrong — bad shape, wrong kind, bad
 * signature, expired, unsigned deployment. Never throws and never explains which, because the
 * caller has nobody useful to explain it to.
 */
function verify(token: string | null | undefined): WebChatClaims | null {
  const raw = (token ?? "").trim();
  if (!raw) return null;

  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;

  const body = raw.slice(0, dot);
  const presented = raw.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    // No signing key configured. A token cannot be valid on a deployment that cannot sign.
    return null;
  }

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as WebChatClaims;
    if (!payload?.cid || !payload.org || !payload.po) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyFrameToken(token: string | null | undefined): FrameClaims | null {
  const claims = verify(token);
  return claims?.kind === "frame" ? claims : null;
}

export function verifySessionToken(token: string | null | undefined): SessionClaims | null {
  const claims = verify(token);
  if (claims?.kind !== "session") return null;
  return claims.sid && claims.vid ? claims : null;
}
