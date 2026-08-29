import { describe, it, expect } from "vitest";

import {
  emailAdapter,
  normalizeEmailAddress,
  displayNameFromAddress,
  parseReferences,
  emailThreadKey,
  baseSubject,
  htmlToText,
  stripQuotedReply,
  flattenEmailBody,
  isAutomatedEmail,
  isSelfAddressed,
  type InboundEmail,
} from "@/lib/platform/adapters/email";

/**
 * EMAIL ADAPTER — the channel whose native shape does not match the platform's.
 *
 * Every function here is pure, so all of it is testable without a database, a provider, or a
 * network. That is deliberate: the expensive email bugs (a reply that opens a new thread, two
 * customers merged into one contact, an auto-responder loop) are all decided in this file, and
 * none of them are cheap to discover in production.
 */

const ctx = { orgId: "org-1", agentId: "agent-1" };

function mail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    messageId: "<abc123@mail.example.com>",
    from: "Ayşe Yılmaz <ayse@example.com>",
    to: ["acme-a7f3@in.denku.io"],
    subject: "Randevu almak istiyorum",
    text: "Yarın saat 15:00 müsait misiniz?",
    headers: {},
    ...overrides,
  };
}

describe("address normalization — one person must not become two contacts", () => {
  it("unwraps a display name and lower-cases", () => {
    expect(normalizeEmailAddress("Ayşe Yılmaz <Ayse@Example.COM>")).toBe("ayse@example.com");
    expect(normalizeEmailAddress("  BOB@X.com  ")).toBe("bob@x.com");
  });

  it("treats differently-cased spellings as the SAME contact", () => {
    expect(normalizeEmailAddress("Bob@X.com")).toBe(normalizeEmailAddress("bob@x.com"));
  });

  it("does NOT canonicalise Gmail dots or +tags", () => {
    // Same Gmail mailbox, different mailbox almost everywhere else. Merging two customers into
    // one contact is a worse error than keeping one customer as two.
    expect(normalizeEmailAddress("a.b@gmail.com")).not.toBe(normalizeEmailAddress("ab@gmail.com"));
    expect(normalizeEmailAddress("bob+shop@x.com")).toBe("bob+shop@x.com");
  });

  it("rejects anything that is not an address", () => {
    expect(normalizeEmailAddress("not an address")).toBeNull();
    expect(normalizeEmailAddress("")).toBeNull();
    expect(normalizeEmailAddress(null)).toBeNull();
    expect(normalizeEmailAddress(undefined)).toBeNull();
  });

  it("derives a readable name when the sender set none", () => {
    expect(displayNameFromAddress("Ayşe Yılmaz <ayse@example.com>")).toBe("Ayşe Yılmaz");
    expect(displayNameFromAddress('"Ayşe Yılmaz" <ayse@example.com>')).toBe("Ayşe Yılmaz");
    expect(displayNameFromAddress("ayse.yilmaz@example.com")).toBe("Ayse Yilmaz");
  });
});

describe("threading — a reply must land in the conversation it answers", () => {
  it("uses the ROOT of the References chain, not the most recent id", () => {
    const key = emailThreadKey(
      mail({
        messageId: "<third@x>",
        inReplyTo: "<second@x>",
        references: "<root@x> <second@x>",
      })
    );
    expect(key).toBe("root@x");
  });

  it("falls back to In-Reply-To when a client sends no References", () => {
    expect(emailThreadKey(mail({ messageId: "<second@x>", inReplyTo: "<root@x>", references: null }))).toBe("root@x");
  });

  it("a first message is the start of its own thread", () => {
    expect(emailThreadKey(mail({ messageId: "<root@x>", inReplyTo: null, references: null }))).toBe("root@x");
  });

  it("keeps every message of one exchange on ONE key", () => {
    const first = emailThreadKey(mail({ messageId: "<root@x>", references: null, inReplyTo: null }));
    const ourReply = emailThreadKey(mail({ messageId: "<ours@d>", references: "<root@x>", inReplyTo: "<root@x>" }));
    const theirFollowUp = emailThreadKey(mail({ messageId: "<third@x>", references: "<root@x> <ours@d>" }));
    expect(new Set([first, ourReply, theirFollowUp]).size).toBe(1);
  });

  it("does NOT key on the subject — two customers writing 'Re: Merhaba' are two conversations", () => {
    const a = emailThreadKey(mail({ messageId: "<a@x>", subject: "Re: Merhaba", references: null, inReplyTo: null }));
    const b = emailThreadKey(mail({ messageId: "<b@y>", subject: "Re: Merhaba", references: null, inReplyTo: null }));
    expect(a).not.toBe(b);
  });

  it("parses References in both header-string and array form", () => {
    expect(parseReferences("<a@x> <b@x>")).toEqual(["a@x", "b@x"]);
    expect(parseReferences(["<a@x>", "b@x"])).toEqual(["a@x", "b@x"]);
    expect(parseReferences(null)).toEqual([]);
  });

  it("strips Re:/Fwd: prefixes for a stable subject", () => {
    expect(baseSubject("Re: Fwd: Randevu")).toBe("Randevu");
    expect(baseSubject("RE: RE: Booking")).toBe("Booking");
    expect(baseSubject("Yan: Randevu")).toBe("Randevu");
    expect(baseSubject("Randevu")).toBe("Randevu");
  });
});

