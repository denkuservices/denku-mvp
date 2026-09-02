import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Chat entitlement gates money: it decides whether the AI answers on a channel the customer
 * may not have paid for. Every case below is one the product will actually meet — a workspace
 * that never bought chat, one mid-downgrade, one whose tables do not exist yet — and the rule
 * throughout is that anything unclear resolves to "do not answer".
 */

type Row = Record<string, unknown>;
let addonRows: Row[] = [];
let addonError: unknown = null;
let activeRows: Row[] = [];
let activeError: unknown = null;
let upserted: string[] = [];
let upsertFails = false;
/** Rows written to `billing_org_addons`, in order, by `recordChatPurchase`. */
let addonWrites: Row[] = [];
let addonUpsertFails = false;
/** Chat tiers cleared before a purchase is recorded — the one-plan-at-a-time rule. */
let clearedKeys: string[] = [];

/** Is the workspace under test Denku-operated? Drives the `orgs.is_internal` read. */
let isInternal = false;
/** Simulates the `orgs` read failing — must resolve to "not internal", never to "allow". */
let orgError: unknown = null;

/** Minimal stand-in for the query builder, matching only the calls the module makes. */
function builderFor(table: string) {
  const result =
    table === "billing_org_addons"
      ? { data: addonRows, error: addonError }
      : table === "orgs"
        ? { data: orgError ? null : { is_internal: isInternal }, error: orgError }
        : { data: activeRows, error: activeError };

  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  // `recordChatPurchase` clears the other tier with .update().eq().in()
  chain.update = self;
  chain.in = (_col: string, keys: string[]) => {
    clearedKeys.push(...keys);
    return Promise.resolve({ error: null });
  };
  chain.upsert = (row: Row) => {
    if (table === "billing_org_addons") {
      if (addonUpsertFails) return Promise.resolve({ error: { message: "write failed" } });
      addonWrites.push(row);
      return Promise.resolve({ error: null });
    }
    if (upsertFails) return Promise.resolve({ error: { message: "no such table" } });
    activeRows = [...activeRows, { channel: row.channel }];
    upserted.push(String(row.channel));
    return Promise.resolve({ error: null });
  };
  chain.order = () => Promise.resolve(result);
  // The `orgs` read ends on .maybeSingle().
  chain.maybeSingle = () => Promise.resolve(result);
  // billing_org_addons ends on .eq(), so the chain must also be awaitable.
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => builderFor(table) },
}));

import {
  getChatEntitlement,
  canAiReplyOnChannel,
  recordChatPurchase,
  CHAT_ADDON_SLOTS,
} from "@/lib/billing/chatEntitlement";

beforeEach(() => {
  addonRows = [];
  addonError = null;
  activeRows = [];
  activeError = null;
  upserted = [];
  upsertFails = false;
  addonWrites = [];
  addonUpsertFails = false;
  clearedKeys = [];
  isInternal = false;
  orgError = null;
});

/**
 * Denku runs as its own customer, so the landing page's chat widget is a real Web Chat channel on
 * a real workspace. Granting it through `billing_org_addons` would have put a $299/month add-on
 * with no Stripe subscription behind it into every revenue figure, and a number in a revenue
 * report that nobody pays is a number somebody eventually acts on. The exemption lives on the
 * workspace instead, and these tests pin how far it reaches.
 */
