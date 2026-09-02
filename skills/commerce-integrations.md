# Commerce integrations — reading a customer's e-commerce backend (IdeaSoft first)

> Read after [`platform-architecture.md`](platform-architecture.md) (Employee/Channel/Conversation)
> and [`telegram-integration.md`](telegram-integration.md) (the reply engine and its tool loop).
> This file covers a layer that is **not** a channel, and getting that distinction wrong is the
> single most expensive mistake available here.

**Status (2026-09-02): DESIGN ONLY — `adopted: false`, `productionReady: false`. Nothing in this
file is built.** There is no `lib/commerce/`, no `commerce_connections` table, no route. Every path
below is a proposal. This breaks the `skills/README.md` rule that these docs describe the repo as it
is, and it does so deliberately and temporarily: the design was worked out against the live API
documentation before the customer granted access, and losing it would mean deriving it twice. **The
moment the first line ships, rewrite this file in the past tense and mark what actually got built.**

Driver: a BYON customer (their own Netgsm line, see [[byon-netgsm-live]]) runs their store on
IdeaSoft and wants the AI to answer "where is my order" and "do you have this in stock".

Source of truth for the API: <https://apidoc.ideasoft.dev> — three projects (Admin API v3.2.0,
Store API, Webhooks). Support: `apisupport@ideasoft.com.tr`.

---

## 1. Why this is not a channel

The instinct is to add `"ideasoft"` to `Channel` in [`lib/platform/channels.ts`](../web/src/lib/platform/channels.ts).
That would be wrong, and the wrongness compounds.

A **channel** is a place where a customer talks to the business. IdeaSoft is not that. It is the
business's **system of record**. The customer messaging on Telegram at 23:40 has an order that lives
in IdeaSoft; the channel is Telegram, the *source* is IdeaSoft. Put it in the channel registry and
every surface that iterates channels — Channels page, Inbox filters, onboarding, usage metering,
`test/channel-contract.test.ts` — starts rendering a "channel" nobody can send a message to.

So this is a new first-class noun alongside Employee / Channel / Conversation / Contact:

> **Integration** — a per-org connection to an external system the AI may *read from* (and, one day,
> write to). Channels carry conversation. Integrations carry facts.

What it *does* copy from the channel work is the shape, because that shape is proven: per-tenant
encrypted credentials, a service-role-only table with RLS enabled and no policies, a provider
registry that makes the second provider cheap, and a connection-health story.

```
web/src/lib/commerce/
  registry.ts               provider lookup (ideasoft | ikas | ticimax | shopify …)
  types.ts                  CommerceOrder / CommerceProduct / CommerceCustomer — normalized
  connections.ts            per-org connection CRUD          (mirrors lib/telegram/connections.ts)
  tokens.ts                 single-flight refresh + lock
  providers/ideasoft/
    oauth.ts  http.ts  orders.ts  products.ts  webhooks.ts  map.ts
web/src/app/api/integrations/ideasoft/
  connect/route.ts          mint state, redirect to /panel/auth
  callback/route.ts         code -> tokens, store connection, subscribe webhooks
web/src/app/api/webhooks/ideasoft/[connectionId]/route.ts
```

**The tool layer must never see a provider name.** `lookupOrder(orgId, {...}) -> CommerceOrder`. When
İkas or Ticimax arrives, [`lib/platform/reply/tools.ts`](../web/src/lib/platform/reply/tools.ts)
does not change. Same O(1) rule as [`lib/platform/adapters/registry.ts`](../web/src/lib/platform/adapters/registry.ts):
a new provider is an adapter + a row in the registry, never a bolt-on.

## 2. The API in one screen

