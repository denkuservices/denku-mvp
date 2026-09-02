# Denku's own agent — the one that sells Denku

> Built 2026-09-03. The assistant a visitor meets on denku.io: on the phone through the landing
> page's call button, and in the chat widget in the corner. It is **not** a marketing chatbot —
> it is Denku running as a customer of Denku, so every improvement to the product improves it and
> every regression in the product shows up here first.

## The problem it was built for

The landing page assistant's system prompt was typed by hand into Vapi and had gone stale where
nobody could see it. Pulled live on 2026-09-03, all 1,883 characters:

- It said **"English and Spanish"** while the product shipped four languages.
- It had never heard of Telegram, Email, Web Chat, BYON, the commerce integration, AI Audit,
  AI Studio or Custom AI — three of the four things Denku sells.
- It was not Denku's assistant at all. It was `155b21ad…`, "Denku Inbound MVP", a **customer**
  prompt template filled in as though Denku were a client called "Pilot Client" — while also
  answering a real phone line (+13213369681).

A prospect was being told a smaller product than the one they could buy. The same mechanism could
just as easily have told them a bigger one.

## The rule everything follows

**Nothing about availability is typed. It is derived.**

`lib/denku-agent/facts.ts` renders what the assistant may claim from the registries that already
decide it — `CHANNELS[...].productionReady`, `LANGUAGES`, and the billing catalogue rows. The day
WhatsApp flips to production-ready the assistant starts offering it, in the same commit, with no
prompt for anyone to remember to edit. Until that day it cannot promise it, however the question
is phrased.

The registry draws a three-way distinction, and **collapsing it is how a demo becomes a refund**:

| Flag | Meaning | What the assistant says |
|---|---|---|
| `productionReady && outbound` | Safe to sell | "The AI answers on…" |
| `adopted` only | Connectable; messages arrive; AI stays silent | "…but the AI does NOT reply there yet" |
| neither | Not built | "Not built yet — do not promise these" |

`channelSentence()` renders all three as **separate clauses** on purpose. One list would let the
model flatten them into a single claim.

## The three layers

```
corePrompt.ts   ~890 tokens, every turn      who it is, prices, availability, honesty rules
corpus.ts       22 chunks, on demand         the answers, fetched one at a time
search.ts       the model picks by topic id  no embedding index, multilingual for free
```

**Why not put everything in the prompt.** Cost is the second reason, and a small one: measured,
the whole corpus on every turn costs $0.06–0.16 more per call, which is about a dollar a month at
current volume. The first reason is accuracy — a model holding forty facts at once blends them,
and answers "yes, WhatsApp" because WhatsApp appeared in a list near the word "channels". The
cheaper design and the more truthful one happen to be the same design.

**Why no embeddings.** The model does the retrieval: the tool takes a `topic` from an enum of
chunk ids and the model, which has already read the question in whatever language it was asked,
picks one. The corpus is small enough to enumerate, so an index would be infrastructure protecting
nothing; it is multilingual for free, because "kendi numaramı bağlayabilir miyim" reaches
`bring-your-own-number` through the MODEL rather than through a Turkish keyword that happens to be
in an English tag list; nothing has to be rebuilt on deploy; and every possible answer is
enumerable in a test.

There is a keyword fallback for when the model passes free text anyway (models do). It is
**approximate on purpose** and returns several candidates — keyword matching genuinely cannot
separate "can I use my own phone number" from the chunk about the number Denku provides, because
the intent lives entirely in the word "own". A test pins that case as a tie rather than pretending
to resolve it.

## Hard rules

1. **`skills/*.md` must NEVER be fed to this assistant.** These files are engineering memory:
   security landmines, unfixed bugs, honest `productionReady: false` admissions. A prospect asking
   "is it secure?" getting landmine #1 read back to them is the failure the warning in
   `corpus.ts` exists to prevent. Anything true and sellable is RESTATED there in customer words.
2. **No certification claims.** No SOC 2, no HIPAA, no ISO. Denku holds none. The marketing site
   already had those claims removed once.
3. **`search_denku_knowledge` is NOT in `DENKU_TOOL_IDS`.** That list is merged into EVERY
   assistant by `ensureAssistantConfig`. Adding it there would hand a plumber's AI the ability to
   quote Denku's pricing to the plumber's callers. A test pins the list length so this fails loudly.
