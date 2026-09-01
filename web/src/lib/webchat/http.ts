import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/utils/url";
import { corsHeaders, isOriginAllowed, normalizeOrigin, originWithSibling } from "@/lib/webchat/origins";
import type { WebChatConnection } from "@/lib/webchat/connections";

/**
 * The Web Chat endpoints are the only unauthenticated, write-capable surface in this
 * application. Everything they share about *how to refuse* lives here, so refusing correctly is
 * the default rather than something each route remembers to do.
 *
 * Two rules, applied to every one of them:
 *
 *   1. **No CORS headers on a refusal.** A rejected cross-origin request gets a plain response
 *      with no `Access-Control-Allow-Origin`, so the calling page cannot read the status. A
 *      script probing site keys from its own site learns nothing — not whether the key exists,
 *      not which check failed.
 *   2. **One shape for every error.** `{ ok: false, error: "<code>" }` with a machine code, never
 *      a sentence. The widget shows its own copy; a server sentence would leak which of several
 *      checks failed.
 */

/** Codes the widget knows how to react to. Anything else is a generic failure to it. */
export type WebChatErrorCode =
  | "bad_request"
  | "unknown_site"
  | "origin_not_allowed"
  | "disabled"
  | "not_configured"
  | "invalid_session"
  | "rate_limited"
  // Upload-only, and both are things the visitor can act on: pick a smaller file, or a different
  // kind of file. Every other refusal is deliberately indistinguishable to a caller.
  | "too_large"
  | "unsupported_type"
  | "server_error";

/** A refusal nobody cross-origin can read. Deliberately CORS-free — see rule 1. */
export function refuse(code: WebChatErrorCode, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}

/** A readable answer. CORS headers are added only when the caller is genuinely cross-origin. */
export function allow(origin: string | null, body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: origin ? corsHeaders(origin) : undefined });
}

/**
 * Preflight.
 *
 * Answered without consulting the database: a browser asking "may I POST here" is not yet a
 * request, and looking up a site key on it would make the endpoint an oracle for which keys
 * exist. The real check happens on the POST that follows.
 */
export function preflight(req: NextRequest): NextResponse {
  const origin = normalizeOrigin(req.headers.get("origin"));
  if (!origin) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/** The caller's origin, normalised, or null when there isn't a usable one. */
export function requestOrigin(req: NextRequest): string | null {
  return normalizeOrigin(req.headers.get("origin"));
}

/**
 * Our own origin — what a same-origin fetch from inside the widget iframe carries.
 *
 * Returns BOTH the configured host and its www/apex twin. This deployment names the apex in
 * `NEXT_PUBLIC_SITE_URL` and serves from `www`, so a single value would not recognise our own
 * dashboard — which is exactly how the in-product preview refused itself the first time it was
 * opened. Recognising both is not a widening: they are the same site, under the same control.
 */
export function selfOrigins(): string[] {
  const base = normalizeOrigin(getBaseUrl());
  return base ? originWithSibling(base) : [];
}

/** Is this origin us? */
export function isSelfOrigin(origin: string | null): boolean {
  return !!origin && selfOrigins().includes(origin);
}

/**
 * May this request talk to this connection?
 *
 * **Why the allowlist is not the check here.** The widget runs in an iframe on our own domain,
 * so its `fetch` carries `Origin: https://denku.io` no matter whose website the visitor is
 * actually on. Enforcing the customer's allowlist on this header would refuse every legitimate
 * request and accept nothing useful in exchange. The embedding origin is established once, by
 * `/embed/chat` reading the browser-set `Referer`, and travels in the signed token from there —
 * that is where the allowlist is enforced, and `token.ts` explains why that is the only place a
 * browser tells the truth about it.
 *
 * What remains here is still worth doing: a same-origin call (the widget) or a call from an
 * origin the customer listed (a direct integration that skips the iframe) is accepted; anything
 * else is refused with no readable answer.
 *
 * Re-run on EVERY request rather than trusted from the token. A token is two hours old at
 * worst, and in those two hours the customer may have switched the widget off or removed a
 * domain. Re-checking is one indexed read, and it means "turn it off" means now.
 */
export function connectionUsable(
  connection: WebChatConnection | null,
  origin: string | null
): WebChatErrorCode | null {
  if (!connection) return "unknown_site";
  if (connection.status !== "connected") return "disabled";

  // A missing Origin header is a non-browser caller (curl, a server-side integration). It is not
  // refused here — the signed token is what authorises it — but it gets no CORS headers either.
  if (!origin) return null;
  if (isSelfOrigin(origin)) return null;
  if (isOriginAllowed(origin, connection.allowedOrigins)) return null;
  return "origin_not_allowed";
}

/** Parse a JSON body without letting a malformed one become a 500. */
export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** CORS headers only when the caller is cross-origin; same-origin needs none. */
export function corsFor(origin: string | null): string | null {
  if (!origin || isSelfOrigin(origin)) return null;
  return origin;
}
