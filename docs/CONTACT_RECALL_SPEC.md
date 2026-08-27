# Contact Recall — Design Spec (R-139)

> **Status: SPEC ONLY. Not implemented.** Written before the code because the interesting part of
> this feature is not making the AI remember — it is deciding *who it is allowed to remember to*.
>
> **The rule this document exists to enforce:**
> **Nothing personal is disclosed to a caller until the platform has verified who they are — and
> the verification question must not itself contain the answer.**

Companion to [MEMORY_CONTRACT.md](MEMORY_CONTRACT.md) (R-110), which governs a *different* feature
and is also not implemented. Read §2 before assuming this document supersedes it. It does not.

---

## 1. The question this answers

> "If a customer already in our CRM calls from their known number, will the AI know the past
> conversation, or start from zero every time?"

Today the answer differs by channel, and the difference is not a decision anyone made:

| Channel | Does the AI know the history? | Why |
|---|---|---|
| **Telegram / chat** | **Yes, within the thread.** | `loadHistory` sends the last 20 turns on every message, and a chat is one durable thread per person. This is why "actually make it 4pm" worked — it knew which appointment. |
| **Voice** | **No. Every call starts blank.** | Each call is a new `calls` row; the assistant receives only the system prompt and business context. The lead is matched by phone *afterwards*, so the CRM joins up while the AI on the line knows nothing. |

Recall closes that gap for voice, and extends chat beyond a single thread.

## 2. Recall is not Memory

These are two features and they must not merge. The distinction decides whether a new store,
retention policy and erasure workflow are required.

| | **Recall** (this document) | **Memory** (R-110) |
|---|---|---|
| What it reads | Records the business **already holds** — a contact, their next appointment, their open ticket | Beliefs the AI **formed** about a person |
| Where it lives | Nowhere new. It is a query. | A dedicated store (`employee_memories`) |
| Correctness | Authoritative — it is the business's own data | *Believed*, may be wrong |
| On "delete this person" | Deleting the contact deletes the source; nothing else exists | A separate erasure path is **mandatory** |
| Accumulates over time | No | Yes |
| Needs the R-110 contract | **No** — properties 1–6 are about an accumulating store | **Yes, all ten** |

**Recall must never write.** The moment it stores a derived fact about a person — "prefers
mornings", "sounded unhappy" — it has become Memory and R-110 applies in full. If a future change
wants that, it is a different project with a different document.

Two R-110 properties *do* carry over, because they are about disclosure rather than storage:

- **Redaction before egress (R-110 §3.7).** What recall injects into a third-party model prompt is
  a disclosure to that provider. Inject the minimum that makes the AI useful, never the row.
- **Tenant isolation (R-110 §3.8).** `org_id` on every read. House rule, no exceptions.

## 3. The identity problem

Recall is only as safe as the claim "this is the person the record is about". That claim is
**strong on some channels and weak on others**, and the design follows the weakness:

| Channel | Identity | Strength | Verification needed? |
|---|---|---|---|
| Telegram | `from.id` — stable, account-owned, cannot be reassigned | **Strong** | **No.** Asking is like asking a person who unlocked the door with their own key to prove who they are. |
| Voice | caller ID | **Weak** | **Yes.** |
| Email (future) | address | Medium — owned, but forwarded and shared | Yes, for anything specific |
| WhatsApp (future) | phone number | Weak, same as voice | Yes |

**A phone number is not a person.** It is shared with a spouse, answered by a colleague, handed to
a child, and reassigned by carriers to strangers. Recall keyed on caller ID alone will eventually
read one customer's appointment to another human being. That is not a hypothetical: it is the
ordinary behaviour of phone numbers.

## 4. Why the obvious greeting is wrong

The natural first design is:

> **AI:** Welcome back — am I speaking with Jack?

**This leaks the answer in the question.** Whoever picked up now knows the number belongs to Jack,
before they have identified themselves and regardless of how they reply. On a shared or reassigned
line, the disclosure has already happened. A confirmation control that discloses what it is
protecting is not a control.

**Ask an open question instead:**

> **AI:** Hi, this is Denku. Who am I speaking with?
> **Caller:** Jack.
> → matches a contact on this number ⇒ recall unlocks
> **Caller:** Mehmet.
> → no match ⇒ nothing is disclosed, and this is treated as a new person

Same one extra turn, zero disclosure before verification. The AI usually asks for a name anyway,
so in practice this costs nothing at all.

## 5. Disclosure tiers

A name match is weak evidence — a caller can guess or be told a name. The door it opens must be
proportionate.

