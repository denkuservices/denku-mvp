/**
 * Welcome email template (Resend). Sent once when onboarding starts after verified login.
 * CTA links to /onboarding. NOT used for Supabase Auth emails.
 *
 * Renders through the shared chrome in `../layout` so it looks like the rest of the
 * estate; the old version drew its own fake logo tile (a black square with a "D") and a
 * generic "Welcome to the family!" headline, which is exactly the kind of thing that
 * makes a paid product read as a template.
 */

import { renderEmail, steps, paragraph } from "../layout";

export function welcomeTemplate(): { subject: string; html: string } {
  const subject = "Your Denku workspace is ready";
  const onboardingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.denku.io"}/onboarding`;

  const html = renderEmail({
    title: "Your Denku workspace is ready",
    preheader: "Three short steps and your AI starts answering. It takes about two minutes.",
    eyebrow: "Welcome to Denku",
    heading: "Your workspace is ready",
    intro:
      "Your email is verified, so the only thing between you and an AI that answers every call is a short setup. Most businesses finish it in **under two minutes**.",
    blocks: [
      paragraph("Here's what happens next:"),
      steps([
        "Tell us what your business does and how you want callers greeted.",
        "Choose a plan — your included US phone number comes with it.",
        "We provision the number and your AI starts answering, 24/7.",
      ]),
    ],
    cta: { label: "Start setup", url: onboardingUrl },
    signoff: "If anything is unclear, reply to this email — a person reads it.",
    reason: "You're receiving this because you created a Denku account with this address.",
  });

  return { subject, html };
}
