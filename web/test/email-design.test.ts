import { describe, it, expect } from "vitest";

/**
 * The email estate, held to one design and one set of promises.
 *
 * Mail is the surface with no runtime feedback: nothing fails loudly when a template
 * drifts, an escape is forgotten, or a new email ships without the brand — a customer
 * simply receives something that looks like it came from somewhere else. These tests are
 * the only place that notices.
 *
 * Everything here is pure: the templates take resolved fields and return HTML. Nothing
 * touches Supabase, Resend or the network.
 */

import { emailPreviews } from "@/lib/email/previewSamples";
import { EMAIL_COLORS, EMAIL_LOGO_URL } from "@/lib/email/brand";
import { renderEmail, paragraph } from "@/lib/email/layout";
import { planActivatedTemplate } from "@/lib/email/templates/planActivated";
import { paymentFailedTemplate } from "@/lib/email/templates/paymentFailed";
import { paymentReceiptTemplate } from "@/lib/email/templates/paymentReceipt";
import { subscriptionCanceledTemplate } from "@/lib/email/templates/subscriptionCanceled";
import { addonPurchasedTemplate } from "@/lib/email/templates/addonPurchased";
import { workspaceResumedTemplate } from "@/lib/email/templates/workspaceResumed";
import { passwordChangedTemplate } from "@/lib/email/templates/passwordChanged";
import { aiLiveTemplate, formatUsPhone } from "@/lib/email/templates/aiLive";

const previews = emailPreviews();

/**
 * The layout escapes apostrophes and ampersands (`&#39;`, `&amp;`) because most of what
 * it interpolates is a stranger's words. Assertions about COPY therefore read the decoded
 * text; assertions about MARKUP keep looking at the raw HTML.
 */
function text(html: string): string {
  return html
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("every transactional email carries the Denku chrome", () => {
  it.each(previews.map((p) => [p.key, p] as const))("%s", (_key, preview) => {
    const { html, subject } = preview;

    // Brand masthead: the mark and the wordmark, on the dark ground.
    expect(html).toContain(EMAIL_LOGO_URL);
    expect(html).toContain(">denku<");
    expect(html).toContain(EMAIL_COLORS.ink);
    // The copper hairline under the masthead — the estate's signature.
    expect(html).toContain(EMAIL_COLORS.copper);

    // A preheader, so no client scrapes the masthead for its preview line.
    expect(html).toMatch(/mso-hide:all/);

    // The honest "why am I getting this" line, in every single email.
    expect(text(html)).toMatch(/You're receiving this|you can ignore this email/i);

    // Footer links resolve to real marketing pages.
    expect(html).toContain("https://www.denku.io/support");
    expect(html).toContain("https://www.denku.io/privacy");

    // A subject that says something.
    expect(subject.length).toBeGreaterThan(8);
  });

  it("has no leftovers from the pre-brand templates", () => {
    for (const preview of previews) {
      // The starter-template indigo that four of these emails used to ship with.
      expect(preview.html).not.toContain("#4f46e5");
      // Emoji-as-design in subject lines (the old paused/welcome mails).
      expect(preview.subject).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{26A0}]/u);
      // Table-based layout is the only thing Outlook renders; a bare <div> shell is the
      // tell that a template was written outside the shared chrome.
      expect(preview.html).toContain('role="presentation"');
    }
  });

  it("renders every email at a fixed 600px, which is what mail clients agree on", () => {
    for (const preview of previews) {
      expect(preview.html).toContain('width="600"');
    }
  });
});

