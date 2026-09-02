import "server-only";

import { getAccessToken } from "@/lib/commerce/tokens";
import { markError, markVerified } from "@/lib/commerce/connections";
import { refreshIdeasoftToken } from "@/lib/commerce/providers/ideasoft/oauth";

/**
 * The one door to a customer's IdeaSoft store.
 *
 * Everything provider-specific about *talking* lives here: the bearer token, the two base paths,
 * the retry policy, and the budget. `products.ts` and anything after it only describe WHAT to ask.
 *
 * Three constraints from the documentation drive the shape:
 *
 *   1. **There is no published rate limit.** The docs say 429 exists and that the threshold
 *      "changes dynamically", and decline to name a number. So the defence cannot be a quota we
 *      compute — it is backoff, a short cache, and a hard ceiling on how long a customer waits.
 *   2. **Cloudflare sits in front of every store.** A failure can arrive as an HTML error page
 *      with a 5xx, so nothing may assume a JSON body, and no upstream body is ever shown to a
 *      customer.
 *   3. **Two base paths.** `/admin-api/` is the backoffice (what we use); `/api/` is the
 *      storefront API. Same token, different resources.
 */

/**
 * The whole budget for one AI tool call.
 *
 * A customer waiting for "do you have this in red" is watching a typing indicator. Past a few
 * seconds an honest "I could not check just now" beats a correct answer nobody waited for — and
 * the reply engine's own model call still has to happen after this returns.
 */
const TOTAL_BUDGET_MS = 6_000;
const ATTEMPT_TIMEOUT_MS = 4_000;
const MAX_ATTEMPTS = 3;

export type IdeasoftFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthorized" | "rate_limited" | "timeout" | "not_found" | "upstream_error"; detail?: string };

/**
 * A tiny per-instance response cache.
 *
 * Deliberately in-process, unlike `lib/rateLimit.ts` which is an in-memory Map pretending to be a
 * limiter and is therefore a no-op on Vercel (landmine #8). The difference is what happens when it
 * misses: a per-instance *limiter* fails open and enforces nothing, which is a lie; a per-instance
 * *cache* just does less work than it could. Two conversations on the same lambda asking about the
 * same product is common enough to be worth it, and a stale price is bounded by the TTL below.
 */
type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45_000;
const CACHE_MAX_ENTRIES = 500;

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Cheapest possible eviction: drop the oldest inserted key. Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/**
 * In-flight de-duplication.
 *
 * Two conversations asking about the same SKU in the same second is one request, not two. Matters
 * more here than usual precisely because the rate limit is unknown.
 */
const inFlight = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface IdeasoftClient {
  connectionId: string;
  storeBaseUrl: string;
}

/**
 * GET one resource, with the token, the retries and the cache.
 *
 * `path` is relative to the store: "/admin-api/products". Query values are encoded here so no
 * caller has to remember to.
 */
export async function ideasoftGet<T>(
  client: IdeasoftClient,
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<IdeasoftFetchResult<T>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && `${v}` !== "") params.set(k, String(v));
  }
  const suffix = params.toString();
  const key = `${client.connectionId}:${path}?${suffix}`;

  const cached = cacheGet<IdeasoftFetchResult<T>>(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<IdeasoftFetchResult<T>>;

  const run = (async (): Promise<IdeasoftFetchResult<T>> => {
    const started = Date.now();

    const token = await getAccessToken(
      { id: client.connectionId, storeBaseUrl: client.storeBaseUrl },
      refreshIdeasoftToken
    );
    if (!token.ok) {
      return { ok: false, reason: "unauthorized", detail: token.reason };
    }

    const url = `${client.storeBaseUrl}${path}${suffix ? `?${suffix}` : ""}`;
    let lastReason: IdeasoftFetchResult<T> = { ok: false, reason: "upstream_error" };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (Date.now() - started > TOTAL_BUDGET_MS) return { ok: false, reason: "timeout" };

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token.accessToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
          cache: "no-store",
        });

        if (res.status === 401 || res.status === 403) {
          // The token was accepted a moment ago and is not now: either it was revoked in the
          // store's panel, or the app's permissions were narrowed. Neither is retryable.
          await markError(client.connectionId, `Store returned ${res.status}.`, res.status === 401);
          return { ok: false, reason: "unauthorized", detail: `http_${res.status}` };
        }

        if (res.status === 404) return { ok: false, reason: "not_found" };

        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after"));
          // Honour Retry-After when the store sends one; otherwise back off with jitter, because
          // three clients retrying in lockstep is how a soft limit becomes a hard one.
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 3_000)
            : Math.min(250 * 2 ** (attempt - 1), 2_000) + Math.floor(Math.random() * 200);
          lastReason = { ok: false, reason: res.status === 429 ? "rate_limited" : "upstream_error", detail: `http_${res.status}` };
          if (attempt < MAX_ATTEMPTS && Date.now() - started + wait < TOTAL_BUDGET_MS) {
            await sleep(wait);
            continue;
          }
          return lastReason;
        }

        if (!res.ok) return { ok: false, reason: "upstream_error", detail: `http_${res.status}` };

        const text = await res.text();
        let data: T;
        try {
          data = JSON.parse(text) as T;
        } catch {
          // Cloudflare or a WAF answering instead of the store. Never surface the body.
          return { ok: false, reason: "upstream_error", detail: "non_json_response" };
        }

        // A successful read is the best evidence the connection works — cheaper and more honest
        // than a separate health check nobody runs.
        void markVerified(client.connectionId);

        const result: IdeasoftFetchResult<T> = { ok: true, data };
        cacheSet(key, result);
        return result;
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        lastReason = { ok: false, reason: timedOut ? "timeout" : "upstream_error" };
        if (attempt < MAX_ATTEMPTS && Date.now() - started < TOTAL_BUDGET_MS) {
          await sleep(200 * attempt);
          continue;
        }
        return lastReason;
      }
    }

    return lastReason;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/** Drop everything cached for one connection — used after a disconnect or a manual re-sync. */
export function invalidateConnectionCache(connectionId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${connectionId}:`)) cache.delete(key);
  }
}