describe("body flattening — the Inbox shows what they just wrote, not the whole history", () => {
  it("cuts an English quoted reply", () => {
    const body = stripQuotedReply(
      ["Evet, uygun.", "", "On Tue, 12 Aug 2026 at 10:04, Denku <a@b.com> wrote:", "> Merhaba, nasıl yardımcı olabilirim?"].join("\n")
    );
    expect(body).toBe("Evet, uygun.");
  });

  it("cuts a Turkish quoted reply", () => {
    const body = stripQuotedReply(
      ["Teşekkürler.", "", "12 Ağu 2026 Sal, 10:04 tarihinde Denku <a@b> şunu yazdı:", "> Merhaba"].join("\n")
    );
    expect(body).toBe("Teşekkürler.");
  });

  it("cuts an Outlook-style forwarded block", () => {
    expect(stripQuotedReply(["Tamam.", "", "-----Original Message-----", "From: Denku"].join("\n"))).toBe("Tamam.");
    expect(stripQuotedReply(["Tamam.", "", "________________________________", "From: Denku"].join("\n"))).toBe("Tamam.");
  });

  it("cuts a `>` quoted block even with no marker line", () => {
    expect(stripQuotedReply(["Olur.", "", "> önceki mesaj"].join("\n"))).toBe("Olur.");
  });

  it("cuts the signature after the RFC 3676 delimiter", () => {
    expect(stripQuotedReply(["Merhaba.", "", "-- ", "Ayşe Yılmaz", "Acme Ltd"].join("\n"))).toBe("Merhaba.");
  });

  it("leaves an unquoted message completely alone", () => {
    const plain = "Yarın saat 15:00 müsait misiniz?\n\nTeşekkürler.";
    expect(stripQuotedReply(plain)).toBe(plain);
  });

  it("reduces HTML to readable text and drops blockquoted history", () => {
    const html = "<div>Merhaba<br>Randevu istiyorum</div><blockquote>eski mesaj</blockquote>";
    const text = htmlToText(html);
    expect(text).toContain("Merhaba");
    expect(text).toContain("Randevu istiyorum");
    expect(text).not.toContain("eski mesaj");
    expect(text).not.toContain("<");
  });

  it("decodes entities and strips scripts/styles", () => {
    expect(htmlToText("<style>p{color:red}</style><p>Fiyat &gt; 100 &amp; artıyor</p>")).toBe("Fiyat > 100 & artıyor");
    expect(htmlToText("<script>alert(1)</script><p>merhaba</p>")).toBe("merhaba");
  });

  it("prefers the plain-text part when both are present", () => {
    expect(flattenEmailBody("düz metin", "<p>html</p>")).toBe("düz metin");
  });

  it("falls back to HTML when there is no text part", () => {
    expect(flattenEmailBody(null, "<p>sadece html</p>")).toBe("sadece html");
    expect(flattenEmailBody("   ", "<p>sadece html</p>")).toBe("sadece html");
  });
});

describe("loop and noise guards — the failure Telegram never had", () => {
  it("refuses RFC 3834 auto-replies", () => {
    expect(isAutomatedEmail(mail({ headers: { "auto-submitted": "auto-replied" } }))).toBe(true);
    expect(isAutomatedEmail(mail({ headers: { "Auto-Submitted": "auto-generated" } }))).toBe(true);
  });

  it("allows an ordinary mail that declares Auto-Submitted: no", () => {
    expect(isAutomatedEmail(mail({ headers: { "auto-submitted": "no" } }))).toBe(false);
  });

  it("refuses Exchange out-of-office", () => {
    expect(isAutomatedEmail(mail({ headers: { "x-auto-response-suppress": "OOF" } }))).toBe(true);
  });

  it("refuses bulk mail and mailing lists", () => {
    expect(isAutomatedEmail(mail({ headers: { precedence: "bulk" } }))).toBe(true);
    expect(isAutomatedEmail(mail({ headers: { "list-unsubscribe": "<https://x/u>" } }))).toBe(true);
    expect(isAutomatedEmail(mail({ headers: { "List-Id": "news.example.com" } }))).toBe(true);
  });

  it("refuses robot senders", () => {
    for (const from of ["no-reply@x.com", "noreply@x.com", "MAILER-DAEMON@x.com", "postmaster@x.com"]) {
      expect(isAutomatedEmail(mail({ from }))).toBe(true);
    }
  });

  it("refuses a no-reply address with something bolted on the front", () => {
    /**
     * `forwarding-noreply@google.com` is how Gmail's own forwarding handshake reached a real
     * business owner's Inbox looking like a customer enquiry: the exact-match list did not
     * contain it, and neither did it start with a listed token.
     */
    for (const from of [
      "forwarding-noreply@google.com",
      "billing-noreply@stripe.com",
      "noreply-alerts@x.com",
      "do-not-reply@x.com",
    ]) {
      expect(isAutomatedEmail(mail({ from }))).toBe(true);
    }
  });

  it("does not mistake an ordinary name for a robot", () => {
    for (const from of ["ayse@x.com", "reply@x.com", "replies@x.com", "noreen@x.com"]) {
      expect(isAutomatedEmail(mail({ from }))).toBe(false);
    }
  });

  it("lets an ordinary customer through", () => {
    expect(isAutomatedEmail(mail())).toBe(false);
  });

  it("refuses our own mail coming back — the artifact-notification feedback loop", () => {
    const own = mail({ from: "notifications@denku.io" });
    expect(isSelfAddressed(own, ["notifications@denku.io", "info@acme.com"])).toBe(true);
  });

  it("does not treat a real customer as self", () => {
    expect(isSelfAddressed(mail(), ["notifications@denku.io"])).toBe(false);
  });
});

