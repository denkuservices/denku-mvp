/**
 * Origin allowlisting for the Web Chat widget — the channel's front door.
 *
 * Pure and dependency-free on purpose: this is the check that decides whether a stranger's
 * website may run a business's AI, so it must be testable without a database, a request, or a
 * network. Everything it needs is the `Origin` header and the list the customer configured.
 *
 * **Why the Origin header is trusted here at all.** A browser sets it and a page cannot forge
 * it; a curl script can set it to anything. That is exactly the right trust level for what it
 * guards: it stops the widget being *embedded* on sites the customer did not authorise, which
 * is a browser-enforced problem. It does not pretend to authenticate a request — the signed
 * session token does that, and the volume caps assume a scripted caller exists regardless.
 *
 * Matching is deliberately narrow:
 *   - exact scheme + host + port, normalised, case-insensitive on the host;
 *   - one level of wildcard subdomain (`https://*.shop.com`) because a customer with a staging
 *     and a www host should not have to enumerate them, and because getting this wrong by hand
 *     is what makes people paste `*` instead;
 *   - never a bare `*`, never a path, never a suffix match. `https://evil-shop.com` must not
 *     match `https://shop.com`, which is precisely what naive `endsWith` gets wrong.
 */

/** Normalise a browser-supplied origin to `scheme://host[:port]`, or null if it is not one. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw === "null") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // `url.host` keeps a non-default port and drops a default one, which is the comparison we
    // want: https://shop.com and https://shop.com:443 are the same site.
    return `${url.protocol}//${url.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

/**
 * Does this look like a hostname a real website is served from?
 *
 * `new URL()` is far too permissive for a field a human types into: `https://not` parses happily,
 * so the sentence "not a domain" becomes three valid origins. Junk in this list is not merely
 * untidy — the stored entries are rendered straight into the embed response's `frame-ancestors`,
 * and one malformed token there can invalidate the whole directive and stop the widget rendering
 * anywhere. So the gate is here, on the way in.
 *
 * Requires a dot and a plausible TLD, with `localhost` carved out for development.
 */
function isPlausibleHost(host: string): boolean {
  const bare = host.replace(/:\d+$/, "");
  if (bare === "localhost") return true;
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(bare);
}

/**
 * Normalise what the customer typed into the allowlist field.
 *
 * People paste "shop.com", "www.shop.com/contact", "HTTPS://Shop.com/". All three mean the same
 * thing and all three should work — refusing them would teach customers to reach for `*`.
 * A bare host is assumed https, because a widget on an http page is a mixed-content warning the
 * customer will see long before we do.
 */
export function normalizeAllowedOrigin(value: string): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const schemeMatch = raw.match(/^(https?:\/\/)/i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "https://";
  let host = schemeMatch ? raw.slice(schemeMatch[1].length) : raw;

  // The wildcard label is stripped before parsing — `https://*.shop.com` is not a URL — and put
  // back after, so the stored entry keeps the exact shape `originMatches` reads.
  const isWildcard = host.startsWith("*.");
  if (isWildcard) host = host.slice(2);

  const normalized = normalizeOrigin(`${scheme}${host}`);
  if (!normalized) return null;
  // Reject what a human typed that is not a site, before it can reach `frame-ancestors`.
  if (!isPlausibleHost(normalized.slice(normalized.indexOf("//") + 2))) return null;
  if (!isWildcard) return normalized;

  const sep = normalized.indexOf("//") + 2;
  return `${normalized.slice(0, sep)}*.${normalized.slice(sep)}`;
}

/**
 * An origin and its www/apex twin.
 *
 * `denku.io` and `www.denku.io` are one site, and whichever one a deployment names in its config
 * is not necessarily the one a browser arrives from — a domain that redirects between them makes
 * that decision at request time. Comparing a single stored string against the browser's origin
 * therefore fails on exactly the deployments that redirect, which is most of them.
 *
 * Used for OUR own origin, not for the customer's allowlist: that one has its own, deliberately
 * more conservative pairing in `connections.ts`, because widening a customer's list is a different
 * decision from recognising ourselves.
 */
export function originWithSibling(origin: string): string[] {
  const sep = origin.indexOf("//") + 2;
  if (sep < 2) return [origin];
  const scheme = origin.slice(0, sep);
  const host = origin.slice(sep);
  const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  return [origin, `${scheme}${twin}`];
}

/** Does this request origin match one configured entry? */
export function originMatches(origin: string, allowed: string): boolean {
  const entry = (allowed ?? "").trim().toLowerCase();
  if (!entry) return false;

  const wildcardAt = entry.indexOf("//*.");
  if (wildcardAt === -1) return origin.toLowerCase() === entry;

  const scheme = entry.slice(0, wildcardAt + 2);
  const base = entry.slice(wildcardAt + 4);
  const candidate = origin.toLowerCase();
  if (!candidate.startsWith(scheme)) return false;

  const host = candidate.slice(scheme.length);
  // A wildcard covers subdomains AND the base itself: someone who allows *.shop.com means
  // shop.com too, and having to add both is a trap rather than a security property.
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Is this origin allowed to use this install?
 *
 * An EMPTY list refuses everything. That is the single most important line in this file: a
 * connection created before the customer has said where it lives must answer nobody, because
 * the alternative — allow-all until configured — is an open AI endpoint keyed by a public
 * string that is printed in a page source.
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[] | null): boolean {
  if (!origin) return false;
  const list = (allowedOrigins ?? []).filter((o) => typeof o === "string" && o.trim().length > 0);
  if (list.length === 0) return false;
  return list.some((entry) => originMatches(origin, entry));
}

/**
 * CORS headers for a request we have decided to answer.
 *
 * `Access-Control-Allow-Origin` echoes the caller's own origin rather than `*` — the request
 * carries no cookies, but echoing keeps the response uncacheable across sites and makes the
 * `Vary: Origin` contract honest for any CDN in front of us.
 */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
