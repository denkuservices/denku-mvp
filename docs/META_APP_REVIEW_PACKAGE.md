# Meta App Review Package — Instagram (Denku)

> Prepared 2026-07-22 to close Sprint 1.5. This is the submission dossier for taking the Denku
> Meta app from **Development Mode → Live Mode** with **Advanced Access** to the Instagram
> messaging permission. Mechanics: `skills/instagram-integration.md`; operator setup:
> `docs/INSTAGRAM_SETUP.md`.
>
> ⚠️ **Read §7 (Readiness verdict) FIRST.** App Review is **not** required to verify that the
> Sprint 1.5 integration works — that can and should be done today in Development Mode (see §2).
> App Review is required only to receive events from **real customers' accounts**, and the
> receive-only foundation is **not yet in a state that will reliably pass** review for the
> messaging permission. This package documents what to submit *and* what must be true first.

---

## 1. What Development Mode restricts (authoritative — confirmed by Meta docs + production)

**Development Mode delivers ONLY the dashboard "Test" webhook events. No real production data —
including from app Admins, Developers, or Testers — is delivered until the app is published (Live
Mode).** This is Meta's own, current rule, stated verbatim in the App Dashboard:

> *"Apps will only be able to receive test webhooks sent from the dashboard while the app is
> unpublished. No production data, including from app admins, developers or testers, will be
> delivered unless the app has been published."*

and in Meta's Instagram Platform → Webhooks docs: *"Apps must be set to Live in the App Dashboard to
receive webhook notifications."*

**Confirmed against Denku production (2026-07-22):**
- Meta's **signed Test event** → delivered, signature-verified, persisted, `200` (§2). ✅
- A **real** Tester DM (@adkirikci → @minosandco) → **never delivered** (no row, no log). ✅ consistent
  with the rule above.

**⚠️ Corrects an earlier version of this document**, which claimed Development Mode delivers real
webhooks for Tester interactions. That claim came from community forums describing the **older
Instagram-via-Facebook-Login / Messenger** flow and is **wrong** for the **Instagram API with
Instagram Login** flow Denku uses. Do not rely on it. **Receiving real Instagram DM webhooks requires
publishing the app**, which for the messaging permission requires **Business Verification + App
Review (Advanced Access for `instagram_business_manage_messages`)**. This is an **external Meta
platform dependency, not a Denku defect** — the receive pipeline is proven working (§2).

## 2. What CAN be verified without publishing (and what was verified)

Because real data is withheld until Live, the only end-to-end check available in Development Mode is
Meta's **dashboard Test webhook** — which fully exercises our receive pipeline (delivery → signature
verify → persist → log → 200). **This was done and passed in production on 2026-07-22:**

1. Meta App Dashboard → **Instagram → Webhooks** → callback `https://www.denku.io/api/webhooks/instagram`
   (Verified), `messages` field **Subscribed** at the app level.
2. Click **Test** on the `messages` field.
3. Observed: `POST /api/webhooks/instagram → 200` (×2), `signature_valid = true`, rows persisted in
   `instagram_webhook_events`, `[INSTAGRAM][WEBHOOK][RECEIVED]` in Vercel logs.
4. Endpoint hardening confirmed by benign probe: GET wrong-token → **403**; unsigned POST → **401**
   (not 503 → env present, signature enforced).

*(The Test payload is synthetic — `entry.id: "0"`, so `org_id` resolves to null and it is classified
`changes`; a real DM arrives in the `messaging` array with the account's real `ig_user_id`, resolving
the org. That real-message path cannot be exercised until the app is Live — see §1.)*

**Conclusion:** the infrastructure is operationally verified. Verifying **real** message delivery is
**not possible before publishing** — it is gated on §1's Business Verification + App Review + Live App.

## 3. Permissions requested + justifications

