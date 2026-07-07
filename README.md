# Denku

Denku is a self-serve **AI voice employee**: a business gets a provisioned US phone number answered
24/7 by an AI assistant, and every inbound call is turned into a real outcome — a ticket, an
appointment request, and a lead — that the business can see and act on.

> Brand is **"Denku"** (never "Denku AI"). The product is the *outcome*, not the AI.

## Where things live

- **The app** is in [`web/`](web/) — Next.js 16 (App Router, React 19, TS, Tailwind v4), deployed on
  Vercel. Run it with `cd web && npm run dev`; build with `npm run build`.
- The repo root also contains a **dead legacy MVP** under `src/` — never edit or import it.

## Start here (documentation system)

New contributor or AI session — read in this order:

1. **[CLAUDE.md](CLAUDE.md)** — canonical engineering memory: architecture, business rules,
   conventions, and landmines. Read first.
2. **[CURRENT_SPRINT.md](CURRENT_SPRINT.md)** — the active implementation sprint: what to build now.
3. **[docs/PROJECT_VISION.md](docs/PROJECT_VISION.md)** — the north star (what Denku believes) and
   **[docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md)** — operating principles (how we work).
4. **[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md)** — the master findings tracker
   (`R-###`), with **[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)** (how to act safely) and
   **[docs/RETROSPECTIVE.md](docs/RETROSPECTIVE.md)** (how much to trust each finding).
5. **[skills/](skills/README.md)** — subsystem deep-dives; read the relevant one before touching a
   subsystem.
6. **[docs/audits/](docs/audits/README.md)** + **[docs/AUDIT_PLAYBOOK.md](docs/AUDIT_PLAYBOOK.md)**
   — the audit narratives and the standard that governs them.

There are no tests or CI yet (only a billing-cron GitHub Action) — see the roadmap (`R-037`).
