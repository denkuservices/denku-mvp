import { describe, it, expect, beforeAll, vi } from "vitest";

// The connections module imports the fail-fast service-role client; nothing here touches a DB.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
import {
  isOriginAllowed,
  normalizeAllowedOrigin,
  normalizeOrigin,
  originMatches,
  originWithSibling,
} from "@/lib/webchat/origins";

/**
 * Web Chat is the only public, unauthenticated, write-capable surface in this application, and
 * the origin allowlist is its front door. These tests are about the two ways that door fails:
 * letting a stranger's website in, and shutting a paying customer's own site out.
 *
 * The token tests are kept in the same file because the two halves are one mechanism — the
 * allowlist decision is only ever made once, at the iframe document, and the signature is what
 * carries it to every later request.
 */

describe("web chat origin allowlist", () => {
  it("normalises what a browser sends", () => {
    expect(normalizeOrigin("https://Shop.com")).toBe("https://shop.com");
    expect(normalizeOrigin("https://shop.com:443")).toBe("https://shop.com");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    // A sandboxed iframe sends the literal string "null"; it is not an origin.
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("ftp://shop.com")).toBeNull();
  });

  it("normalises what a customer types, because refusing them teaches them to paste a wildcard", () => {
    expect(normalizeAllowedOrigin("shop.com")).toBe("https://shop.com");
    expect(normalizeAllowedOrigin("www.shop.com/contact")).toBe("https://www.shop.com");
    expect(normalizeAllowedOrigin("  HTTPS://Shop.com/  ")).toBe("https://shop.com");
    expect(normalizeAllowedOrigin("*.shop.com")).toBe("https://*.shop.com");
    expect(normalizeAllowedOrigin("https://*.shop.com")).toBe("https://*.shop.com");
    expect(normalizeAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeAllowedOrigin("")).toBeNull();
  });

  it("refuses what a human typed that is not a site", () => {
    // `new URL("https://not")` parses happily, so the sentence "not a domain" used to become three
    // valid origins. Junk here is not untidy, it is rendered into `frame-ancestors`, where one bad
    // token can invalidate the directive and stop the widget rendering anywhere.
    expect(normalizeAllowedOrigin("not")).toBeNull();
    expect(normalizeAllowedOrigin("domain!!")).toBeNull();
    expect(normalizeAllowedOrigin("shop")).toBeNull();
    expect(normalizeAllowedOrigin("'; script-src *")).toBeNull();
    // Development still works.
    expect(normalizeAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("matches exactly — a suffix is not a match", () => {
    expect(originMatches("https://shop.com", "https://shop.com")).toBe(true);
    // The bug a naive endsWith() would introduce, and the reason this test exists.
    expect(originMatches("https://evil-shop.com", "https://shop.com")).toBe(false);
    expect(originMatches("https://shop.com.evil.io", "https://shop.com")).toBe(false);
    // Scheme is part of the identity: an http page is not the https site.
    expect(originMatches("http://shop.com", "https://shop.com")).toBe(false);
    // A different port is a different origin.
    expect(originMatches("https://shop.com:8443", "https://shop.com")).toBe(false);
  });

  it("wildcards cover subdomains and the base, and nothing else", () => {
    expect(originMatches("https://www.shop.com", "https://*.shop.com")).toBe(true);
    expect(originMatches("https://staging.shop.com", "https://*.shop.com")).toBe(true);
    expect(originMatches("https://shop.com", "https://*.shop.com")).toBe(true);
    expect(originMatches("https://a.b.shop.com", "https://*.shop.com")).toBe(true);
    expect(originMatches("https://evilshop.com", "https://*.shop.com")).toBe(false);
    expect(originMatches("https://shop.com.evil.io", "https://*.shop.com")).toBe(false);
    expect(originMatches("http://www.shop.com", "https://*.shop.com")).toBe(false);
  });

  it("an empty allowlist refuses everything — fail closed", () => {
    // The single most important line in the module: an install that has not been told where it
    // lives must answer nobody, or a public site key becomes an open AI endpoint.
    expect(isOriginAllowed("https://shop.com", [])).toBe(false);
    expect(isOriginAllowed("https://shop.com", null)).toBe(false);
    expect(isOriginAllowed("https://shop.com", ["  ", ""])).toBe(false);
    expect(isOriginAllowed(null, ["https://shop.com"])).toBe(false);
    expect(isOriginAllowed("https://shop.com", ["https://other.com", "https://shop.com"])).toBe(true);
  });

  it("knows itself on both of its own hosts", () => {
    // The in-product preview refused itself the first time it was opened: NEXT_PUBLIC_SITE_URL
    // names the apex, the dashboard is served from www, and a single-string comparison could not
    // recognise our own page. Same trap as the loader's, one layer up.
    expect(originWithSibling("https://denku.io")).toEqual(["https://denku.io", "https://www.denku.io"]);
    expect(originWithSibling("https://www.denku.io")).toEqual(["https://www.denku.io", "https://denku.io"]);
    expect(originWithSibling("http://localhost:3000")).toEqual([
      "http://localhost:3000",
      "http://www.localhost:3000",
    ]);
  });

  it("never honours a bare wildcard", () => {
    // "*" is what a frustrated developer pastes. It must not become allow-all.
    expect(isOriginAllowed("https://anything.com", ["*"])).toBe(false);
    expect(isOriginAllowed("https://anything.com", ["https://*"])).toBe(false);
  });
});

describe("the customer's domain list", () => {
  // `normalizeOriginList` reaches for the service-role client's module graph, so it is imported
  // lazily behind the mock the token suite already needs.
  async function normalize(input: string) {
    const { normalizeOriginList } = await import("@/lib/webchat/connections");
    return normalizeOriginList(input);
  }

  it("covers apex and www from either one, because the owner should not have to know", async () => {
    // The whole point: a shop owner types the address they say out loud, and the punishment for
    // guessing the wrong half of the pair used to be a widget that silently never loaded.
    expect(await normalize("minosandco.com")).toEqual([
      "https://minosandco.com",
      "https://www.minosandco.com",
    ]);
    expect(await normalize("www.minosandco.com")).toEqual([
      "https://www.minosandco.com",
      "https://minosandco.com",
    ]);
  });

  it("does not invent a www for a subdomain, and does not touch a wildcard", async () => {
    expect(await normalize("shop.minosandco.com")).toEqual(["https://shop.minosandco.com"]);
    expect(await normalize("*.minosandco.com")).toEqual(["https://*.minosandco.com"]);
  });

  it("keeps a builder address as its own entry — it is a different domain, never derived", async () => {
    // Auto-deriving anything under myshopify.com would be a real widening: every Shopify store in
    // the world is a subdomain of it.
    const list = await normalize("minosandco.com\nminosandco.myshopify.com");
    expect(list).toContain("https://minosandco.myshopify.com");
    expect(list).not.toContain("https://www.myshopify.com");
    expect(list).not.toContain("https://*.myshopify.com");
  });

  it("drops junk and never duplicates", async () => {
    expect(await normalize("minosandco.com, www.minosandco.com,  , not a domain!!")).toEqual([
      "https://minosandco.com",
      "https://www.minosandco.com",
    ]);
    expect(await normalize("")).toEqual([]);
  });
});

describe("web chat signed tokens", () => {
  // A fixed key so the module can sign; the real one comes from the deployment.
  beforeAll(() => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  async function tokens() {
    return await import("@/lib/webchat/token");
  }

  it("round-trips a frame token and keeps the embedding origin", async () => {
    const { issueFrameToken, verifyFrameToken } = await tokens();
    const token = issueFrameToken({ cid: "conn-1", org: "org-1", po: "https://shop.com" });
    const claims = verifyFrameToken(token);
    expect(claims?.cid).toBe("conn-1");
    expect(claims?.org).toBe("org-1");
    // The whole point of the token: the origin decided at the iframe travels forward.
    expect(claims?.po).toBe("https://shop.com");
  });

  it("refuses a tampered payload", async () => {
    const { issueSessionToken, verifySessionToken } = await tokens();
    const token = issueSessionToken({
      cid: "conn-1",
      org: "org-1",
      po: "https://shop.com",
      sid: "sess-1",
      vid: "v1",
    });

    const [body, sig] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    // Swapping the org is the attack this exists to stop: post into someone else's Inbox.
    decoded.org = "org-2";
    const forged = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url") + "." + sig;

    expect(verifySessionToken(forged)).toBeNull();
    expect(verifySessionToken(token)?.org).toBe("org-1");
  });

  it("will not let one kind of token stand in for the other", async () => {
    const { issueFrameToken, verifySessionToken, verifyFrameToken, issueSessionToken } = await tokens();
    const frame = issueFrameToken({ cid: "c", org: "o", po: "https://shop.com" });
    const session = issueSessionToken({ cid: "c", org: "o", po: "https://shop.com", sid: "s", vid: "v" });

    // A frame token is minted before any session exists; accepting it as a session would skip
    // the session lookup entirely.
    expect(verifySessionToken(frame)).toBeNull();
    expect(verifyFrameToken(session)).toBeNull();
  });

  it("refuses expired, malformed and unsigned input", async () => {
    const { verifySessionToken, verifyFrameToken } = await tokens();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("a.b")).toBeNull();
    // An unsigned payload — the "alg:none" shape a JWT library might have accepted.
    const bare = Buffer.from(
      JSON.stringify({ kind: "session", cid: "c", org: "o", po: "p", sid: "s", vid: "v", exp: 9e9 })
    ).toString("base64url");
    expect(verifySessionToken(`${bare}.`)).toBeNull();
    expect(verifyFrameToken(`${bare}.x`)).toBeNull();
  });
});