describe("internal workspaces", () => {
  it("gets chat capacity with no billing row at all", async () => {
    isInternal = true;
    const ent = await getChatEntitlement("denku");
    expect(ent.slots).toBeGreaterThan(0);
    expect((await canAiReplyOnChannel("denku", "web")).allowed).toBe(true);
  });

  it("still answers only on channels that are switched on", async () => {
    // Capacity is not the same as activation. An internal workspace should not silently start
    // answering on every channel that exists the moment a message arrives on it — it claims a
    // slot the same way a paying one does, which keeps the two paths identical.
    isInternal = true;
    activeRows = [{ channel: "web" }];
    const ent = await getChatEntitlement("denku");
    expect(ent.active).toEqual(["web"]);
  });

  it("does not grant capacity to an ordinary workspace", async () => {
    isInternal = false;
    expect((await getChatEntitlement("org-1")).slots).toBe(0);
    expect((await canAiReplyOnChannel("org-1", "web")).allowed).toBe(false);
  });

  it("reads a FAILED orgs lookup as not internal, never as allow", async () => {
    // Fail closed on money. A broken read must not start answering on a channel nobody paid for.
    orgError = { message: "orgs unreadable" };
    expect((await getChatEntitlement("org-1")).slots).toBe(0);
    expect((await canAiReplyOnChannel("org-1", "web")).allowed).toBe(false);
  });

  it("keeps a purchased entitlement if it somehow exceeds the internal grant", async () => {
    isInternal = true;
    addonRows = [{ addon_key: "chat_standard", qty: 1 }];
    const ent = await getChatEntitlement("denku");
    expect(ent.slots).toBeGreaterThanOrEqual(2);
  });
});

describe("getChatEntitlement", () => {
  it("gives a workspace with no chat add-on zero slots", async () => {
    expect(await getChatEntitlement("org-1")).toEqual({ slots: 0, active: [], remaining: 0 });
  });

  it("counts slots from the add-on rows", async () => {
    addonRows = [{ addon_key: "chat_standard", qty: 1 }];
    const ent = await getChatEntitlement("org-1");
    expect(ent.slots).toBe(CHAT_ADDON_SLOTS.chat_standard);
  });

  it("sums quantity, so two basic add-ons are two slots", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 2 }];
    expect((await getChatEntitlement("org-1")).slots).toBe(2);
  });

  it("ignores add-ons that are not chat, so voice add-ons never grant chat", async () => {
    addonRows = [{ addon_key: "extra_phone", qty: 5 }];
    expect((await getChatEntitlement("org-1")).slots).toBe(0);
  });

  it("ignores a voice channel that somehow got into the activation table", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [{ channel: "voice" }, { channel: "telegram" }];
    expect((await getChatEntitlement("org-1")).active).toEqual(["telegram"]);
  });

  it("reports remaining slots and never goes negative", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [{ channel: "telegram" }, { channel: "email" }];
    expect((await getChatEntitlement("org-1")).remaining).toBe(0);
  });

  it("reads a failed add-on query as not purchased, never as allow-everything", async () => {
    addonError = { message: "relation does not exist" };
    expect(await getChatEntitlement("org-1")).toEqual({ slots: 0, active: [], remaining: 0 });
  });

  it("treats a missing activation table as nothing switched on", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeError = { message: "relation does not exist" };
    const ent = await getChatEntitlement("org-1");
    expect(ent.slots).toBe(1);
    expect(ent.active).toEqual([]);
  });

  it("returns empty for a missing org id rather than querying", async () => {
    expect(await getChatEntitlement("")).toEqual({ slots: 0, active: [], remaining: 0 });
  });
});

