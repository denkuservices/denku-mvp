import { describe, it, expect } from "vitest";

import { parseGmailConfirmation } from "@/lib/email/channel/gmailForwarding";
import { slugifyForAddress, buildInboundAddress, inboundDomain } from "@/lib/email/channel/address";
import type { InboundEmail } from "@/lib/platform/adapters/email";

/**
 * EMAIL CHANNEL SETUP — the two pure pieces of the connect flow.
 *
 * Both exist to remove friction from a step the customer performs in someone else's product
 * (their own mail settings), which is the part of this channel we cannot debug for them. A
 * parser that misses Gmail's code costs every Gmail customer a manual copy-paste; a parser that
 * fires on the wrong mail silently swallows a real customer's message.
 */

function mail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    from: "Gmail Team <forwarding-noreply@google.com>",
    subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from ayse@example.com",
    text: [
      "ayse@example.com has requested to automatically forward mail to your email address.",
      "Confirmation code: 123456789",
      "",
      "To allow this, please click the link below:",
      "https://mail.google.com/mail/vf-%5B123%5D-abc",
    ].join("\n"),
    headers: {},
    ...overrides,
  };
}

describe("Gmail forwarding confirmation — finished on the customer's behalf", () => {
  it("recognises the confirmation and extracts code, link and requester", () => {
    const parsed = parseGmailConfirmation(mail());
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe("123456789");
    expect(parsed?.verificationUrl).toBe("https://mail.google.com/mail/vf-%5B123%5D-abc");
    expect(parsed?.requestedBy).toBe("ayse@example.com");
  });

  it("reads the code from the body when the subject has none", () => {
    const parsed = parseGmailConfirmation(mail({ subject: "Gmail Forwarding Confirmation" }));
    expect(parsed?.code).toBe("123456789");
  });

  it("unescapes &amp; in the verification link", () => {
    const parsed = parseGmailConfirmation(
      mail({ text: "https://mail.google.com/mail/vf-a?b=1&amp;c=2", html: null })
    );
    expect(parsed?.verificationUrl).toBe("https://mail.google.com/mail/vf-a?b=1&c=2");
  });

  it("finds the confirmation in an HTML-only body", () => {
    const parsed = parseGmailConfirmation(
      mail({ text: null, html: '<p>Confirmation code: 987654321</p><a href="https://mail.google.com/mail/vf-x">ok</a>' })
    );
    expect(parsed?.code).toBe("123456789"); // from the subject, which Gmail always carries
    expect(parsed?.verificationUrl).toBe("https://mail.google.com/mail/vf-x");
  });

  it("returns null for a real customer — even one talking about Gmail forwarding", () => {
    expect(
      parseGmailConfirmation(
        mail({
          from: "Ayşe <ayse@example.com>",
          subject: "Gmail forwarding confirmation problem",
          text: "Gmail forwarding confirmation code gelmedi, yardım eder misiniz?",
        })
      )
    ).toBeNull();
  });

  it("returns null for other Google mail that is not the handshake", () => {
    expect(
      parseGmailConfirmation(mail({ subject: "Security alert for your linked Google Account" }))
    ).toBeNull();
  });
});

describe("inbound address — readable to a human, unique to a workspace", () => {
  it("slugifies Turkish characters to their ASCII stems", () => {
    expect(slugifyForAddress("Şişli Kuaför")).toBe("sisli-kuafor");
    expect(slugifyForAddress("Güzellik Merkezi")).toBe("guzellik-merkezi");
    expect(slugifyForAddress("İstanbul Diş")).toBe("istanbul-dis");
  });

  it("falls back to something legal when the name yields nothing", () => {
    expect(slugifyForAddress("!!!")).toBe("inbox");
    expect(slugifyForAddress("")).toBe("inbox");
    expect(slugifyForAddress(null)).toBe("inbox");
  });

  it("never emits characters that are illegal in an address local part", () => {
    expect(slugifyForAddress("Acme & Co. <Ltd>")).toMatch(/^[a-z0-9-]+$/);
    expect(slugifyForAddress("a".repeat(80))).toMatch(/^[a-z0-9-]{1,24}$/);
  });

  it("builds an address at the configured inbound domain", () => {
    const address = buildInboundAddress("Acme", { EMAIL_INBOUND_DOMAIN: "in.denku.io" });
    expect(address).toMatch(/^acme-[0-9a-f]{6}@in\.denku\.io$/);
  });

  it("gives two workspaces of the same name two different addresses", () => {
    const env = { EMAIL_INBOUND_DOMAIN: "in.denku.io" };
    expect(buildInboundAddress("Acme", env)).not.toBe(buildInboundAddress("Acme", env));
  });

  it("refuses to invent an address when no inbound domain is configured", () => {
    // A customer who forwards to a dead address gets silence and blames their own settings.
    expect(inboundDomain({})).toBeNull();
    expect(buildInboundAddress("Acme", {})).toBeNull();
  });
});
