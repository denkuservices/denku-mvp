import { describe, it, expect, beforeAll } from "vitest";
import {
  isOriginAllowed,
  normalizeAllowedOrigin,
  normalizeOrigin,
  originMatches,
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

  it("never honours a bare wildcard", () => {
    // "*" is what a frustrated developer pastes. It must not become allow-all.
    expect(isOriginAllowed("https://anything.com", ["*"])).toBe(false);
    expect(isOriginAllowed("https://anything.com", ["https://*"])).toBe(false);
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
