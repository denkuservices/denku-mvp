# Sprint 2 Review & Retrospective — Trust & Value Made Visible

- **Sprint:** 2 · **Window:** 2026-07-23 · **Scope:** trimmed core (approved 2026-07-23)
- **Goal (verbatim):** *Sprint 1 made Denku safe and honest. Sprint 2 makes its value visible and its
  trust surfaces truthful: the business sees what the AI did for it between logins, is never
  surprised by cost or a service cut, can recover access, and reads marketing that matches the
  product.*
- **One-line verdict:** **Three items shipped code-complete and CI-green (R-011, R-008, R-018) with
  a small dead-code cleanup; R-009 deliberately DEFERRED** (owner decision — do not build overage
  behavior on the unversioned billing math, R-075). The two pillars achievable without external
  prerequisites — *recover access* and *value visible / trust truthful* — are delivered; *never
  surprised by cost* is correctly held until the billing math is version-controlled.

---

## 1. Planned (trimmed core) vs delivered

| Item | Planned | Delivered | Notes |
|---|---|---|---|
| **R-011** forgot-password | Full reset flow | ✅ **Code-complete** | Supabase built-in recovery (no Resend dep); dedicated `/auth/reset-callback` (signup path untouched); 5 unit tests |
| **R-008** artifact notifications | Idempotent email on ticket/appt | ✅ **Code-complete, staged OFF** | End-of-call sweep, atomic `notified_at` claim, verified `denku.io` sender, per-org opt-out; migration; 10 tests |
| **R-009** overage warnings | Warnings + hard-cap policy | ⏸️ **DEFERRED → Sprint 3** | Owner decision: blocked by R-075 (unversioned billing math) + needs a product policy decision |
| **R-018** dashboard data honesty | *(added — unblocked continuation)* | ✅ **Code-complete** | Real denominator, savings methodology tooltip, honest status labels, "Active AI lines"; removed 2 dead Potemkin files |

**New finding filed:** **R-080** (auth verify/OTP/reset emails send from the stale sandbox
`onboarding@resend.dev` sender). **Partial:** **R-034** (2 confirmed-dead files removed).

## 2. Completed roadmap IDs

**Completed (3):** R-011, R-008 (code; operator-gated activation), R-018.
**Deferred (1):** R-009 (→ Sprint 3, behind R-075).
**Filed (1):** R-080. **Partial (1):** R-034.

Roadmap moved from **69 open / 10 completed** to **67 open / 12 completed** (R-080 added, R-011/R-008/R-018 completed).

## 3. Remaining external / operator tasks (DoD residuals — engineering-done vs operationally-verified)

None are code. Ordered by leverage:

1. **R-011:** add `${baseUrl}/auth/reset-callback` to the Supabase Auth **Redirect URLs** allowlist
   (where `/auth/callback` is already listed), then run one live end-to-end reset. Without the
   allowlist entry Supabase falls back to Site URL and the link won't reach the reset form.
2. **R-008 activation (staged OFF today):** (a) apply migration
   `supabase/migrations/20260723000000_artifact_notifications.sql` to prod; (b) set
   `VAPI_WEBHOOK_AUTH_MODE=enforce` (R-001 — the pre-existing Sprint-1 Task-0 item) so events aren't
   forgeable; (c) confirm `denku.io` deliverability; then set `ARTIFACT_NOTIFICATIONS_ENABLED=true`
   and observe a real artifact send exactly one email.
3. **R-018:** none required — but a live visual check of the dashboard is worthwhile.

*(The Sprint-1 operator handoff — rotate admin creds, `VAPI_WEBHOOK_BASE_URL` + reconcile, live test
call, flip webhook enforce, enforce CSP — remains outstanding and now also gates R-008 activation.)*

## 4. Regressions

**None.** All changes are additive or display-only:
- R-008 adds a **non-fatal, never-throw** notification sweep AFTER artifact persistence; it cannot
  affect call finalization or the deterministic-artifact guarantee, and is gated OFF by default.
- R-011 adds new routes/pages and repoints one dead link; the shared signup `/auth/callback` is
  **untouched** (recovery uses a separate route by design).
- R-018 changes the **display layer** and adds a server field (`total_calls`); the 2 deleted files
  had **zero importers** (grep-verified).