| | |
|---|---|
| **Admin API base** | `https://{shop}.myideasoft.com/admin-api/` — custom domains work too (`https://www.shop.com/admin-api/`) |
| **Store API base** | `https://{shop}.myideasoft.com/api/` — same OAuth, storefront resources (Cart, CartItem, QuickCart) |
| **Auth** | OAuth2 `authorization_code`. Authorize `GET {store}/panel/auth`, token `POST {store}/oauth/v2/token`. `Authorization: Bearer <token>` |
| **App registration** | The *store owner* creates it: admin panel → **Entegrasyonlar → API → Ekle**. Redirect URI must be pre-registered. |
| **Auth code TTL** | **30 seconds.** Exchange it immediately; never queue the callback. |
| **access_token** | 24 hours |
| **refresh_token** | 2 months — and **single-use**: every refresh returns a *new* pair and kills the old one |
| **Paging** | `page` (>= 1, default 1), `limit` (>= 1, **max 100**, default 20), `sinceId`, `sort=id` / `sort=-id` |
| **Filtering** | Per-resource query params plus `q[<param>]`. Orders: `startCreatedAt`/`endCreatedAt` (`yyyy-mm-dd`), `status`, `paymentStatus`, `customerFullname`, `productSku`, `member`, `ids=1,2,3` |
| **Rate limit** | **Unpublished.** 429 exists; the docs say the threshold "changes dynamically" and refuse to name a number |
| **Webhook auth** | header `X-Ideashop-Hmac-Sha256` = `base64(hmac_sha256(rawBody, client_secret))` |
| **Webhook payload** | **Changed fields only** — everything else must be re-fetched by `id` |
| **Webhook retries** | 10 s timeout per attempt; after N failures the **subscription is deleted** |
| **Resources** | ~175 on Admin API (Order, Product, Member, Category, Shipment, Coupon, ClientWebhook, …); ~75 on Store API |
| **SDK** | None. The docs offer a mock server; Postman works with the OAuth2 flow. |
| **Status codes** | Conventional. 422 = validation, 429 = too many requests, plus raw Cloudflare errors in front. |

Admin API vs Store API: **Phase 1 needs only the Admin API** (orders, products, members). The Store
API's Cart/QuickCart resources matter only if the AI is ever allowed to build a basket, which is far
past the write-access question in §9.

## 3. The five facts that shape everything

1. **The refresh token is single-use.** Two concurrent refreshes = one wins, the other's token is
   already dead, and the connection breaks entirely. Not theoretical: a webhook and a live chat will
   collide. → §5.
2. **A refresh token expires in 2 months of silence.** A store nobody messages for two months forces
   the owner through the whole authorization dance again. → §5, the cron.
3. **Webhooks are deltas, not data.** `order/update` tells you an order changed and gives you the
   changed fields. It is a *trigger*; the read still goes to the API. → §6.
4. **The webhook HMAC is keyed with `client_secret`, which belongs to the app, not the store.** It
   proves "IdeaSoft sent this". It does **not** say which store. → §6.
5. **There is no published rate limit.** Any design that assumes headroom is guessing. → §9.

## 4. Data model

One table, provider on the row:

```sql
create table if not exists public.commerce_connections (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null,
  provider                text not null,                    -- 'ideasoft'
  store_base_url          text not null,                    -- https origin only, normalized
  store_label             text,

  access_token_encrypted  text not null,
  refresh_token_encrypted text not null,
  access_expires_at       timestamptz not null,
  refresh_expires_at      timestamptz not null,             -- moves forward on every refresh
  granted_scope           text,                             -- what the token response GRANTED

  status                  text not null default 'connected',-- connected|degraded|revoked|error
  last_error              text,
  last_sync_at            timestamptz,
  refresh_lock_until      timestamptz,                      -- single-flight claim, see §5

  created_at              timestamptz not null default now(),
  unique (org_id, provider, store_base_url)
);
alter table public.commerce_connections enable row level security;  -- NO policies -> service-role only
```

Three columns are load-bearing and easy to talk yourself out of:

- **`granted_scope` stores what the token response returned, not what we asked for.** Instagram's
  **R-079** is exactly this bug (requested scopes persisted as if granted). Do not repeat it.
- **`refresh_lock_until`** is the whole of §5.
- **`store_base_url` is an SSRF surface.** We make server-side requests to a URL the customer typed.
  Enforce: `https` only, origin only (no path, no query, no credentials, no port games), reject
  `localhost`/`*.local`/private and link-local ranges, and re-check after DNS resolution. This is the
  same discipline that made [`lib/vapi/assistantConfig.ts`](../web/src/lib/vapi/assistantConfig.ts)
  refuse `localhost` and `VERCEL_URL` after R-077 put a dev-machine URL on live assistants.

Credentials use [`lib/crypto/secretBox.ts`](../web/src/lib/crypto/secretBox.ts) (AES-256-GCM,
`SECRET_ENCRYPTION_KEY`). **Refuse to store a connection when no key is configured** — a plaintext
fallback would be silent and wrong. Same rule Telegram enforces for bot tokens.

## 5. Token lifecycle — the most fragile part of this integration

Two mechanisms, both required.

**Single-flight refresh.** Claim before refreshing, with a conditional UPDATE:

```sql
update commerce_connections
   set refresh_lock_until = now() + interval '30 seconds'
 where id = $1
   and (refresh_lock_until is null or refresh_lock_until < now())
returning id;
```