describe("canAiReplyOnChannel", () => {
  it("never gates voice — its entitlement is the plan's concurrency limit", async () => {
    expect(await canAiReplyOnChannel("org-1", "voice")).toEqual({ allowed: true });
  });

  it("refuses chat when the workspace never bought it", async () => {
    const r = await canAiReplyOnChannel("org-1", "telegram");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("chat_not_purchased");
  });

  it("refuses a channel when every paid slot is already spent", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [{ channel: "email" }];
    const r = await canAiReplyOnChannel("org-1", "telegram");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("channel_not_activated");
    expect(upserted).toEqual([]);
  });

  it("lets a spare paid slot claim itself on the first message", async () => {
    // Bought one channel, none switched on yet — the state right after a sale.
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [];
    expect(await canAiReplyOnChannel("org-1", "telegram")).toEqual({ allowed: true });
    expect(upserted).toEqual(["telegram"]);
  });

  it("never claims a slot that was not paid for", async () => {
    addonRows = [];
    const r = await canAiReplyOnChannel("org-1", "telegram");
    expect(r.allowed).toBe(false);
    expect(upserted).toEqual([]);
  });

  it("refuses rather than answering when the claim write fails", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    upsertFails = true;
    const r = await canAiReplyOnChannel("org-1", "telegram");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("channel_not_activated");
  });

  it("allows an entitled, activated channel", async () => {
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [{ channel: "telegram" }];
    expect(await canAiReplyOnChannel("org-1", "telegram")).toEqual({ allowed: true });
  });

  it("after a downgrade, the oldest activation keeps working and the rest go quiet", async () => {
    // One slot, two channels still switched on. The query orders by activated_at, so the
    // first row is the older one.
    addonRows = [{ addon_key: "chat_basic", qty: 1 }];
    activeRows = [{ channel: "telegram" }, { channel: "email" }];

    expect(await canAiReplyOnChannel("org-1", "telegram")).toEqual({ allowed: true });

    const later = await canAiReplyOnChannel("org-1", "email");
    expect(later.allowed).toBe(false);
    expect(later.reason).toBe("over_plan_slots");
  });

  it("lets both run when the plan covers both", async () => {
    addonRows = [{ addon_key: "chat_standard", qty: 1 }];
    activeRows = [{ channel: "telegram" }, { channel: "email" }];
    expect((await canAiReplyOnChannel("org-1", "telegram")).allowed).toBe(true);
    expect((await canAiReplyOnChannel("org-1", "email")).allowed).toBe(true);
  });
});

describe("recordChatPurchase", () => {
  it("records the tier that was bought, with a quantity of exactly one", async () => {
    const r = await recordChatPurchase("org-1", "chat_basic");
    expect(r.ok).toBe(true);
    expect(addonWrites).toHaveLength(1);
    expect(addonWrites[0]).toMatchObject({
      org_id: "org-1",
      addon_key: "chat_basic",
      qty: 1,
      status: "active",
    });
  });

  it("clears the other tier first, so a workspace never holds both", async () => {
    // Buying two channels after buying one must not leave the customer billed for both and
    // granted three slots against two answerable channels.
    await recordChatPurchase("org-1", "chat_standard");
    expect(clearedKeys).toEqual(["chat_basic"]);
  });

  it("refuses an add-on key that does not sell chat", async () => {
    const r = await recordChatPurchase("org-1", "extra_phone");
    expect(r.ok).toBe(false);
    expect(addonWrites).toEqual([]);
    expect(clearedKeys).toEqual([]);
  });

  it("refuses a missing org id rather than writing an orphan row", async () => {
    const r = await recordChatPurchase("", "chat_basic");
    expect(r.ok).toBe(false);
    expect(addonWrites).toEqual([]);
  });

  it("reports a failed write instead of throwing", async () => {
    // Both callers run after Stripe has already charged the customer. Throwing here would fail
    // a webhook for a payment that succeeded; the failure has to be reportable, not fatal.
    addonUpsertFails = true;
    const r = await recordChatPurchase("org-1", "chat_basic");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("is safe to run twice, because both completion paths may run", async () => {
    await recordChatPurchase("org-1", "chat_basic");
    await recordChatPurchase("org-1", "chat_basic");
    expect(addonWrites).toHaveLength(2);
    // Same key, same quantity — the upsert key is (org_id, addon_key), so the second write
    // lands on the same row rather than granting a second channel slot. `updated_at` differs
    // by design and is not part of what makes the two writes equivalent.
    const identity = ({ org_id, addon_key, qty, status }: Row) => ({ org_id, addon_key, qty, status });
    expect(identity(addonWrites[0])).toEqual(identity(addonWrites[1]));
    expect(identity(addonWrites[0])).toEqual({
      org_id: "org-1",
      addon_key: "chat_basic",
      qty: 1,
      status: "active",
    });
  });
});
