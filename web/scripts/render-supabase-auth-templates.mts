/**
 * Generate the Supabase Auth email templates from Denku's own email layout.
 *
 *   npx vite-node --config vitest.config.ts scripts/render-supabase-auth-templates.mts
 *
 * WHY THIS EXISTS: the signup-confirmation, one-time-code and password-recovery emails a
 * real customer receives are sent by **Supabase Auth**, not by our Resend code
 * (`signInWithOtp`, `resetPasswordForEmail`). Supabase renders them from templates stored
 * in its own dashboard, which no amount of work in this repo can change. So the estate
 * has a seam: our templates cover everything else, and these files are the half an
 * operator must paste in.
 *
 * Generating them from the same `renderEmail()` chrome is what keeps the two halves
 * looking like one company. Re-run this after any change to the layout, then paste the
 * output into Supabase Dashboard → Authentication → Emails.
 *
 * Supabase substitutes Go-template variables at send time — `{{ .ConfirmationURL }}`,
 * `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`. They pass through our HTML escaping
 * untouched (no HTML-special characters), so they can be handed in as ordinary strings.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SITE_URL ||= "https://www.denku.io";

const { renderEmail, codeBlock, linkFallback, notice } = await import("../src/lib/email/layout");

const CONFIRMATION_URL = "{{ .ConfirmationURL }}";
const TOKEN = "{{ .Token }}";

const outDir = join(process.cwd(), "..", "docs", "email", "supabase-auth");
mkdirSync(outDir, { recursive: true });

const files: Array<{ name: string; supabaseTemplate: string; html: string }> = [
  {
    name: "confirm-signup.html",
    supabaseTemplate: "Confirm sign up",
    html: renderEmail({
      title: "Your Denku sign-up code",
      preheader: "Enter this code to confirm your email and start setting up your AI.",
      eyebrow: "Confirm your account",
      heading: "Your sign-up code",
      intro:
        "Welcome to Denku. Enter this code on the confirmation screen and we'll take you straight to setting up the AI that answers for your business.",
      blocks: [
        codeBlock(TOKEN),
        notice("This code expires in **1 hour** and can be used once.", "neutral"),
      ],
      reason:
        "You're receiving this because this address was used to create a Denku account. If that wasn't you, ignore this email — nothing is activated until it's confirmed.",
    }),
  },
  {
    name: "magic-link-or-otp.html",
    supabaseTemplate: "Magic link or OTP",
    html: renderEmail({
      title: "Your verification code — Denku",
      preheader: `Your Denku verification code is ${TOKEN}. It expires in 1 hour.`,
      eyebrow: "Verification code",
      heading: "Your sign-in code",
      intro: "Enter this code to confirm your email address:",
      blocks: [
        codeBlock(TOKEN),
        notice("This code expires in **1 hour** and can be used once.", "neutral"),
      ],
      reason:
        "You're receiving this because someone requested a verification code for this address on Denku. If it wasn't you, no action is needed — the code alone gives no access to an existing account.",
    }),
  },
  {
    name: "reset-password.html",
    supabaseTemplate: "Reset Password",
    html: renderEmail({
      title: "Reset your password — Denku",
      preheader: "Choose a new password for your Denku account. The link expires in 1 hour.",
      eyebrow: "Account security",
      heading: "Reset your password",
      intro: "We received a request to reset the password for your Denku account.",
      cta: { label: "Choose a new password", url: CONFIRMATION_URL },
      postCta: [linkFallback(CONFIRMATION_URL)],
      signoff:
        "This link expires in **1 hour**. If you didn't ask for it, you can ignore this email — your current password stays active.",
      reason:
        "You're receiving this because a password reset was requested for this address. This is a security email, not marketing.",
    }),
  },
  {
    name: "change-email.html",
    supabaseTemplate: "Change Email Address",
    html: renderEmail({
      title: "Confirm your new email — Denku",
      preheader: "Confirm this address to finish moving your Denku account to it.",
      eyebrow: "Account security",
      heading: "Confirm your new email address",
      intro:
        "A request was made to change the email address on your Denku account to this one. Confirm it to finish the change.",
      cta: { label: "Confirm this address", url: CONFIRMATION_URL },
      postCta: [linkFallback(CONFIRMATION_URL)],
      blocks: [
        notice(
          "**If you didn't request this**, do not confirm — and reset your password, because someone may have access to your account.",
          "critical"
        ),
      ],
      reason:
        "You're receiving this because this address was given as the new email for a Denku account.",
    }),
  },
];

for (const file of files) {
  writeFileSync(join(outDir, file.name), file.html, "utf8");
}

const readme = `# Supabase Auth email templates

These are the emails **Supabase Auth** sends — sign-up confirmation, the resend code, password
recovery, email change. They are NOT sent by this repo: \`signInWithOtp\` and
\`resetPasswordForEmail\` hand the send to Supabase, which renders from templates stored in its
own dashboard.

That is the one seam in Denku's email estate. Everything else (welcome, activation, billing,
notifications) renders from \`web/src/lib/email/\`; these four have to be pasted in by a person,
once.

## Generated — do not hand-edit

They are produced from the same \`renderEmail()\` chrome as every other Denku email:

\`\`\`bash
cd web && npx vite-node --config vitest.config.ts scripts/render-supabase-auth-templates.mts
\`\`\`

Edit the script (or the layout), re-run, re-paste. Hand-editing these files means the next
regeneration silently throws the edit away.

## Where each file goes

Supabase Dashboard → **Authentication → Emails** (project \`kebqwsdguxxjsijahrox\`). Paste the
file into **Message body** and set the subject:

| File | Supabase template | Subject |
|---|---|---|
| \`confirm-signup.html\` | Confirm sign up | Your Denku sign-up code |
| \`magic-link-or-otp.html\` | Magic link or OTP | Your verification code — Denku |
| \`reset-password.html\` | Reset password | Reset your password — Denku |
| \`change-email.html\` | Change email address | Confirm your new email — Denku |

**Invite user** and **Reauthentication** are deliberately not provided: Denku sends its own
workspace invitations through Resend (\`lib/email/templates/memberInvite.ts\`), and nothing in
the product triggers Supabase reauthentication.

## Why sign-up and "Magic link or OTP" both send a CODE, not a link

Two Supabase behaviours decide this, and neither is obvious:

1. **Supabase picks the template by whether the address already exists.** A new address gets
   *Confirm sign up*; an existing one gets *Magic link or OTP*. The first \`signInWithOtp({
   shouldCreateUser: true })\` CREATES the (unconfirmed) user — so in Denku the first code comes
   from *Confirm sign up* and **every "resend code" comes from *Magic link or OTP***. Both are the
   same screen to the customer.
2. **The template's variables decide what arrives.** \`{{ .Token }}\` sends six digits;
   \`{{ .ConfirmationURL }}\` sends a sign-in link. Supabase does not care which flow you meant.

Denku's verification screen only accepts a code (\`verifyOtp({ type: "email", token })\`), and the
code path is the one that then asks for a password (\`needsPassword: true\`). A customer who
receives a link instead clicks into \`/auth/callback\`, gets a session, and **skips password
setup** — an account with no password. So both templates are code-only, on purpose. Do not add
\`{{ .ConfirmationURL }}\` to either one.

## The Security notification toggles

Supabase can also send its own unbranded notices (Password changed, Email address changed, Phone
number changed, Sign-in method linked/removed, MFA added/removed).

- **Password changed → leave OFF.** Denku sends its own branded one from
  \`lib/notifications/securityNotifications.ts\` on both password-change paths. Enabling
  Supabase's too means two emails for one event.
- **Email address changed → ON is reasonable** if you expose an email-change flow: it notifies the
  OLD address, which nothing in this repo covers. Until that flow exists it can never fire.
- **Phone number changed / sign-in method / MFA → leave OFF.** Denku uses none of these, so they
  cannot fire; turning them on only risks an unbranded email appearing later.

## One thing to check after installing

The masthead logo is loaded from \`https://www.denku.io/email/denku-mark.png\`. It must be
deployed before these go out, or every one of these emails shows a broken image where the brand
should be. The text fallback is the word "Denku", so nothing breaks — it just looks like a
phishing attempt, which is the opposite of what an auth email needs.
`;

writeFileSync(join(outDir, "README.md"), readme, "utf8");

console.log(`Wrote ${files.length} Supabase Auth templates + README → ${outDir}`);
