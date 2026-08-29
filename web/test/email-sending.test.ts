import { describe, it, expect } from "vitest";

import {
  normalizeDomain,
  addressBelongsToDomain,
  formatFrom,
  replySubject,
  angle,
} from "@/lib/email/channel/rules";

/**
 * EMAIL SENDING — the pure decisions that stand between "the AI wrote something" and
 * "a stranger received mail claiming to be from a business".
 *
 * Everything here is checked before a single byte leaves. The domain check in particular is a
 * security boundary, not a formatting nicety: it is what stops a from-address left behind by an
 * earlier domain from being sent under a signature that no longer covers it.
 */

describe("normalizeDomain — recover the domain from whatever they pasted", () => {
  it("accepts a plain domain", () => {
    expect(normalizeDomain("yourshop.com")).toBe("yourshop.com");
    expect(normalizeDomain("  YourShop.COM  ")).toBe("yourshop.com");
  });

  it("recovers a domain from a URL or an address", () => {
    expect(normalizeDomain("https://www.yourshop.com/contact")).toBe("yourshop.com");
    expect(normalizeDomain("info@yourshop.com")).toBe("yourshop.com");
    expect(normalizeDomain("@yourshop.com")).toBe("yourshop.com");
  });

  it("keeps a subdomain, which is a legitimate sending domain", () => {
    expect(normalizeDomain("reply.yourshop.com")).toBe("reply.yourshop.com");
  });

  it("rejects things that are not domains", () => {
    expect(normalizeDomain("yourshop")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
  });
});

describe("addressBelongsToDomain — the check that prevents a forged From line", () => {
  it("accepts an address at the domain", () => {
    expect(addressBelongsToDomain("info@yourshop.com", "yourshop.com")).toBe(true);
  });

  it("accepts an address on a subdomain of the verified domain", () => {
    expect(addressBelongsToDomain("info@reply.yourshop.com", "yourshop.com")).toBe(true);
  });

  it("REFUSES a domain that merely ends with the verified one", () => {
    // The whole point. `notyourshop.com` ends with `yourshop.com` as a string and must never
    // pass on that basis — otherwise anyone registering a suffix domain inherits the signature.
    expect(addressBelongsToDomain("info@notyourshop.com", "yourshop.com")).toBe(false);
    expect(addressBelongsToDomain("info@evilyourshop.com", "yourshop.com")).toBe(false);
  });

  it("refuses an unrelated domain", () => {
    expect(addressBelongsToDomain("info@somewhereelse.com", "yourshop.com")).toBe(false);
  });

  it("refuses when either side is missing", () => {
    expect(addressBelongsToDomain(null, "yourshop.com")).toBe(false);
    expect(addressBelongsToDomain("info@yourshop.com", null)).toBe(false);
    expect(addressBelongsToDomain("not-an-address", "yourshop.com")).toBe(false);
  });

  it("is case-insensitive on both sides", () => {
    expect(addressBelongsToDomain("Info@YourShop.com", "yourshop.com")).toBe(true);
  });
});

describe("formatFrom", () => {
  it("uses the bare address when there is no display name", () => {
    expect(formatFrom({ fromName: null, fromAddress: "info@shop.com", replyTo: null })).toBe("info@shop.com");
    expect(formatFrom({ fromName: "  ", fromAddress: "info@shop.com", replyTo: null })).toBe("info@shop.com");
  });

  it("quotes the display name so a comma cannot split the header", () => {
    expect(formatFrom({ fromName: "Shop, Inc.", fromAddress: "info@shop.com", replyTo: null })).toBe(
      '"Shop, Inc." <info@shop.com>'
    );
  });

  it("neutralises a quote inside the name rather than letting it break the header", () => {
    expect(formatFrom({ fromName: 'The "Best" Shop', fromAddress: "info@shop.com", replyTo: null })).toBe(
      "\"The 'Best' Shop\" <info@shop.com>"
    );
  });
});

describe("replySubject — Re: exactly once", () => {
  it("adds Re: to a fresh subject", () => {
    expect(replySubject("Booking for Friday")).toBe("Re: Booking for Friday");
  });

  it("does not stack Re: on a subject that already has one", () => {
    expect(replySubject("Re: Booking for Friday")).toBe("Re: Booking for Friday");
    expect(replySubject("RE: RE: Booking for Friday")).toBe("Re: Booking for Friday");
  });

  it("strips forward and localised reply prefixes too", () => {
    expect(replySubject("Fwd: Booking")).toBe("Re: Booking");
    expect(replySubject("YAN: Randevu")).toBe("Re: Randevu");
  });

  it("falls back rather than sending an empty subject", () => {
    expect(replySubject(null)).toBe("Re: your message");
    expect(replySubject("   ")).toBe("Re: your message");
    expect(replySubject("Re:")).toBe("Re: your message");
  });
});

describe("angle — Message-IDs are bracketed exactly once", () => {
  it("wraps a bare id", () => {
    expect(angle("abc@mail.example")).toBe("<abc@mail.example>");
  });

  it("leaves an already-wrapped id alone", () => {
    expect(angle("<abc@mail.example>")).toBe("<abc@mail.example>");
  });
});
