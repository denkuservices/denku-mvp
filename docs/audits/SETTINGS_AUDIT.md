# Settings Audit — control center, or CRUD panel?

> Every Settings page audited individually, 2026-07-25. Findings are `S-###`.
> **Standard applied:** would this look natural inside Linear / Stripe / Vercel / Notion / OpenAI?

---

## 0. The verdict

Settings is **not a control center**. It is a filing cabinet organised by *which team built what*,
rendered in a palette that belongs to no other part of the product. Measured:

| Symptom | Evidence |
|---|---|
| **A fourth design system** | **529** `zinc-*` class references. The dashboard is Horizon (`navy`/`brand`/`gray`), marketing is the warm brand palette, shadcn uses oklch tokens — Settings is `zinc`. It looks like a different application. |
| **No navigation** | **No sidebar, no tabs, no nav component of any kind.** To go from Billing to Members you must navigate *back to the settings index*. Every mature SaaS has a persistent settings nav. |
| **Inconsistent chrome inside Settings** | `account/profile` and `account/security` don't use `SettingsShell` at all — different header, different breadcrumbs, from the rest of Settings. |
| **The index advertises pages that don't exist** | The landing lists sub-items `"Invoices"`, `"Payment methods"`, `"Limits"`, `"Overages"`, `"Behavior"`, `"Advanced"` as if they were destinations. They are **plain text** — several have no page at all. |
| **Dead directories** | `add-ons/`, `business-hours/`, `notifications/` — no `page.tsx`. |
| **One page is 1,432 lines** | `workspace/billing` — a monolith. |
| **Four "agent" surfaces** | `/dashboard/agents`, `settings/agents`, `settings/agents/[id]`, `settings/agents/[id]/advanced` (+ the platform `/employees`). |

---

## 1. Page-by-page

| Page | What works | What doesn't | Sev | Recommendation |
|---|---|---|---|---|
| **`settings` (index)** | Card grid is scannable | Sub-items are **fake links** (plain text, some with no page). Groups mirror the org chart, not the product. No nav. | **High** | **Rebuild as a control center** grouped by the platform model, every item a real destination |
| **`account/profile`** | Real, working form | Doesn't use `SettingsShell` → foreign chrome inside Settings | Med | Adopt the shared shell |
| **`account/security`** | Real (password change) | Same chrome break; 45 lines, no MFA/session surface | Med | Adopt shell; MFA later |
| **`agents`** | Lists real agents | **One of four** agent surfaces; "Behavior"/"Advanced" advertised but not links | **High** | Fold into **AI Employees**; single entry point |
| **`agents/[agentId]`** | The real config (business context, voice, language) — genuinely valuable | Buried three levels deep; the most important page in Settings is the hardest to reach | **High** | Promote to the primary Employee surface |
| **`agents/[agentId]/advanced`** | Honest "power user" separation | A third agent level; prompt override belongs *inside* the employee page, progressively disclosed | Med | Merge as a disclosed section |
| **`integrations`** | Honest "Coming soon" badges | **Both cards are fake** (CRM, Calendar). A settings page whose entire content is unbuilt | Med | Keep, but state plainly; wire Calendar when R-020 lands |
| **`workspace/general`** | Real workspace identity | Naming: "Workspace" vs "Organization" vs "Account" used interchangeably | Med | Rename group **Organization** |
| **`workspace/members`** | Real; invites fixed in Sprint 6 | Buried under "Workspace"; no roles UI | Med | Surface as **Team** |
| **`workspace/audit`** | Genuine audit log — an enterprise asset | Hidden three levels deep | Low | Keep under Organization |
| **`workspace/billing`** | Real Stripe integration | **1,432 lines**; plan + payment + invoices + add-ons in one scroll | **High** | Out of scope to rewrite now; must be reachable in one click |
| **`workspace/usage`** | Real usage data | **Not a separate concept from Billing.** Duplicated by a top-level nav item that is a bare `redirect()` | **High** | Merge into **Billing & Usage** |

---

## 2. Findings

- **S-001 (High)** — **No settings navigation.** The single biggest usability defect; every section
  switch is a round trip through the index. → **R-128**
- **S-002 (High)** — **Fourth design system (529 `zinc-*`)**; Settings looks foreign to the dashboard
  it lives in, and dark-mode coverage is thin for its size. → **R-129**
- **S-003 (High)** — **Index advertises non-existent destinations** (fake sub-items). Actively
  misleading; a discoverability failure disguised as information. → **R-130**
- **S-004 (High)** — **IA mirrors the org chart, not the product.** There is no home for Channels,
  Knowledge, or Automations, so WhatsApp/Telegram/Email settings have nowhere natural to land. → **R-094**
- **S-005 (Medium)** — **Chrome inconsistency inside Settings** (`account/*` bypasses the shell). → R-129
- **S-006 (Low)** — **Dead directories** (`add-ons`, `business-hours`, `notifications`). → R-119

---

## 3. The redesign — Settings as a control center

**Principle: group by what the customer manages, not by which table it lives in.**

```
AI Employees   → the workforce: brain, personality, knowledge, voice, channels   (absorbs all agent pages)
Channels       → per-channel connections + config   (WhatsApp/Telegram/Email land here automatically)
Organization   → workspace identity · team · audit log
Billing & Usage→ plan, payment, invoices, usage, limits   (Usage is not a separate concept)
Account        → your profile · your security          (personal, not org)
Integrations   → calendar, CRM — honestly labelled
```

Six groups instead of five arbitrary ones, each a **real** destination, with a **persistent sidebar**
so switching sections costs one click. Future channels need **no new settings section** — they appear
under Channels via the Sprint 7 registry.

### Scalability check (the point of the exercise)
| Future need | Where it lands | New page needed? |
|---|---|---|
| WhatsApp connection settings | Channels | **No** |
| Telegram bot token | Channels | **No** |
| Email mailbox | Channels | **No** |
| Shared knowledge (R-109) | AI Employees → Knowledge | No (new section, planned) |
| Automations (R-106) | new top-level group | Yes, by design |
| SSO / roles (enterprise) | Organization → Security | Yes, by design |

---

## 4. Implementation decision (and what I deliberately won't do)

**Will do now** — highest value, lowest regression risk, all behind `PLATFORM_UX_ENABLED`:
1. **Persistent settings navigation** via a `settings/layout.tsx` — one file gives *every* settings
   page a sidebar. Legacy rendering untouched when the flag is off.
2. **Rebuild the settings index** as a control center: six groups, every item a real link, live status
   (employee count, connected channels, plan) instead of decorative text.
3. **Remove the fake sub-items** — an index must not advertise destinations that don't exist.
4. **Delete the three dead directories.**
5. **Honest Integrations** — state clearly that nothing is connected yet.

**Won't do now, deliberately:**
- **Rewriting `workspace/billing` (1,432 lines).** High regression risk on the money path for
  cosmetic gain. Reachable in one click is enough for now. → R-131
- **Re-skinning all 11 pages off `zinc`.** Mechanical, large, and better done once, after the
  structure settles. → R-129
- **Merging the agent pages into `/employees`.** Correct destination, but it touches live
  configuration that drives real assistants — it deserves its own change with tests. → R-094 (remainder)

This keeps the sprint honest: **structure and navigation now; pixel-level re-skin and the billing
monolith tracked, not rushed.**
