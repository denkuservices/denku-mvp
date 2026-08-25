# Product UI Skeleton — the dashboard, decided

> Written 2026-08-25 after reviewing the live product against the reference set in
> `docs/example_screenshots/` (Creato's Ikasagent inbox + their 5-step onboarding). This is the
> **structural decision record**: what the navigation is, what lives under each item, where a
> customer does each job, and how future channels arrive without a new nav item.
> Visual direction: `docs/denku-2.0/17-denku-visual-system.md`. Dashboard verdict: doc 16.

## 0. The honest diagnosis

**The information architecture is not the problem. The surface treatment is.**

Sprints 9–14 landed the right skeleton — Home / Inbox / Customers / AI Team, channels absorbed,
requests unified, one door per thing. Held against the reference screenshots, what is actually
wrong is narrower and more fixable than "the dashboard is a mess":

| # | What's wrong | Evidence |
|---|---|---|
| 1 | **Everything is text at one weight.** No avatars, no channel badges, no status pills. A contact row is two grey strings; Creato's is an avatar, a name, a channel icon, a snippet and an unread count | `/dashboard/crm/contacts` vs `dashboard_ornek_image.PNG` |
| 2 | **No visual language for state.** Creato shows `● AKTİF` pills and a button that becomes "Bağlantı Aktif". We print sentences | `onboarding_1.1.png` |
| 3 | **Density is wrong.** Reference screens breathe: one decision per view, big whitespace. Ours stack a title, a subtitle, a search row, a count row and a list before any content | live `/dashboard/crm/contacts` |
| 4 | **Settings is 9 flat pages** behind an index — the single worst surface | route inventory |
| 5 | **The shell is a template, not a brand.** "DENKU **MVP**" in uppercase Poppins | `SidebarAdapter.tsx` (fixed) |
| 6 | Concrete defects: search icon under the placeholder; verification emails linking to `denku-mvp.vercel.app` | fixed, see §5 |

**So: do not rebuild the IA. Rebuild the surface.** A from-scratch dashboard would repeat the
mistake doc 16 already warned against and cost weeks we do not have.

## 1. Navigation — 6 items become 5

| Today | Decision |
|---|---|
| Home | **Keep** |
| Inbox | **Keep** — this is the product's centre of gravity |
| Customers | **Keep** |
| AI Team | **Keep** |
| **Analytics** | **FOLD into Home** as a second tab |
| Settings | **Keep**, rebuilt (§4) |

**Why Analytics goes.** A business with one AI employee does not need a second dashboard. Home
already leads with outcomes; Analytics repeats the same numbers one click away, which is why it
reads as clutter. Folding it to a tab keeps every capability Sprint 12 restored — ranges,
comparison, hourly rhythm, CSV export — while the nav stops offering two answers to one question.

**This is a relocation, not a removal.** Sprint 12's lesson (a "cleanup" that silently dropped
capability is a regression) applies: the tab must ship with ranges, compare and export intact, and
`/dashboard/analytics` must redirect to `/dashboard?tab=analytics`.

## 2. What lives under each item

```
Home                /dashboard
  ├ tab: Today       — needs attention → today → what your AI team did (outcomes, savings)
  └ tab: Analytics   — ranges · period comparison · hourly rhythm · CSV export

Inbox               /dashboard/inbox
  ├ channel chips    — All · Phone · Instagram   (+ SMS · Email · WhatsApp as they ship)
  └ /inbox/:id       — 3 panes: list | thread | context rail
                       (contact, call recording + cost, artifacts created, takeover)

Customers           /dashboard/crm
  ├ tab: Contacts    — /crm/contacts/:id → timeline · lifecycle · notes
  └ tab: Requests    — /crm/requests/:id → one detail for tickets AND appointments

AI Team             /dashboard/team
  ├ roster           — employee cards (name, role, on-shift pulse, this-week outcomes)
  └ /team/:id        — Overview · Setup · Knowledge · Channels · Activity · History
                       └ Channels tab = where a customer connects/activates. See §3.

Settings            /dashboard/settings
  └ 4 tabs           — Workspace · Billing · Channels · Account   (was 9 pages, §4)
```

## 3. The four questions this answers

**"Where do I activate my AI employee?"**
→ **AI Team → the employee → Channels tab.** One place. Today activation is split between
onboarding, `/dashboard/channels`, and the employee's Channels tab — three doors to one job.
`/dashboard/channels` stays as the configuration surface reachable from Settings, but the *verb*
("connect a number", "connect Instagram") lives on the employee, because that is the thing being
given a channel. Follow the reference: a card per channel, brand icon, one primary button, and the
button becomes a **state** once connected (`● Active`), not a repeated call to action.