- Build green; 73 tests green (58 → 73, +15); no change to the do-not-regress core (deterministic
  artifacts, leases, pause, month-close).

*Caveat (honest):* "no regression" is asserted via code review + green tests + green build, **not** a
live run — same limitation as Sprint 1.

## 5. Metrics

| Metric | Value |
|---|---|
| Items shipped (code) | 3 (R-011, R-008, R-018) + partial R-034 |
| Items deferred | 1 (R-009 → Sprint 3) |
| New source modules | 6 (`passwordPolicy`, forgot/reset actions+pages, `reset-callback`, `notifications/artifactNotifications`, `templates/artifactNotification`) |
| Migrations | 1 (`20260723000000_artifact_notifications.sql`, additive) |
| Files deleted (dead/Potemkin) | 2 |
| Tests | 58 → **73** (+15: 5 password-policy, 10 artifact-notifications), all green |
| Build | green (`✓ Compiled successfully`) |
| New env flags | 1 (`ARTIFACT_NOTIFICATIONS_ENABLED`, default OFF) |
| Regressions | 0 |

## 6. Lessons learned

**What worked**
- **Reusing the platform's own proven patterns** beat inventing new ones. R-011 rode Supabase's
  built-in recovery (already the "source of truth" for auth email) instead of a custom Resend path;
  R-008 reused the welcome-email conditional-UPDATE idempotency lock. Both are simpler and more
  reliable for it.
- **Staged-OFF for anything touching live ingestion.** R-008 ships behind `ARTIFACT_NOTIFICATIONS_ENABLED`
  (default OFF) and is documented to enable only after webhook `enforce` — the same stage-then-enforce
  discipline that de-risked Sprint 1's R-001/R-056.
- **Extracting pure cores kept the critical path testable.** `passwordPolicy`, the notification
  template/gate/recipient helpers are unit-tested without touching Supabase or the 3,100-line webhook.
- **Deferring beat building on sand.** R-009's value half depends on the unversioned billing math
  (R-075); the owner's call to defer honored the execution-plan rule ("never touch the money path on
  inference") rather than shipping plausible-but-unverifiable overage behavior.

**What to watch / a correction I made mid-sprint**
- **I briefly mis-flagged a blocker, then corrected it against the code.** I first claimed R-008/R-009
  were blocked by a "Resend sandbox domain," reading the stale `SENDER = onboarding@resend.dev`
  constant. The owner pushed back (the `denku.io` domain is verified), and re-reading the code proved
  them right — the welcome email already sends from `denku.io`; only the auth emails use the stale
  sender (now filed as R-080). **Lesson (echoing Sprint 1.5's):** a confident inference from one
  artifact is still a guess — verify against the fuller codebase/first-party truth before writing it
  into the roadmap. I corrected every doc I'd mis-written in the same sprint.
- **The verification-enablement gap persists.** R-011 and R-008 both end at operator-gated steps
  (Supabase allowlist, migration apply, env flags, webhook enforce) the workspace can't perform — the
  same "code can't reach prod" ceiling as Sprints 1 and 1.5. The DoD split (engineering-done vs
  operationally-verified) is stated up front here to keep "done" unambiguous.

## 7. Recommendations for Sprint 3

1. **Unblock the billing chain first: R-075 → then R-009.** Baseline the `org_monthly_invoice_preview`
   view/RPC into `supabase/migrations` and prove the minute/overage math; that unblocks R-009's
   threshold warnings *and* the broader billing verifiability (R-031, R-076). Make the hard-cap policy
   decision (pause vs keep-billing) once the math is version-controlled.
2. **Run the operator handoff.** The Sprint-1 Task-0 items are now also R-008's activation
   prerequisites — a ~30-minute ops session converts three "code-complete" items (R-001, R-050/R-077,
   R-008) into operationally-live and validates the call→artifact→email loop end-to-end.
3. **Systemic security is queued and cheap now.** R-060 (RLS backstop — live advisor confirms 10
   public tables RLS-disabled) and R-057 (per-operator admin identity) are the highest systemic-risk
   items and now sit on a green test foundation.
4. **Opportunistic health:** finish R-034 (root `src/` legacy MVP), R-033 (client converge), R-080
   (fix the stale sandbox sender). Small, mechanical, reduce surface.

---

*Living companion to the roadmap. Retrospective §11 records the cross-sprint lessons.*
