# Transactional email — the estate, the chrome, and the send-once rule

> Everything Denku sends to a customer's inbox: what exists, what triggers it, what it looks
> like, and the two rules that keep it from becoming a liability. Read this before adding an
> email, changing a template, or wondering why a customer did not receive one.
> Companion docs: `skills/billing-and-stripe.md` (what the money events mean),
> `skills/email-integration.md` (the *channel* — mail we receive on a customer's behalf; a
> completely different subsystem that happens to share the word "email").

## The one-paragraph version

**19 emails render from this repo** (`web/src/lib/email/`) through a single shared chrome
(`layout.ts` + `brand.ts`), and are previewable as one gallery. A further **five auth emails are
rendered by Supabase Auth** from templates stored in its own dashboard — generated into
`docs/email/supabase-auth/` from the same chrome, and pasted in by an operator. Sending goes through Resend from three verified `denku.io` senders
(`senders.ts`). Anything triggered by a webhook, a cron or a resumable action sends through
`sendOnce()` (`lib/email/dispatch.ts`), which claims a row in `email_dispatch_log` so a
redelivery cannot email a customer twice. Money mail is staged behind
`BILLING_NOTIFICATIONS_ENABLED`; onboarding and security mail is not.

## The estate

| Email | Trigger | Sends from | Flag |
|---|---|---|---|
| Confirm signup | Signup | **Supabase Auth** | — |
| One-time code | Code requested / resent | **Supabase Auth** | — |
| Magic link | Passwordless sign-in | **Supabase Auth** | — |
| Reset password | Reset requested | **Supabase Auth** | — |
| Change email | Email change requested | **Supabase Auth** | — |
| Verify email (Resend path) | `signupAction` → `sendVerifyEmail` | `templates.ts` | — |
| Welcome / start setup | Onboarding starts after verified login (once per org) | `sendWelcomeOnOnboardingStart.ts` | — |
| **Your AI is live** | Activation binds a US number (once per org) | `activationNotifications.ts` | — |
| Workspace invitation | Owner invites a teammate | `api/members/invite` | — |
| **Password changed** | Every successful password change — the reset link AND Settings → Security | `securityNotifications.ts` | — |
| **Subscription confirmed** | Stripe `checkout.session.completed` | `lifecycleNotifications.ts` | `BILLING_NOTIFICATIONS_ENABLED` |
| **Payment receipt** | Stripe `invoice.payment_succeeded` | `lifecycleNotifications.ts` | same |
| **Payment failed** | Stripe `invoice.payment_failed` | `lifecycleNotifications.ts` | same |
| **Add-on changed** | `/api/billing/addons/update` succeeds | route → `notifyAddonChanged` | same |
| **Cancellation scheduled** | `customer.subscription.updated` + `cancel_at_period_end` | `lifecycleNotifications.ts` | same |
| **Subscription ended** | `customer.subscription.deleted` | `lifecycleNotifications.ts` | same |
| Usage threshold 50/75/90% | Daily usage cron crosses a threshold | `usageAlerts.ts` | same |
| Line paused (cap / past due) | active→paused transition | `pauseNotifications.ts` | same |
| **Line answering again** | paused→active transition | `lifecycleNotifications.ts` | same |
| New ticket / appointment | AI captures an artifact from a conversation | `artifactNotifications.ts` | `ARTIFACT_NOTIFICATIONS_ENABLED` |

**Bold** = added 2026-09-01. Before that date Denku emailed the two moments where it takes
something away (usage warning, pause) and none of the moments where the customer gives money
or gets what they bought — no purchase confirmation, no receipt, no dunning warning before the
line went dead, no "your number is live", no password-change notice.

## Seeing them

```bash
cd web && npx vite-node --config vitest.config.ts scripts/render-email-previews.mts
# → web/.email-previews/index.html (gitignored), every email in one gallery
```

Or, with a dev server running, `/api/dev/email-preview` (404s in production). Both read the
same inventory: `lib/email/previewSamples.ts`. **A new email must be registered there** — that
is the list the tests iterate, so an unregistered template is one nobody ever looks at.

## The chrome

`renderEmail()` in `lib/email/layout.ts`. One structure for every message: dark `#0A1414`
masthead with the vortex mark and the `denku` wordmark, a 3px copper hairline, a white card on
a bone ground, serif headings, one button style, one footer.

Palette and type are the landing system's, restated as literal hex in `brand.ts` because email
has no CSS variables. Fraunces cannot be loaded in mail, so the display voice is a Georgia-led
serif stack — the closest ubiquitous stand-in.

Blocks available to templates: `paragraph`, `panel`, `detailList`, `figure`, `meter`, `quote`,
`notice`, `steps`, `codeBlock`, `linkFallback`, `divider`. Templates hand in **plain strings**,
never HTML; `**bold**` is the only markup that survives, applied after escaping. That is not
stylistic — most of what these templates interpolate (a transcript, a business name, a subject
typed by a stranger on the web widget) is not ours.

Tone (`neutral | positive | warning | critical`) changes the accent, the button fill and the
notice wash — nothing else. A paused workspace and a welcome must look like the same company
wrote them.

### What the markup is fighting

- **Outlook (Word engine)** ignores `border-radius`, `max-width` on divs, and most modern CSS →
  tables all the way down, fixed 600px, VML behind every button.
- **Forced dark mode** inverts unpredictably → `color-scheme: light` plus an explicit `bgcolor`
  on every container.