| Permission | Access level | Why Denku needs it | Reviewer-facing justification |
|---|---|---|---|
| `instagram_business_basic` | Standard (roles) → Advanced (public) | Identify the connected Instagram Business account (`id`, `username`, `account_type`) and bind inbound events to the correct tenant. | "Denku connects a business's own Instagram professional account and displays which account is linked. Basic profile fields identify the connected account and route its events to that business's workspace." |
| `instagram_business_manage_messages` | Advanced (App Review + Business Verification) | Receive the business's Instagram Direct messages via webhook so Denku can surface them to the business owner and (future epic) generate work items / AI-assisted replies. | "Denku is an AI assistant for small businesses. With the business's consent, it receives that business's own Instagram DMs so the owner never misses a customer message and can respond faster." |
| `instagram_business_manage_comments` *(only if `INSTAGRAM_SCOPES` adds it)* | Advanced | Receive comment events on the business's own media. | Same shape as messages, for comments. Omit from this submission unless the comment feature is being demonstrated. |

**Business Verification** in Meta Business Manager is a hard prerequisite for Advanced Access —
start it in parallel; it has its own document requirements and its own clock.

## 4. Reviewer instructions (test credentials + walkthrough)

Provide in the App Review submission form:

- **Denku test login:** a dashboard account (owner role) on a dedicated review org — email + password.
  *(Create a throwaway; do not use a real customer.)*
- **Test Instagram Business account:** credentials for an IG professional account the reviewer can
  connect, **added as a Tester** on the app.
- **App must be reachable at the canonical host** `https://www.denku.io` (apex `denku.io`
  307-redirects and drops OAuth params — see §6).

Walkthrough to paste into the submission:

1. Log in at `https://www.denku.io/login` with the provided credentials.
2. Go to **Dashboard → Instagram**.
3. Click **Connect Instagram**; authenticate with the provided IG Business account; grant the
   requested permissions.
4. The page shows a **Connected** card with the account handle, type, and token expiry.
5. Send a Direct Message to the connected account from another Instagram account; Denku receives
   and records the message event server-side. *(See §7 — today this is not shown in the UI; that is
   the readiness gap to close before relying on this step.)*
6. Deauthorize / data-deletion callbacks are implemented at
   `/api/instagram/deauthorize` and `/api/instagram/data-deletion`; a user-facing deletion status
   page is at `/instagram-data-deletion?code=…`.

## 5. Screencast checklist

Meta requires a screencast that shows each requested permission **in use by a real UI flow**.
Record (screen + narration), showing:

- [ ] Logging into Denku with the test account.
- [ ] Navigating to **Dashboard → Instagram** and clicking **Connect Instagram**.
- [ ] The **Meta OAuth consent screen**, clearly showing the **permissions being granted** (this
      frame is mandatory — reviewers look for the consent dialog).
- [ ] Returning to Denku showing the **Connected** state with the account handle.
- [ ] A DM being **sent** to the connected account **and something observable happening in Denku as
      a result** — this is the frame the messaging permission is judged on (see §7).
- [ ] The **deauthorize / disconnect** path and the **data-deletion** status page.
- [ ] Recorded against `https://www.denku.io` (not localhost, not a preview URL).
- [ ] English narration; each permission named as it is exercised.

## 6. Common rejection risks (ranked)

1. **Permission-not-demonstrable (highest risk).** `instagram_business_manage_messages` is a
   *messaging* permission; reviewers expect to *see* messages received **and acted on** in the
   product. Sprint 1.5 is **receive-only with no messaging UI** — the received DM lands in a DB
   table the reviewer cannot see. A screencast that ends at "message received (trust us)" is a
   likely reject. → See §7.
2. **No human-agent escalation / opt-out.** Meta's 2025–2026 messaging-automation standards expect
   an easy path for the end-user to reach a human / opt out of automation, and correct handling of
   message **unsend/deletion** events. Not applicable to pure receive, but reviewers may still ask —
   have an answer, or descope to `instagram_business_basic` for this pass.
3. **Business Verification incomplete.** Advanced Access cannot be granted without it. Blocks the
   whole submission regardless of code quality.
4. **Privacy policy inadequate.** Meta reads the privacy policy URL and checks it covers Meta/IG
   data collection, use, and a deletion path. `web/src/app/(marketing)/privacy/page.tsx` exists —
   confirm it explicitly names Instagram/Meta data and points to the data-deletion mechanism.
   *(Cross-risk: R-004 flags the privacy/security pages may over-claim (HIPAA/SOC-2/retention) — a
   reviewer reading them may notice inconsistencies. Resolve R-004 before submission.)*
