import "server-only";

import { getBaseUrl } from "@/lib/utils/url";
import type { TokenSet } from "@/lib/commerce/connections";

/**
 * IdeaSoft's OAuth2, which is Symfony's FOSOAuthServerBundle wearing a Turkish admin panel.
 *
 * The flow is `authorization_code`, and the part that surprises people is WHO owns the app: the
 * store owner creates it in their own panel (Entegrasyonlar → API → Ekle), which mints the client
 * id and secret and records the redirect URL. There is no Denku-wide app to install. That is why
 * these credentials are per-connection columns rather than env vars.
 *
 * Two things the documentation states that shape the code:
 *   - the authorization `code` is valid for **30 seconds** — exchange it in the callback, never
 *     queue it;
 *   - the refresh token is **single-use and 2 months long** — see `lib/commerce/tokens.ts`.
 */

/** The address the customer must register in their IdeaSoft panel, and that we must send back. */
export function ideasoftRedirectUri(): string {
  return `${getBaseUrl().replace(/\/$/, "")}/api/integrations/ideasoft/callback`;
}

/** Where we send the store owner to approve. */
export function ideasoftAuthorizeUrl(storeBaseUrl: string, clientId: string, state: string): string {
  const url = new URL("/panel/auth", storeBaseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", ideasoftRedirectUri());
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/**
 * Errors that mean "the customer must authorize again", as opposed to "try later".
 *
 * Getting this wrong in either direction is expensive: treating a transient failure as fatal
 * disconnects a working store, and treating a dead grant as transient retries forever while the
 * owner is never told anything is wrong.
 */
const REAUTH_ERRORS = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
  "access_denied",
  "redirect_uri_mismatch",
]);

type TokenAttempt =
  | { ok: true; tokens: TokenSet }
  | { ok: false; reason: string; needsReauth?: boolean }
  /** The endpoint answered with something we could not read — worth trying the other verb. */
  | { ok: false; reason: string; retryable: true };

function readTokenBody(status: number, body: TokenResponse): TokenAttempt {
  if (status >= 400 || body.error) {
    const code = body.error ?? `http_${status}`;
    return { ok: false, reason: code, needsReauth: REAUTH_ERRORS.has(code) };
  }
  if (!body.access_token || !body.refresh_token) {
    return { ok: false, reason: "incomplete_token_response" };
  }
  return {
    ok: true,
    tokens: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 86_400,
      // What the store GRANTED, not what we asked for. R-079 on Instagram was the other way
      // round, and it made a connection look healthy while it could read nothing.
      scope: typeof body.scope === "string" ? body.scope.slice(0, 500) : null,
    },
  };
}

async function callTokenEndpoint(endpoint: string, params: URLSearchParams, verb: "POST" | "GET"): Promise<TokenAttempt> {
  try {
    const res = await fetch(verb === "POST" ? endpoint : `${endpoint}?${params.toString()}`, {
      method: verb,
      headers:
        verb === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
          : { Accept: "application/json" },
      body: verb === "POST" ? params.toString() : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const text = await res.text();
    try {
      return readTokenBody(res.status, JSON.parse(text) as TokenResponse);
    } catch {
      // A non-JSON body from a token endpoint is an HTML error page from something in front of it
      // (Cloudflare, a WAF, a parked domain). Never surface it — it can be a whole page.
      return { ok: false, reason: `unreadable_response_${res.status}`, retryable: true };
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network_error";
    return { ok: false, reason, retryable: true };
  }
}

/**
 * POST form-encoded, falling back to GET with a query string.
 *
 * The documentation labels this endpoint POST and then shows every example as a GET with query
 * parameters. FOSOAuthServerBundle accepts both, but which one a given store accepts is not
 * something to discover in front of a customer. The fallback runs ONLY when the first attempt
 * produced no readable answer — never after a real OAuth error, because a second attempt would
 * spend the same single-use code or refresh token again.
 */
async function requestToken(
  storeBaseUrl: string,
  params: Record<string, string>
): Promise<{ ok: true; tokens: TokenSet } | { ok: false; reason: string; needsReauth?: boolean }> {
  const endpoint = new URL("/oauth/v2/token", storeBaseUrl).toString();
  const query = new URLSearchParams(params);

  const first = await callTokenEndpoint(endpoint, query, "POST");
  if (first.ok || !("retryable" in first)) return first;

  const second = await callTokenEndpoint(endpoint, query, "GET");
  if (second.ok) return second;
  return { ok: false, reason: second.reason };
}

export async function exchangeAuthorizationCode(input: {
  storeBaseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  return requestToken(input.storeBaseUrl, {
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: ideasoftRedirectUri(),
  });
}

/** The `RefreshFn` that `lib/commerce/tokens.ts` calls under its single-flight claim. */
export async function refreshIdeasoftToken(input: {
  storeBaseUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return requestToken(input.storeBaseUrl, {
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
}
