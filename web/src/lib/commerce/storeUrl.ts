/**
 * Normalizing — and refusing — the store URL a customer types into a form.
 *
 * This is a security boundary, not formatting. Everything else in `lib/commerce` makes
 * server-side HTTP requests to whatever this function returns, with a bearer token attached. A
 * URL that resolves inside our own network is a request we make on an attacker's behalf, from a
 * host that is already inside the perimeter (SSRF).
 *
 * The same discipline `lib/vapi/assistantConfig.ts` acquired the hard way after R-077 put
 * `http://localhost:3000` on live assistants: refuse rather than coerce.
 *
 * Pure and dependency-free so it can be unit-tested and reused on both sides of the wire.
 */

export type StoreUrlResult = { ok: true; url: string; host: string } | { ok: false; reason: string };

/**
 * Hostnames that never belong to a customer's shop.
 *
 * This is a *hostname* check, and it is deliberately not sold as complete: a DNS name can resolve
 * to a private address without looking like one, and only the runtime can know. It removes the
 * accidents and the obvious attempts; the honest defence against the rest is that this URL is
 * typed by an authenticated owner of a paying workspace, not by the public.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

/** Private, loopback, link-local and carrier-grade-NAT ranges, plus IPv6's equivalents. */
function isPrivateAddress(host: string): boolean {
  // IPv6 literals arrive from the URL parser wrapped in brackets.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (/^::1$/i.test(bare) || /^fe80:/i.test(bare) || /^f[cd][0-9a-f]{2}:/i.test(bare)) return true;

  const v4 = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true; // not a valid IP at all
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata at 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Turn what the customer typed into the origin we will call, or say why we will not.
 *
 * Accepts `shop.myideasoft.com`, `https://shop.myideasoft.com/`, `www.shop.com/panel` and returns
 * the bare origin. Rejects http, credentials in the URL, and anything that looks internal.
 */
export function normalizeStoreUrl(input: string): StoreUrlResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "Enter your store address." };

  // A bare host is what people actually paste. Assume https rather than refusing — but only
  // https: an http origin would carry the bearer token in clear text.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That does not look like a web address." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "The store address must start with https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Remove the username and password from the address." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || !host.includes(".")) {
    return { ok: false, reason: "Enter the full store address, for example shop.myideasoft.com." };
  }
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "That address is not reachable from the internet." };
  }
  if (isPrivateAddress(host)) {
    return { ok: false, reason: "That address is not reachable from the internet." };
  }

  // Origin only. A path would be silently appended to every API call we build.
  const port = parsed.port && parsed.port !== "443" ? `:${parsed.port}` : "";
  return { ok: true, url: `https://${host}${port}`, host };
}

/** The label we show when the customer did not name the store themselves. */
export function defaultStoreLabel(storeUrl: string): string {
  try {
    return new URL(storeUrl).hostname.replace(/^www\./, "");
  } catch {
    return storeUrl;
  }
}