5. **Callback URL / host mismatch.** Redirect URI and webhook/callback URLs must be the exact
   canonical host `https://www.denku.io/...` byte-for-byte. The apex `denku.io` 307-redirects and
   drops OAuth params. Also verify the `denku.io` vs `denku.ai` naming inconsistency (tracked in
   `CURRENT_SPRINT.md`) does not leak into any configured URL.
6. **Screencast quality.** Missing the consent-dialog frame, wrong domain, or unclear narration are
   frequent, avoidable rejects.
7. **App still in Development Mode / callbacks unreachable at submission time.** Confirm the webhook
   GET handshake, deauthorize, and data-deletion endpoints all respond correctly from the public host.

## 7. Readiness verdict — is this submittable today?

**For `instagram_business_basic` only:** essentially yes — the connect flow is a clean, demonstrable
use of basic profile data. Low rejection risk (still needs Business Verification for Advanced Access
to serve non-owned accounts).

**For `instagram_business_manage_messages`:** **not recommended yet.** The permission is real and the
plumbing is correct, but **App Review judges demonstrable, user-visible use**, and Sprint 1.5
deliberately shipped receive-only with **no messaging surface**. Submitting now risks a rejection on
risk #1 that is avoidable. Two clean paths:

- **Path A — descope this submission.** Submit for `instagram_business_basic` (and Business
  Verification) now to unblock the account-connection experience for real users; defer the
  `instagram_business_manage_messages` review until the messaging feature exists. Lowest risk,
  keeps momentum.
- **Path B — make messaging demonstrable, then submit.** Before submitting for the messaging
  permission, build the minimum reviewable surface: a **received-messages view** in the dashboard
  (read the `instagram_webhook_events` a business owns) and, ideally, a reply path with a clear
  **human-agent/opt-out** affordance. This is the front half of the future "Instagram AI Sales
  Agent" epic — i.e. **Sprint 2+ product work, not Sprint 1.5.**

**Recommendation:** Sprint 1.5's infrastructure is already verified via Meta's Test webhook (§2) —
its closure does **not** depend on App Review. But note the corrected reality (§1): **real Instagram
DM webhooks will not flow at all until the app is published**, and publishing the messaging use case
requires Business Verification + App Review (Advanced Access). So start **Business Verification now**
(long clock), and take **Path A** to unblock the connect experience / **Path B** when the messaging
epic is funded and a demonstrable messaging surface exists.

## 8. Pre-submission checklist

- [x] Receive pipeline verified in production via Meta's signed Test webhook (§2) — Sprint 1.5 infra closed.
- [ ] Business Verification submitted/approved in Meta Business Manager.
- [ ] Privacy policy names Meta/IG data + deletion path; R-004 over-claims resolved.
- [ ] Canonical host `www.denku.io` used everywhere; apex/`.io`-vs-`.ai` checked.
- [ ] Webhook GET handshake, deauthorize, and data-deletion callbacks verified live.
- [ ] Decide **Path A vs B**; if B, the messaging surface + opt-out exist and are demonstrable.
- [ ] Screencast recorded per §5.
- [ ] Test login + test IG account provisioned and Tester roles assigned.

---

### Sources

**Authoritative (Meta first-party) — the rule in §1:**
- [Webhooks — Instagram Platform, Meta for Developers](https://developers.facebook.com/docs/instagram-platform/webhooks) — *"Apps must be set to Live in the App Dashboard to receive webhook notifications."*
- [Not receiving test webhooks in development mode, only in live — Meta Developer Community](https://developers.facebook.com/community/threads/1422484661684866/)
- The Denku App Dashboard's own banner (quoted verbatim in §1).
- [Instagram Platform Overview — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/overview/)

**App Review process reference:**
- [Instagram API Advanced Access Approval Guide](https://singhamandeep.com/instagram-api-advanced-access-approval/)
- [Instagram App Review — Chatwoot Developer Docs](https://developers.chatwoot.com/self-hosted/instagram-app-review)

**⚠️ Superseded / do NOT rely on** (community posts describing the older Instagram-via-Facebook-Login
flow; they wrongly implied Dev-Mode tester delivery — see §1 correction):
- [Instagram DMs webhooks work only in test mode — n8n Community](https://community.n8n.io/t/instagram-dms-webhooks-work-only-in-test-mode/176851)
- [Instagram Webhook Testing — Bubble Forum](https://forum.bubble.io/t/instagram-webhook-testing/88661)