- **No SVG** anywhere in mail → the mark ships as `public/email/denku-mark.png`, rasterised
  from `app/icon.svg` at 4× display size, referenced by **absolute canonical URL**. A relative
  path or a preview-host URL is a broken image in someone's inbox forever (the R-077 defect
  class). The alt text is "Denku", so a blocked image degrades to a word, not a gap.

## The send-once rule

Every trigger in the "bold" half of that table can fire twice: Stripe redelivers webhooks on
any non-2xx and on its own schedule, activation is explicitly resume-from-partial, crons re-run.
So those sends go through `sendOnce()`:

1. **CLAIM** — insert `(kind, dedupe_key)` into `email_dispatch_log`. A unique violation means
   someone already sent it → skip, silently, and report `duplicate`.
2. **SEND**.
3. **RELEASE on failure** — delete the row so a later delivery retries.

Claiming before sending can lose a mail if the process dies mid-send; sending before claiming
can duplicate one. Transactional mail prefers the loss: a retry recovers it, a duplicate receipt
cannot be recalled. If the claim itself cannot be *recorded*, nothing is sent — silence beats a
receipt we cannot promise is unique.

**Choosing a dedupe key** is the whole game. Use the most stable identifier the event has:

| Email | Key | Why |
|---|---|---|
| Subscription confirmed | checkout session id | Stripe sends `completed` and `async_payment_succeeded` for one purchase |
| Payment receipt | invoice id | one receipt per invoice, forever |
| Payment failed | `invoice:attempt_count` | each genuine retry is worth telling; a redelivery of one attempt is not |
| Cancellation | `subscription:state` | the scheduled notice and the final one are different facts |
| Add-on changed | `org:addon:qty` | re-writing the same quantity is the same state |
| AI is live | org id | a workspace goes live once |
| Password changed | `user:YYYY-MM-DDTHH:mm` | guards a double-submit; a second change tomorrow must still email |

Never a timestamp with seconds, never a random id — a key that changes every call deduplicates
nothing, and the ledger becomes a log.

Older emails keep their own proven claims and were left alone: the welcome mail claims
`organization_settings.welcome_email_sent_at` by conditional UPDATE; artifact notifications
claim `notified_at`. Do not migrate them for tidiness.

## Rules for adding an email

1. **Write it as a template module** in `lib/email/templates/`, pure, returning
   `{ subject, html }`, rendering through `renderEmail()`. No HTML in a route handler.
2. **Register it in `previewSamples.ts`** with its real trigger and source. The design tests
   iterate that list, so registration is what enforces the chrome on your template.
3. **Send through `sendOnce()`** with a stable dedupe key, from a `notify*` function that
   **never throws** — a webhook must return 200 for money that already moved.
4. **Write the honest `reason` line.** Every email states why this person is receiving it.
   "You're receiving this because…" — and if it cannot be turned off, say so and say why.
5. **Decide the flag deliberately.** Money mail → `BILLING_NOTIFICATIONS_ENABLED` (one switch,
   not a per-email flag estate). Onboarding and security mail → unflagged, like the welcome
   email: the password-change notice's entire value is arriving unbidden.
6. **Never send from an unverified sender.** `resolveSender()` only — `auth` (no-reply),
   `notify` (notifications), `welcome` (hello@, a human reads replies).

## Landmines

1. **Supabase Auth owns the auth mail a real customer sees.** `signInWithOtp` and
   `resetPasswordForEmail` hand the send to Supabase, which renders from templates in *its*
   dashboard. Editing `lib/email/templates.ts` changes only the Resend path. The generated,
   brand-matching versions are in `docs/email/supabase-auth/` with install instructions —
   until an operator pastes them in, signup and password-reset emails do not match the estate.
2. **`RESEND_FROM*` values pasted with quotes** produce a Resend 422 and silent non-delivery.
   `sanitizeSender()` strips a wrapping quote pair; that bug cost a day in production once.
3. **`lib/email/senders.ts` is for OUR mail only.** The email *channel* sends as the customer
   and must never reuse it — see landmine 13 in `CLAUDE.md`.
4. **The masthead PNG must be deployed before the templates go out.** It lives in
   `web/public/email/`; nothing else references it, so it is easy to forget in a partial deploy.
5. **Supabase's own Security notifications must stay OFF for "Password changed".** Denku sends
   its own branded one on both change paths; enabling Supabase's too means two emails for one
   event. The rest of that panel (phone, MFA, sign-in methods) covers features Denku does not
   use. Guidance lives in `docs/email/supabase-auth/README.md`.
6. **`BILLING_NOTIFICATIONS_ENABLED` is a single point of silence.** With it off, six of the
   most consequential emails in the product do not send and nothing anywhere says so. When
   turning it on, watch `[EMAIL][DISPATCH][SENT]` and `[BILLING_NOTIFY]` in the logs.

## Tests

- `test/email-design.test.ts` — iterates the whole inventory: chrome present, no pre-brand
  leftovers (`#4f46e5`, emoji subjects, non-table layout), escaping holds, and the facts each
  billing email must state.
- `test/email-dispatch.test.ts` — the claim protocol's four states.
- `test/email-senders.test.ts` — sender resolution and the quote-stripping fix.
- Existing per-template tests (`usage-alerts`, `workspace-paused-email`,
  `artifact-notifications`) still assert their subjects and links.