| Tier | Requires | May be used |
|---|---|---|
| **0 — Courtesy** | Nothing | Do not *ask* for what we already hold (name, phone). Discloses nothing to anyone. |
| **1 — Their own next step** | Name matches a contact on this identity | Greet by name; reference **their own upcoming appointment** and its time; know they have an open request, without its contents. |
| **2 — Never on an inbound cold contact** | — | Invoice amounts, payment details, past complaint contents, service/medical detail, anything about a *third* party. These belong in email or the portal, not read aloud to whoever is holding the phone. |

**Tier 2 has no unlock condition on purpose.** If a business needs it, that is a separate,
deliberate decision with its own authentication — not an extension of a name match.

## 6. The no-match branch, and the bug it fixes

When the stated name does not match, recall stays closed **and the conversation must not be
attached to the existing contact**.

This is not only a privacy rule. It is a defect that already exists today: on 2026-08-27 a test
caller said *"My name is Jack"*, and the appointment was linked to a lead named **Ali**, because
`create_appointment` finds-or-creates a lead by `(org_id, phone)` and never revisits the name.
"Jack" was written nowhere. That is sprint item **P3 — contacts have no names** in its most
concrete form.

So the identity step is also the fix for P3:

- **Name matches** → link to the existing contact, as today.
- **Name given, no match** → create a **new contact** carrying that name, sharing the phone
  identity. Two people using one phone is normal and the data model already allows it
  (`contact_identities` is per-channel, and a contact may exist without one).
- **No name given** → behave exactly as today. Never silently attach.

## 7. Where it plugs in

### Voice — a tool, not a prompt injection

The obvious implementation is to inject recall into the assistant's system prompt at call start.
**Do not do this**, for two reasons that happen to agree:

1. **It would require changing phone routing.** Per-call assistant configuration means Vapi's
   `assistant-request` event, which needs the phone number to carry a `serverUrl` *instead of* an
   `assistantId`. Landmine #6 in `CLAUDE.md` exists because routing has broken before, and the
   webhook has no `assistant-request` handler today.
2. **It would hand the model unverified personal data.** A prompt is delivered before the caller
   has said a word. The model would then be *asked* not to use it until verified — an instruction,
   not a control, and the one thing this document exists to prevent.

Instead: **a tool the assistant calls after asking who it is speaking with.**

```
identify_caller(name: string) → { known: boolean, greeting_name?, next_appointment?, has_open_request? }
```

- Lives beside `create_ticket` / `create_appointment` in `app/api/tools/`, same shared-secret
  header, same `x-vapi-call-id` for org + caller resolution.
- **The platform decides what to disclose; the assistant only relays** — the identical principle
  already written into `create-appointment` for the phone-number question ("the model cannot know
  whether we hold the caller's number... so the answer carries the instruction").
- A non-match returns `{ known: false }` and **nothing else**. The model cannot leak what it was
  never sent.
- Registered in `DENKU_TOOL_IDS` (`lib/vapi/assistantConfig.ts`) like the other two. ⚠️ Its
  definition lives in the Vapi account, not this repo — the contract belongs at the top of the
  route handler, because three bookings were lost to that pair drifting apart.

### Chat — the prompt, because identity is already strong

Telegram knows who it is talking to. Recall is added to `buildChatSystemPrompt` as a short factual
block beside the business context, resolved from the conversation's `contact_id`:

```
About this customer: Jack. Upcoming appointment: Tue 28 Aug, 4:00 PM. Has an open request with the team.
```

Tier 1 only. No verification turn. Same tier rules otherwise.

### Both — one resolver

`lib/platform/recall.ts`, channel-agnostic, org-scoped, never throws:

```ts
resolveRecall({ orgId, contactId?, phone?, statedName? }) → RecallFacts | null
```

Returns Tier-1 facts or `null`. It **reads only** — `contacts`, `appointments`, `tickets`. Any
call site wanting to write has left recall and entered R-110.

## 8. Out of scope (say no now, so it stays no)

- Storing anything the AI inferred about a person → **R-110**.
- Cross-org recall of any kind.
- Recalling a *third party's* data ("your wife's appointment is at 3") under any tier.
- Recall on an **outbound** call — that is a different consent question entirely.
- Using recall to skip a question the business is legally required to ask.

## 9. Definition of done

1. `resolveRecall` unit-tested pure-mapper-first, including: no contact, contact with no
   appointment, contact with a past-only appointment (must not be offered as upcoming).
2. `identify_caller` returns `{ known: false }` and no other field on a mismatch — **asserted by a
   test**, because this is the whole security property.
3. A live call where the caller gives the **wrong** name on a known number and the AI discloses
   nothing — verified from the transcript, not from the code.
4. A live call where the caller gives the right name and hears their own appointment time.
5. A Telegram conversation where recall appears with **no** verification turn.
6. A new contact is created for the mismatch case, with the stated name — closing P3.
7. `docs/IMPLEMENTATION_ROADMAP.md` updated; this document linked from
   `skills/platform-architecture.md`.
