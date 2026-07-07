# skills/ — Denku engineering deep-dives

Subsystem knowledge that would otherwise live in a senior engineer's head. Start with the repo
root's `CLAUDE.md` (stable memory) and `CURRENT_SPRINT.md` (the active sprint); come here before
touching a subsystem.

| Doc | Read before you… |
|---|---|
| [vapi-integration.md](vapi-integration.md) | touch assistants, phone numbers, the call webhook, tools, or the demo agent |
| [billing-and-stripe.md](billing-and-stripe.md) | touch plans, checkout, add-ons, overage, pause/resume, or month close |
| [onboarding-flow.md](onboarding-flow.md) | touch signup→live funnel, the step machine, or dashboard gating |
| [auth-and-tenancy.md](auth-and-tenancy.md) | add any endpoint or query — org-scoping rules and the two admin worlds live here |
| [database-schema.md](database-schema.md) | write SQL, add migrations, or reason about tables/RPCs (schema is NOT in the repo) |
| [dashboard-architecture.md](dashboard-architecture.md) | add/modify dashboard pages, shell, nav, or data fetching |
| [design-system.md](design-system.md) | style anything — four coexisting themes, per-surface rules |
| [deployment-and-environments.md](deployment-and-environments.md) | deploy, add env vars, configure Stripe/Vapi/Supabase/Resend externally |

Conventions for these docs:
- Describe the repo **as it is**, including bugs and debt (marked ⚠ or referenced to
  CURRENT_SPRINT.md) — never aspirational architecture.
- Cite real file paths so claims are verifiable.
- Update the relevant doc in the same change that alters the behavior it describes; stale
  documentation here is worse than none.