4. **`isDenkuSelfOrg` is an identity, `orgs.is_internal` is an entitlement.** The first names the
   single workspace that IS Denku; the second marks workspaces Denku OPERATES (this one, and any
   future demo or partner workspace) and grants chat capacity. Merging them would give every future
   demo workspace a sales assistant.
5. **The voice route answers without an org, and that is deliberate.** Every other tool route
   refuses when it cannot resolve a workspace, because it is about to read that workspace's data.
   This one reads nothing tenant-scoped, and its caller is an anonymous visitor in the first ten
   seconds of a call, before any `calls` row exists. It still refuses an org that resolves to
   someone else — that is a mis-attachment, not a visitor.

## The pieces

| Thing | Where |
|---|---|
| Derived facts | `lib/denku-agent/facts.ts` |
| The corpus (22 chunks) | `lib/denku-agent/corpus.ts` |
| Retrieval | `lib/denku-agent/search.ts` |
| Always-on prompt | `lib/denku-agent/corePrompt.ts` |
| Tool definition + executor | `lib/denku-agent/tools.ts` |
| Voice transport | `app/api/tools/search-denku/route.ts` |
| Chat transport | `lib/platform/reply/tools.ts` (gated by `isDenkuSelfOrg`) |
| Widget on the site | `components/marketing/DenkuChatWidget.tsx` |

**Vapi artifacts** (created by script, never by hand):

- assistant `a7846579-78b9-451a-8821-2c5764a3fc6f` — "Denku — own assistant"
- tool `130b835d-69e0-49ca-a085-7943870692e3` — `search_denku_knowledge`

**Production rows** (created by script, idempotent):

- org `286b7738-85e5-4d66-a08f-4d87f4f8f30c` (`is_internal = true`)
- employee `49143290-dd6a-4ec1-a80c-a404725dae15`
- Web Chat connection, allowlist `denku.io` + `www.denku.io`, channel `web` active

## Maintaining it

```bash
cd web && npx vite-node --config vitest.config.ts scripts/register-denku-agent.mts
```

Re-run this after a channel flips, a price changes, or a corpus edit — the assistant's system
prompt is a **snapshot** generated at registration time. (The live prices always reach the
assistant through the tool at call time, which reads the catalogue itself, so if the two ever
disagree the tool wins. That is the right way round.) It matches by name and PATCHes, so it is
idempotent, and it refuses a localhost URL because R-077 was exactly that mistake made once.

```bash
cd web && npx vite-node --config vitest.config.ts scripts/provision-denku-workspace.mts --dry-run
```

Repairs or recreates the workspace. It never writes a `profiles` row — see Known gaps for why access
is an UPDATE of an existing row rather than a new one.

## Known gaps

- ~~Nobody can open Denku's Inbox.~~ **Resolved 2026-09-03**: the owner's profile was MOVED here
  with `update profiles set org_id = …`. Their previous workspace, `test2 llc`, was empty — 0
  agents, 0 conversations, 0 calls, no plan — so it cost nothing, and it is reversed by setting
  `org_id` back.

  **It had to be an UPDATE, not an INSERT, and that is the part worth keeping.** A second
  `profiles` row would split the two resolvers: `getViewer()` (authorization) matches on `id`
  FIRST, and the existing row has `id = auth_user_id`, so it would keep finding the OLD workspace
  — while `getActiveOrgId()` matches on `auth_user_id` ordered by `updated_at` and would find the
  new one. The dashboard would show one workspace while capability checks ran against another:
  exactly the divergence CLAUDE.md landmine #16 describes. One profile row per user, until a real
  workspace switcher exists.
- **`VAPI_AGENT_ID` is gone** — dead in code and deleted from Vercel on 2026-09-03. It held
  `155b21ad…`. It was renamed rather than reused precisely because reading it would have made
  repointing the landing page a silent no-op in production. Do not reintroduce the name.
- **The corpus is English-only** and the model translates at speaking time. Deliberate: a
  technical claim ("your carrier must give us an IPv4 address") mistranslated into a wrong promise
  is worse than an accent. The marketing-derived facts are already localised at their source.
