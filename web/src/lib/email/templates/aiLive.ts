/**
 * "Your AI is live" — sent once, when activation finishes and a real US number is bound
 * to the assistant.
 *
 * This is the product's single proudest moment and it had no email. The number is the
 * payload: a business owner should be able to find this message months later and get
 * the line they bought, which is why it is set as a figure rather than buried in a
 * sentence, and why the mail asks them to call it right now — a customer who has heard
 * their own AI answer is a customer who believes the product.
 */

import { renderEmail, figure, steps, notice } from "../layout";

/** `+13215551234` → `+1 (321) 555-1234`. Falls back to the raw string for anything else. */
export function formatUsPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

export interface AiLiveParams {
  phoneNumberE164: string;
  orgName?: string | null;
  dashboardUrl: string;
}

export function aiLiveTemplate(params: AiLiveParams): { subject: string; html: string } {
  const { phoneNumberE164, orgName, dashboardUrl } = params;
  const pretty = formatUsPhone(phoneNumberE164);

  const subject = `Your AI is live on ${pretty}`;

  const html = renderEmail({
    title: subject,
    preheader: `${pretty} is answering now, 24/7. Call it and hear your AI for yourself.`,
    eyebrow: "You're live",
    heading: "Your AI employee is answering",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "positive",
    intro:
      "Setup is done. Your number is provisioned and your AI is on the line — every hour of every day, including the ones you're asleep for.",
    blocks: [
      figure(pretty, "Your Denku number — answering 24/7", "positive"),
      steps(
        [
          "**Call it now.** Hearing your own AI answer takes thirty seconds and tells you more than any dashboard.",
          "Forward your existing business line to this number when you're ready — nothing changes for your callers.",
          "Watch the tickets, appointments and contacts land in your dashboard after each call.",
        ],
        "positive"
      ),
      notice(
        "Every finished call becomes something you can act on — a ticket or an appointment request — even when the caller rambles. You'll get an email as they come in.",
        "positive"
      ),
    ],
    cta: { label: "Open your dashboard", url: dashboardUrl },
    signoff: "Anything sounding off in the greeting? Reply to this email and we'll tune it with you.",
    reason:
      "You're receiving this because your Denku workspace finished activation.",
  });

  return { subject, html };
}
