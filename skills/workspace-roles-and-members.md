# Workspace roles, members and the audit log

> Who may do what inside a Denku workspace, how membership changes hands, and what gets written down
> when it does. Built 2026-09-01 after the Settings audit.

## What was wrong

Two findings were live security holes, not gaps:

1. **Billing had no role check at all.** `/api/billing/plan/change`, `/api/billing/addons/update`,
   `/api/billing/stripe/portal`, `/api/billing/stripe/checkout` and `/api/phone-lines/purchase`
   verified that *someone* was signed in and then charged their employer's card. A `viewer` could
   move a workspace from $149 to $899, add paid add-ons, or open the Stripe portal.
2. **An admin could mint an owner.** The invite form offered `owner` to anyone who could invite, so
   `admin` and `owner` were the same role wearing different labels. There was also no single-owner
   concept, no ownership transfer, and nothing stopping the last owner being removed — which would
   leave a workspace with nobody who could take a billing decision and no way back.

Three more were honesty problems: the audit log claimed to cover "plan changes and member actions"
while **nothing on either path ever wrote a row**; it was readable by any signed-in member though it
names people and what they did; and the member list could show you who was there and do nothing
about any of them.

## The capability matrix

`web/src/lib/auth/permissions.ts` is the single source of truth. Roles are `owner | admin | viewer`
(now CHECK-constrained in Postgres).

| Capability | owner | admin | viewer |
|---|:--:|:--:|:--:|
| `view_workspace` | ✓ | ✓ | ✓ |
| `manage_workspace_settings` | ✓ | ✓ | |
| `manage_members` | ✓ | ✓ | |
| `manage_billing` | ✓ | ✓ | |
| `manage_workspace_state` (pause/resume) | ✓ | ✓ | |
| `manage_channels` | ✓ | ✓ | |
| `view_audit_log` | ✓ | ✓ | |
| `grant_owner` | ✓ | | |
| `delete_workspace` | ✓ | | |

Three things about this module that are deliberate:

- **The role is read with the service-role client, not through RLS.** Authorization must not depend
  on a policy staying permissive: if a future policy hid `role`, an RLS-based check would start
  returning "no role", which reads as "not permitted" — correct, but only by luck.
- **An unrecognised role string is not a role.** `isRole` fails closed, so a typo in the column
  cannot read as `owner` merely because it is not `viewer`.
- **`profiles` is looked up by `id` first, then `auth_user_id`.** This codebase carries both keys
  across its history, and the invite route used to key on one while billing keyed on the other — the
  same user, found two ways, authorized differently depending which route you hit.

`guard(capability)` is what a route calls. It returns the resolved viewer on success and a
ready-to-return `NextResponse` on failure, so every refusal has the same shape and the same status.
Refusal copy names the role that would be needed — "Forbidden" leaves someone staring at a button
wondering if it is broken.

## Membership rules (enforced server-side, restated in the UI)

- **Only an owner may grant or take `owner`** — invite, role change, transfer.
- **The last owner cannot be demoted or removed.** `assertNotLastOwner` counts owners at the moment
  of the write, not from a number the UI rendered a minute ago.
- **You cannot remove yourself.**
- **"Remove" detaches, it does not delete.** Membership is `profiles.org_id`; removal nulls it and
  the person keeps their Denku account. Deleting their auth user would be a different and far more
  destructive thing, and these routes deliberately do not do it.
- **Ownership transfer is one SQL function**, `transfer_org_ownership` (SECURITY DEFINER, pinned
  `search_path`), which re-checks that the caller is the owner inside the database. Two UPDATEs from
  application code would leave a window with two owners — or, if the second failed, none.

`viewer` is invitable now. It existed in the data model and in the roster pill and was the one role
nobody could actually be given, so a business wanting a read-only bookkeeper had to make them admin.

## The audit log

Reading: `lib/audit/read.ts` (server-only) + `lib/audit/shared.ts` (pure — the filter bar is a
client component and cannot import the reader). Writing: `lib/audit/log.ts`, unchanged.

- Capability-gated on `view_audit_log`.
- Filtered, searched and **paged in Postgres**, not in the browser over a 20-row window. Filters
  live in the URL so a filtered view can be sent to a colleague, bookmarked, and read by the server
  component that runs the query.
- Categories are matched as an **action prefix** (`billing.`, `member.`, `workspace.`), so a new
  action lands in the right bucket without a migration. Keep writing dotted actions.
- **Exporting is itself audited** (`security.audit.export`). Taking a copy of the record of every
  change belongs in the record of every change. Capped at 5,000 rows with an
  `X-Denku-Export-Truncated` header rather than an unbounded dump.
- The actions now actually written: `billing.plan.change`, `billing.addon.increase|decrease`,
  `member.invite`, `member.invite.resend|revoke`, `member.role.change`, `member.remove`,
  `workspace.ownership.transfer`, `workspace.hours.update`, `workspace.notifications.update`,
  `security.password.change`, `security.password.reauth_failed`, `security.session.revoke`,
  `security.sessions.revoke_all`, `security.audit.export`.

**The hydration bug.** The list formatted timestamps with `Intl.DateTimeFormat` inside a component
that renders on both sides, so the server (UTC on Vercel) and the browser (the reader's zone)
produced different text and React tore the tree down on every direct load. Fixed by
`components/time/ClientTime.tsx`, which renders an explicit-UTC string until hydration and the
reader's own zone after — via `useSyncExternalStore`, not `useState` + a mount effect.
`suppressHydrationWarning` would have hidden the warning and kept the mismatch.

## Account security

- **Changing a password requires the current one.** `supabase.auth.updateUser({ password })` does
  not ask, so anyone reaching a signed-in tab could take the account. Verification signs in on a
  **throwaway client with `persistSession: false`** — doing it on the request's own client would
  rotate the session and rewrite the auth cookies mid-request. Failures are audited.
- **Sessions are listable and individually revocable**, through `list_my_sessions` /
  `revoke_my_session` (SECURITY DEFINER, filtered on `auth.uid()` inside the body — never on a
  caller-supplied parameter). The current session is labelled; without that, "Sign out" on a row is
  a coin flip about whether you are logging yourself out.
- **TOTP two-step verification** over Supabase Auth factors. Enrolment is not finished until a code
  verifies, and a half-made factor is discarded if the dialog is closed — otherwise the next attempt
  collides with a factor nobody can use. Turning it OFF asks for a code too, or a borrowed session
  could simply remove the protection it just ran into.

Per-**account**, not per-workspace. Enforcing MFA org-wide is a policy that needs a place to live
and an escape hatch for whoever it locks out; it is deliberately not claimed.

## Not built (say so, do not imply otherwise)

SSO/SAML, SCIM, domain verification, IP allowlists, session timeouts, customer-facing API keys,
outbound webhooks, data export/retention/workspace deletion, branding, verified email-address
changes, a separate dashboard UI language, multi-workspace switching, bulk invite.

## Rules for changing this

- **Add a capability to the matrix, not a string comparison to a route.** The bug was never a
  missing rule; it was a rule nobody invoked.
- **Any new route that spends money, changes membership, or reads the audit trail starts with
  `guard(...)`.** `test/workspace-permissions.test.ts` asserts the call sites, because a unit test
  of `roleCan` proves the rule exists and not that anyone asked.
- **Never let the last owner disappear.** Any new path that writes `profiles.role` or `org_id` goes
  through `assertNotLastOwner` first.
- **A `"use server"` file may only export async functions**, and everything it exports is a callable
  endpoint. A read that takes an `orgId` does not belong there (see
  `lib/notifications/prefs.server.ts` for why one was moved out).