describe("escaping", () => {
  it("escapes caller-controlled text rather than trusting it", () => {
    const html = renderEmail({
      title: "t",
      preheader: "p",
      heading: "<script>alert(1)</script>",
      greeting: "Hi <img src=x onerror=alert(1)>,",
      intro: "<b>not bold</b>",
      reason: "r",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("allows only **bold** through as markup", () => {
    const html = paragraph("a **strong** word <b>and no tag</b>");
    expect(html).toContain("<strong");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("billing emails state the facts a customer would look for later", () => {
  it("purchase confirmation shows plan, price and what's included", () => {
    const { subject, html } = planActivatedTemplate({
      planName: "Growth",
      monthlyFeeUsd: 399,
      includedMinutes: 1200,
      includedPhoneNumbers: 1,
      concurrencyLimit: 4,
      overageRateUsdPerMin: 0.18,
      orgName: "Acme",
      ctaUrl: "https://www.denku.io/onboarding",
    });

    expect(subject).toBe("Your Growth plan is active");
    expect(html).toContain("$399.00");
    expect(html).toContain("1,200");
    expect(html).toContain("$0.18");
    expect(html).toContain("Acme");
  });

  it("receipt shows the amount actually paid, from cents", () => {
    const { subject, html } = paymentReceiptTemplate({
      amountPaidCents: 39900,
      paidAt: "2026-09-01T06:02:00.000Z",
      invoiceNumber: "INV-7",
      billingUrl: "https://www.denku.io/dashboard/settings/workspace/billing",
    });

    expect(subject).toContain("$399.00");
    expect(html).toContain("INV-7");
    expect(html).toContain("1 September 2026");
  });

  it("dunning warns about the consequence without pretending the line is already dead", () => {
    const { html } = paymentFailedTemplate({
      amountDueCents: 14900,
      billingUrl: "https://www.denku.io/dashboard/settings/workspace/billing",
    });

    expect(html).toContain("$149.00");
    expect(html).toMatch(/still answering/i);
    expect(html).toMatch(/pause/i);
  });

  it("a scheduled cancellation warns that the number is released; an ended one does not promise it back", () => {
    const scheduled = subscriptionCanceledTemplate({
      state: "scheduled",
      effectiveAt: "2026-10-01T00:00:00.000Z",
      billingUrl: "https://www.denku.io/x",
    });
    expect(scheduled.subject).toMatch(/set to end/i);
    expect(text(scheduled.html)).toMatch(/can't be recovered/i);
    expect(scheduled.html).toContain("1 October 2026");

    const ended = subscriptionCanceledTemplate({ state: "ended", billingUrl: "https://www.denku.io/x" });
    expect(ended.subject).toMatch(/has ended/i);
    expect(ended.html).toMatch(/released/i);
  });

  it("an add-on change reports the new effective capability, not just the delta", () => {
    const { html } = addonPurchasedTemplate({
      addonKey: "extra_phone",
      qty: 1,
      previousQty: 0,
      effectiveTotal: 2,
      billingUrl: "https://www.denku.io/x",
    });

    expect(html).toMatch(/0 → 1/);
    expect(html).toContain("2 phone numbers");
  });

  it("the resume email closes the loop the pause email opened", () => {
    const { subject, html } = workspaceResumedTemplate({
      reason: "payment_received",
      dashboardUrl: "https://www.denku.io/dashboard",
    });
    expect(subject).toMatch(/answering again/i);
    // Honest about the gap: calls during the pause never reached us.
    expect(html).toMatch(/while the line was paused/i);
  });
});

describe("lifecycle and security emails", () => {
  it("the go-live email leads with the number, formatted for humans", () => {
    const { subject, html } = aiLiveTemplate({
      phoneNumberE164: "+13215550142",
      orgName: "Acme",
      dashboardUrl: "https://www.denku.io/dashboard",
    });

    expect(subject).toContain("+1 (321) 555-0142");
    expect(html).toContain("+1 (321) 555-0142");
  });

  it("formats US numbers and leaves anything else alone", () => {
    expect(formatUsPhone("+13215550142")).toBe("+1 (321) 555-0142");
    expect(formatUsPhone("+442071838750")).toBe("+442071838750");
  });

  it("the password-change notice carries no reset link of its own (that is a phishing shape)", () => {
    const { html } = passwordChangedTemplate({
      changedAt: "2026-09-01T09:24:00.000Z",
      recoveryUrl: "https://www.denku.io/forgot-password",
    });

    expect(html).toContain("https://www.denku.io/forgot-password");
    expect(text(html)).toMatch(/wasn't you/i);
    // It says it cannot be turned off — that promise is the point of the email.
    expect(text(html)).toMatch(/can't turn it off|every password change/i);
  });
});
