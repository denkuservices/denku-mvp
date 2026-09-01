# Supabase Auth email templates

These are the emails **Supabase Auth** sends — sign-up confirmation, the resend code, password
recovery, email change. They are NOT sent by this repo: `signInWithOtp` and
`resetPasswordForEmail` hand the send to Supabase, which renders from templates stored in its
own dashboard.

That is the one seam in Denku's email estate. Everything else (welcome, activation, billing,
notifications) renders from `web/src/lib/email/`; these four have to be pasted in by a person,
once.

## Generated — do not hand-edit

They are produced from the same `renderEmail()` chrome as every other Denku email:

```bash
cd web && npx vite-node --config vitest.config.ts scripts/render-supabase-auth-templates.mts
```

Edit the script (or the layout), re-run, re-paste. Hand-editing these files means the next
regeneration silently throws the edit away.

## Where each file goes

Supabase Dashboard → **Authentication → Emails** (project `kebqwsdguxxjsijahrox`). Paste the
file into **Message body** and set the subject:

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm sign up | Your Denku sign-up code |
| `magic-link-or-otp.html` | Magic link or OTP | Your verification code — Denku |
| `reset-password.html` | Reset password | Reset your password — Denku |
| `change-email.html` | Change email address | Confirm your new email — Denku |

**Invite user** and **Reauthentication** are deliberately not provided: Denku sends its own
workspace invitations through Resend (`lib/email/templates/memberInvite.ts`), and nothing in
the product triggers Supabase reauthentication.

## Why sign-up and "Magic link or OTP" both send a CODE, not a link

Two Supabase behaviours decide this, and neither is obvious:

1. **Supabase picks the template by whether the address already exists.** A new address gets
   *Confirm sign up*; an existing one gets *Magic link or OTP*. The first `signInWithOtp({
   shouldCreateUser: true })` CREATES the (unconfirmed) user — so in Denku the first code comes
   from *Confirm sign up* and **every "resend code" comes from *Magic link or OTP***. Both are the
   same screen to the customer.
2. **The template's variables decide what arrives.** `{{ .Token }}` sends six digits;
   `{{ .ConfirmationURL }}` sends a sign-in link. Supabase does not care which flow you meant.

Denku's verification screen only accepts a code (`verifyOtp({ type: "email", token })`), and the
code path is the one that then asks for a password (`needsPassword: true`). A customer who
receives a link instead clicks into `/auth/callback`, gets a session, and **skips password
setup** — an account with no password. So both templates are code-only, on purpose. Do not add
`{{ .ConfirmationURL }}` to either one.

## The Security notification toggles

Supabase can also send its own unbranded notices (Password changed, Email address changed, Phone
number changed, Sign-in method linked/removed, MFA added/removed).

- **Password changed → leave OFF.** Denku sends its own branded one from
  `lib/notifications/securityNotifications.ts` on both password-change paths. Enabling
  Supabase's too means two emails for one event.
- **Email address changed → ON is reasonable** if you expose an email-change flow: it notifies the
  OLD address, which nothing in this repo covers. Until that flow exists it can never fire.
- **Phone number changed / sign-in method / MFA → leave OFF.** Denku uses none of these, so they
  cannot fire; turning them on only risks an unbranded email appearing later.

## One thing to check after installing

The masthead logo is loaded from `https://www.denku.io/email/denku-mark.png`. It must be
deployed before these go out, or every one of these emails shows a broken image where the brand
should be. The text fallback is the word "Denku", so nothing breaks — it just looks like a
phishing attempt, which is the opposite of what an auth email needs.