No row returned means someone else is refreshing: wait briefly, re-read, use their token. This is the
same claim pattern as `sendOnce()` in [`lib/email/dispatch.ts`](../web/src/lib/email/dispatch.ts) and
the advisory-lock lease RPC in [`lib/concurrency/leases.ts`](../web/src/lib/concurrency/leases.ts).
Write the new pair **atomically**, and never discard the old one until the new one is confirmed.

**Proactive refresh cron.** Every ~20 hours, refresh every `connected` row. Without it, fact #2 above
bites: two quiet months and the customer is re-authorizing by hand. With it, the connection lives
indefinitely. Add it beside the existing billing cron in `.github/workflows/`, and make it idempotent
and resumable like every other cron here.

Failure ladder: `401` → refresh once → still `401` → `status='revoked'`, notify the owner (a
registered template in [`lib/email/previewSamples.ts`](../web/src/lib/email/previewSamples.ts), sent
through `sendOnce()`), and the AI's commerce tools disappear from the tool list. They must vanish
silently — an AI that offers to check an order and then cannot is worse than one that never offered.

## 6. Webhooks

The HMAC does not identify the store (fact #4). The fix is the one Telegram already uses:

```
POST /api/webhooks/ideasoft/{connectionId}
```

We write that URL into the subscription's `address`. **The connection id in the path is addressing,
not a credential**; authentication is the HMAC. That sentence is lifted verbatim from
[`telegram-integration.md`](telegram-integration.md) because the situation is identical.

Rules, each with a failure it prevents:

- **Read the raw body first.** `await req.text()` → verify `X-Ideashop-Hmac-Sha256` → *then*
  `JSON.parse`. Re-serializing to verify will drift on key order and float formatting. Landmine #11
  (Instagram) is the same rule.
- **Enforce from the first request.** IdeaSoft always signs, so there is no reason for the
  observe-only staging the Vapi webhook still sits in (landmine #1).
- **Always answer 200, fast.** Queue the work. The docs are explicit: enough failures and the
  **subscription is deleted**, silently, and the customer's integration simply stops.
- **Run a reconcile cron.** Daily `GET /admin-api/client_webhooks`, diff against the topics we expect,
  re-create what is missing. Not optional — see the line above. Mirrors
  `POST /api/internal/reconcile-vapi-assistants`.
- **Treat the payload as a trigger.** `order/update {id}` → `GET /admin-api/orders?id=X` → normalize.
  Never persist the delta as if it were the object.

Phase-1 topics: `order/create`, `order/update`, `product/update`, `member/update`. Available topics
and their v8 field sets are listed at <https://apidoc.ideasoft.dev/docs/webhooks/5cc9374300b99-webhooks>.

## 7. What the AI gets — and the identity problem

Three tools, appended to `CHAT_TOOL_DEFINITIONS` **only when the org has a healthy connection**, so a
workspace without one sees byte-for-byte the current behaviour:

| Tool | Answers | Reads |
|---|---|---|
| `lookup_order` | status, order date, carrier, tracking code | `GET /admin-api/orders` |
| `check_stock` | is it available, what does it cost | `GET /api/products?sku=` / `?name=` |
| `find_product` | search the catalogue | same |

**Now the part that needs a moment.** On Web Chat and Telegram the visitor is a stranger. If
`lookup_order` accepts "my email is X", then **anyone can read anyone's order** — name, address,
phone, amount, payment method. IdeaSoft's `customerEmail` filter makes that a one-line query. The
weak-identity problem is already acknowledged in this codebase: recall is suppressed on channels
where identity is too weak to trust (R-139).

Three layers, all required:

1. **Never act on a single claim.** Require an **order number *plus* one matching field** (email, or
   the last four digits of the phone). Expressible in one request via `q[]` filters.
2. **Redact by channel strength.** Anonymous channels get status, date, carrier, tracking code —
   nothing else. Address, full name, amount and payment details are released only where identity is
   strong (an Email-channel thread whose `From:` matches the order, per
   [`email-integration.md`](email-integration.md)).
3. **Cap the volume.** N lookups per session, **counted in the DB** — `lib/rateLimit.ts` is an
   in-memory Map and a no-op on Vercel (landmine #8). [`lib/webchat/sessions.ts`](../web/src/lib/webchat/sessions.ts)
   already does exactly this for the same reason.

**And never dead-end.** If IdeaSoft is down or the token is revoked, the tool returns a
model-readable "could not check right now" and the model falls through to `create_ticket`. The
existing `ToolOutcome.message` contract carries this already — the message is repeated to the
customer, so "could not check" and "no such order" must not read the same.

**Voice gets the same tools through a different door.** The domain functions are shared; the
transports are thin. Voice goes via `/api/tools/*` with `DENKU_TOOL_SECRET`, which means creating the
tool in Vapi and adding its id to `DENKU_TOOL_IDS` in
[`lib/vapi/assistantConfig.ts`](../web/src/lib/vapi/assistantConfig.ts) so `ensureAssistantConfig`
merges it into `model.toolIds`. **Do not hand-roll a `model` PATCH** — landmine #6.

## 8. Catalogue: what is cached, what is always live

One rule:

- **Text (name, description, category, specs) → synced locally, answered through RAG.**
  [`agent_knowledge_documents`](../supabase/migrations/20260902060000_agent_knowledge_documents.sql)
  already exists for this.
- **Price and stock → always live, 30–60 s TTL.**

Because **an embedding of a price is a lie.** Vectorise a price and three days later the AI quotes a
number nobody sells at, confidently, and nothing in the system notices.

**Do not mirror orders.** An IdeaSoft order carries name, address, phone and client IP — personal
data under KVKK, for a Turkish business, in a Turkish store. Store the *link*
(`external_order_id` on the contact or conversation), keep the body in a TTL cache, and let IdeaSoft
remain the system of record. Copying it makes us a data controller for something we do not need.

## 9. Failure, limits, and what stays out of scope

With no published limit (fact #5), the defence is in our code:

- Honour `Retry-After`; otherwise exponential backoff with jitter, **max 3 attempts**.
- Single-flight per cache key — two conversations asking about the same SKU is one request.
- **A total budget of ~3 s on the chat path.** Past it the tool answers "could not check". Making a
  customer wait is not worse than a wrong answer, but it is worse than an honest one.
- Cache invalidation comes from webhooks (`product/update`), not from guessing.

**Writes are out of scope**, and not merely unbuilt. Cancelling an order or changing its status is an
authorization question: a row in the capability matrix
([`lib/auth/permissions.ts`](../web/src/lib/auth/permissions.ts)), an explicit owner opt-in, and an
audit-log entry — never a tool the AI simply has. Ask the customer to grant the API app
**Katalog + Siparişler → read only** when they create it.

## 10. Phases

| Phase | Ships | Done when |
|---|---|---|
| **0 · Connection** | OAuth connect/callback, `commerce_connections`, refresh + lock + cron, an Integrations card in Settings | A token is still valid 48 h later with no human touch |
| **1 · Read + tools** | `lookup_order`, `check_stock`, `find_product`; identity rules; volume caps. Web Chat first, then Telegram, then voice | A real customer gets a real tracking code, and a wrong email gets nothing |
| **2 · Webhooks** | `/api/webhooks/ideasoft/[connectionId]`, HMAC, reconcile cron. Unlocks proactive "your order shipped" | A subscription survives a week, and a deliberate outage is repaired by the cron |
| **3 · Catalogue sync** | Nightly full sync + webhook deltas into RAG | The AI answers a product question with no live call |

Phase 0 is worth shipping alone, and Phases 0–1 can be **built and tested against the documented
mock server before the customer grants anything**.

## 11. Open questions — verify before promising a date

1. **Is `client_id`/`client_secret` per store, or one pair for our app across all stores?** The docs
   describe the *store owner* creating the app in their own panel, which reads as **per store** —
   materially different from Shopify's single-app model, and it changes onboarding: we would have to
   ask every customer for a client id and secret rather than shipping one integration. **This is the
   most important unknown in the file.**
2. **Does the webhook payload carry a store identifier?** The design above does not depend on it
   (the id is in the path), but it would be a cheap second check. Unknowable without a real delivery.
3. **The real 429 threshold.** Only measurable against a live store.
4. **The customer's IdeaSoft version.** The docs carry v8 seams — `fields` removed from webhooks,
   Store API v1 auth (`/admin/user/auth`) withdrawn. Confirm before writing against either.

## 12. Adding a second provider

The whole point of §1. To add İkas / Ticimax / Shopify:

1. `lib/commerce/providers/<name>/` implementing the same interface as `ideasoft/`.
2. One line in `lib/commerce/registry.ts`.
3. A row in the provider metadata (label, icon, connection method) — the way
   [`lib/platform/channels.ts`](../web/src/lib/platform/channels.ts) holds channel metadata so no UI
   file needs editing.

`reply/tools.ts`, the Inbox, the prompt and the cron must not change. If a change to one of them is
needed, the normalization in `types.ts` is wrong — fix it there.
