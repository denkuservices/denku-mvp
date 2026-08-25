# 16 — Denku Dashboard / Product UI Blueprint

## 1. The verdict: KEEP the Phase-2 IA. Do not rebuild.

The current branch (Sprints 9–14, 2026-08-24/25) already implements the correct product
architecture: **Home / Inbox / CRM / AI Team** with channels absorbed into their owners,
Requests unified, analytics with evidence, settings on the platform design track. This matches
or beats every SMB competitor pattern surveyed (Podium's inbox, GHL's chaos, receptionist tools'
non-existent memory) and implements the Intercom/HubSpot/Agentforce patterns the
REDESIGN_PROPOSAL already vetted. **A from-scratch dashboard rebuild would be self-harm.**
The 2.0 dashboard work is: *flip it on, finish its gaps, and align its skin with the new brand.*

## 2. Final IA (7 items, one noun each)

```
Home        outcome-first: Needs attention → Today → What your AI team accomplished (savings)
Inbox       all conversations, all channels · human takeover · context rail (contact) 
CRM         Contacts (timeline · lifecycle · notes · AI summary) · Requests · [Bookings when R-020]
AI Team     roster with outcomes · employee detail (Overview/Setup/Knowledge/Channels/History/Analytics)
Analytics   ranges · comparison · rhythm · export
Billing     plans · usage · packs · invoices (the honesty surface)
Settings    workspace · account · integrations (control center, already rebuilt)
```

## 3. Gap work per surface (the only dashboard code in 2.0)

| Surface | Exists | 2.0 additions |
|---|---|---|
| Home | outcome layer, attention, first-run | weekly digest email parity; "this week vs hiring cost" framing |
| Inbox | takeover, context rail, filters, truthful counts | SMS thread renderer (new channel); web-chat renderer; snooze/assign lite |
| CRM | timeline, lifecycle, notes | AI contact summary (one LLM call, cached); pipeline board + outcome-based scoring (P2) |
| Requests→Bookings | unified detail | calendar-backed **Booking** artifact (R-020): connect Google Calendar, real slot writes, reschedule flows |
| AI Team | roster, 6-tab detail, manifests | template picker ("hire another employee"); manifest history UI (data exists, no UI); test-call button per employee |
| Analytics | ranges/compare/export | cost-per-outcome metric; audit-report tie-in |
| Billing | enforcement real | explainable invoice (F-007): the worked-example math block; one-click packs |
| Onboarding | re-narrated as hiring (branch) | audit-prefill (AI Audit seeds business context); name-your-employee step; loading/error states (F-005) |
| Settings | control center, single track | nothing new — freeze |

## 4. Experience principles (carry-forward, now brand law)

1. **Truthful counts everywhere** (R-018) — no fabricated totals, "N+" when bounded.
2. **Never dead-end** extends to UI: every empty state = what it is · why empty · one action.
3. **Two planes never merge**: AI Team edits (control) always show manifest versioning; Inbox/CRM
   (data) never expose configuration.
4. **The employee is visible working**: Home and AI Team lead with outcomes, not activity charts.
5. **Honest limitations in-UI**: channels that can't reply yet say so on the card.

## 5. Design-language alignment (with doc 17)

- The dashboard keeps its Horizon-derived structure but adopts the 2.0 token layer (colors,
  type, radius, spacing) so marketing→onboarding→dashboard is one continuous brand. This is a
  re-skin pass (tokens + the remaining zinc removals), NOT a component rewrite.
- Dark mode ships as the default *brand* look (marketing is dark; the dashboard's light mode
  remains available — SMB owners work in daylight).

## 6. What NOT to do

- No new nav items for new features (SMS lives in Inbox/Channels; audit lives in onboarding +
  marketing). Seven items is the ceiling.
- No CRM feature-race with HubSpot (no deals/companies/tasks-for-humans until R-113 evidence).
- No billing-page rewrite (R-131 stands; add the explainer block only).
- No admin-surface exposure in the customer bundle (Creato's mistake, doc 08).