**"Where do I see call details?"**
→ **Inbox → the conversation.** Already correct as of Sprint 13: the recording and cost render in
the conversation's own context rail, so hearing a call no longer means leaving the thread. There is
no separate Calls page and there should not be one — *a call is a conversation*.

**"Where do I see how my AI is performing?"**
→ **Home → Analytics tab** for the business. **AI Team → employee → Overview** for one employee.
The employee detail has six tabs and no performance surface today; Overview gains a compact
outcome strip (answered · booked · resolved · captured, this week vs last).

**"When Instagram / email / Telegram / WhatsApp arrive, where do I see everything at once?"**
→ **The Inbox, with channel chips** — exactly the reference layout. This needs no new nav item and
no new page, because the architecture was built for it: `conversations` is channel-agnostic
(Sprint 4.5) and the renderer registry (Sprint 7) already dispatches per channel. **A new channel
must add a chip and a renderer — never a nav item.** That rule is what keeps the product from
becoming the folder tree it was before Sprint 11.

## 4. Settings — rebuild, 9 pages → 4 tabs

Current: `account/profile`, `account/security`, `integrations`, `workspace/general`,
`workspace/members`, `workspace/billing`, `workspace/usage`, `workspace/audit`, `agents*`
(redirects). An index page that lists nine destinations is a filing cabinet, not a control centre.

| Tab | Absorbs | Notes |
|---|---|---|
| **Workspace** | general + members + audit | Name, timezone, team members, activity log as one scrollable page with sections |
| **Billing** | billing + usage | Usage *is* a billing question. Plan, current usage against the cap, invoices, packs. The honest-billing explainer lives here |
| **Channels** | phone numbers + Instagram | The configuration mirror of the employee's Channels tab |
| **Account** | profile + security | Personal, not workspace — the one thing that isn't org-scoped |

`integrations` does not return until one integration is real (Sprint 9 already pulled it from nav
for advertising two disabled cards). Every retired URL redirects — that rule has held for six
sprints and holds here.

## 5. Fixed already (2026-08-25)

- **Search icon under the placeholder.** Root cause: `CONTROL_CLASS` carried `px-3` and `SearchField`
  tried to beat it with `pl-9`. In Tailwind v4 `px-*` is the `padding-inline` shorthand and `pl-*` is
  `padding-inline-start` — which wins depends on stylesheet order, not class order. Padding is now
  *composed* (`CONTROL_BASE` + per-control padding) instead of overridden, so it cannot recur.
  Sprint 9 attributed this to `CommandInput` geometry and shipped unverified; that was the wrong file.
- **"DENKU MVP"** in the sidebar → `SITE_NAME`.
- **Verification and password-reset emails linked to `https://denku-mvp.vercel.app`** — hardcoded in
  `sendVerifyEmail.ts` and `templates.ts`. Every email a real customer received pointed at the build
  host instead of denku.io. Now resolved from `NEXT_PUBLIC_SITE_URL`. Same defect class as R-077.
- Still to do before a customer reads them: `/privacy` and `/terms` open with *"This is an MVP
  policy page"*.

## 6. Sequence

**Phase 1 — before the first customer (hours).** Done or trivial: branding, search, email URLs,
the MVP legal copy. No re-theme, no restructure. The goal is that nothing *embarrasses* us.

**Phase 2 — the density pass (1–2 days).** The five surfaces a customer actually touches, in this
order: Inbox → Customers → AI Team → Home → onboarding. Per surface: avatars and channel badges on
every row, status as a pill not a sentence, one H1 and no subtitle-paragraph, whitespace doubled,
counts as quiet metadata. **No new features.**

**Phase 3 — Settings 9 → 4 (2–3 days).** The one genuine rebuild. Contract-tested like Sprint 14
(every retired href must resolve).

**Phase 4 — the visual system (later).** Tokens, the Employee Card, the Thread motif — doc 17.
This is the 2.0 brand work and should not be rushed into a launch week.

## 7. What we are NOT doing

- **Not buying a theme or template.** The repo already carries four design dialects (marketing
  luxury · Horizon · shadcn · zinc — Sprint 14 killed the fourth). A purchased theme becomes the
  fifth, and the problem is not a shortage of components: it is that the ones we have are applied
  without density, hierarchy or state. A theme would hide that for a week and entrench it for a year.
- **Not rebuilding the dashboard from scratch** (doc 16: "a from-scratch rebuild would be self-harm").
- **Not adding features.** Apple-simple means fewer, finished surfaces — not more of them.