describe("emailAdapter.normalizeInbound", () => {
  it("normalizes an ordinary customer email", () => {
    const [out] = emailAdapter.normalizeInbound({ email: mail() }, ctx);
    expect(out.channel).toBe("email");
    expect(out.orgId).toBe("org-1");
    expect(out.agentId).toBe("agent-1");
    expect(out.externalThreadId).toBe("abc123@mail.example.com");
    expect(out.contact.externalId).toBe("ayse@example.com");
    expect(out.contact.email).toBe("ayse@example.com");
    expect(out.contact.displayName).toBe("Ayşe Yılmaz");
    expect(out.message.role).toBe("user");
    expect(out.message.direction).toBe("inbound");
    expect(out.message.content).toBe("Yarın saat 15:00 müsait misiniz?");
    expect(out.message.externalMessageId).toBe("abc123@mail.example.com");
    expect(out.meta?.subject).toBe("Randevu almak istiyorum");
  });

  it("gives the intent classifier the subject as well as the body", () => {
    const [out] = emailAdapter.normalizeInbound({ email: mail() }, ctx);
    expect(out.transcriptForIntent).toContain("Randevu almak istiyorum");
    expect(out.transcriptForIntent).toContain("Yarın saat 15:00");
  });

  it("answers a mail whose whole point is the subject line", () => {
    // Unlike a Telegram sticker, an empty-bodied mail can still be a real request.
    const [out] = emailAdapter.normalizeInbound(
      { email: mail({ text: "", html: null, subject: "Yarınki 15:00 randevumu iptal ediyorum" }) },
      ctx
    );
    expect(out.message.content).toBe("Yarınki 15:00 randevumu iptal ediyorum");
  });

  it("records attachment metadata without pretending to carry the file", () => {
    const [out] = emailAdapter.normalizeInbound(
      { email: mail({ attachments: [{ filename: "fatura.pdf", contentType: "application/pdf", size: 1024 }] }) },
      ctx
    );
    expect(out.meta?.email_had_attachments).toBe(true);
    expect(out.meta?.email_attachments).toEqual([
      { filename: "fatura.pdf", contentType: "application/pdf", size: 1024 },
    ]);
  });

  it("returns [] for automated mail, self-addressed mail, and junk", () => {
    expect(emailAdapter.normalizeInbound({ email: mail({ headers: { precedence: "bulk" } }) }, ctx)).toEqual([]);
    expect(
      emailAdapter.normalizeInbound({ email: mail({ from: "info@acme.com" }), selfAddresses: ["info@acme.com"] }, ctx)
    ).toEqual([]);
    expect(emailAdapter.normalizeInbound({ email: mail({ from: "garbage" }) }, ctx)).toEqual([]);
    expect(emailAdapter.normalizeInbound({ email: mail({ text: "", html: null, subject: "" }) }, ctx)).toEqual([]);
  });

  it("never throws on anything unrecognized", () => {
    for (const raw of [null, undefined, {}, { email: null }, "nonsense", 42, []]) {
      expect(() => emailAdapter.normalizeInbound(raw, ctx)).not.toThrow();
      expect(emailAdapter.normalizeInbound(raw, ctx)).toEqual([]);
    }
  });

  it("returns [] without an org", () => {
    expect(emailAdapter.normalizeInbound({ email: mail() }, { orgId: "" })).toEqual([]);
  });

  it("is deterministic — the same delivery normalizes identically twice", () => {
    const payload = { email: mail() };
    expect(emailAdapter.normalizeInbound(payload, ctx)).toEqual(emailAdapter.normalizeInbound(payload, ctx));
  });
});
