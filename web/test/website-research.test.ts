import { describe, it, expect, vi } from "vitest";

/**
 * The website field makes our server fetch a URL a stranger typed. That is a server-side request
 * forgery hole unless it is guarded, and the guard is the only thing standing between an
 * onboarding text box and our own internal network.
 *
 * Denku runs on Vercel, where 169.254.169.254 answers with credentials to anything that asks. A
 * customer — or someone who signed up to try — typing that address must not turn our server into
 * their proxy for it. These are the addresses that matter, written down so the guard cannot be
 * relaxed by accident.
 */

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: () => ({}) } }));

import { safeWebsiteUrl, extractText } from "@/lib/platform/websiteResearch";

describe("safeWebsiteUrl — what must never be fetched", () => {
  it("refuses the cloud metadata endpoint", () => {
    // The one that hands out credentials. Everything else on this list is bad; this one is fatal.
    expect(safeWebsiteUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(safeWebsiteUrl("169.254.169.254")).toBeNull();
  });

  it("refuses loopback in every spelling", () => {
    for (const host of ["localhost", "http://localhost:3000", "127.0.0.1", "http://127.0.0.1:8080", "0.0.0.0"]) {
      expect(safeWebsiteUrl(host), host).toBeNull();
    }
  });

  it("refuses private ranges", () => {
    for (const host of ["10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.1", "100.64.0.1"]) {
      expect(safeWebsiteUrl(host), host).toBeNull();
    }
  });

  it("allows a public address inside a range whose neighbours are private", () => {
    // 172.32 is public even though 172.16–172.31 is not. A guard that blocked all of 172 would
    // be quietly refusing real customers.
    expect(safeWebsiteUrl("https://172.32.0.1")).not.toBeNull();
    expect(safeWebsiteUrl("https://192.169.1.1")).not.toBeNull();
  });

  it("refuses internal hostnames that never belong to a public site", () => {
    for (const host of ["http://db.internal", "http://printer.local", "http://intranet"]) {
      expect(safeWebsiteUrl(host), host).toBeNull();
    }
  });

  it("refuses non-HTTP schemes", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com"]) {
      expect(safeWebsiteUrl(url), url).toBeNull();
    }
  });

  it("refuses credentials in the URL", () => {
    // Nobody types their own homepage with a password in it; this is how a request gets aimed at
    // something that trusts whoever presents them.
    expect(safeWebsiteUrl("https://user:pass@example.com")).toBeNull();
  });

  it("refuses IPv6 loopback and link-local", () => {
    for (const host of ["http://[::1]", "http://[fe80::1]", "http://[fd00::1]"]) {
      expect(safeWebsiteUrl(host), host).toBeNull();
    }
  });

  it("accepts an ordinary website, with or without a scheme", () => {
    expect(safeWebsiteUrl("denku.io")?.protocol).toBe("https:");
    expect(safeWebsiteUrl("https://www.example.com/about")?.hostname).toBe("www.example.com");
    expect(safeWebsiteUrl("http://example.co.uk")?.hostname).toBe("example.co.uk");
  });

  it("refuses nothing at all, and absurd input", () => {
    expect(safeWebsiteUrl(null)).toBeNull();
    expect(safeWebsiteUrl("")).toBeNull();
    expect(safeWebsiteUrl("   ")).toBeNull();
    expect(safeWebsiteUrl("x".repeat(600))).toBeNull();
    expect(safeWebsiteUrl("not a url at all")).toBeNull();
  });
});

describe("extractText", () => {
  it("drops scripts and styles rather than feeding them to the model", () => {
    const html = "<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><p>Open Mon–Fri</p></body></html>";
    const text = extractText(html);
    expect(text).toContain("Open Mon–Fri");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("unescapes entities so hours and names read correctly", () => {
    expect(extractText("<p>Mon &amp; Tue, 9&nbsp;–&nbsp;6</p>")).toContain("Mon & Tue");
  });

  it("caps its own length, because a page is unbounded and a prompt is not", () => {
    expect(extractText(`<p>${"word ".repeat(20000)}</p>`).length).toBeLessThanOrEqual(12_000);
  });
});
