import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The two nudges are the only place the product tells a customer they are not getting something
 * they pay for, so the rules that decide when to show them matter more than how they look.
 *
 * The cases below are the ones that separate an earned warning from a nag: a workspace that has
 * finished setting up must see nothing, and a workspace whose AI has never spoken must not be
 * told it is under-informed before there is any evidence of that.
 */

type Row = Record<string, unknown>;

let agentRows: Row[] = [];
let conversationCount = 0;
let telegramCount = 0;
let emailCount = 0;
let entitlement = { slots: 0, active: [] as string[], remaining: 0 };
let throwOnQuery = false;

vi.mock("@/lib/billing/chatEntitlement", () => ({
  getChatEntitlement: async () => entitlement,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (throwOnQuery) throw new Error("db down");
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.eq = self;
      chain.order = self;
      chain.select = (_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const count =
            table === "conversations"
              ? conversationCount
              : table === "telegram_connections"
                ? telegramCount
                : emailCount;
          const headChain: Record<string, unknown> = {};
          const headSelf = () => headChain;
          headChain.eq = headSelf;
          headChain.then = (r: (v: unknown) => unknown) =>
            Promise.resolve({ count, data: null, error: null }).then(r);
          return headChain;
        }
        return chain;
      };
      chain.limit = () => Promise.resolve({ data: agentRows, error: null });
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: agentRows, error: null }).then(r);
      return chain;
    },
  },
}));

import { getSetupNudges } from "@/lib/dashboard/setupNudges";

beforeEach(() => {
  agentRows = [{ id: "a1", business_context: null }];
  conversationCount = 0;
  telegramCount = 0;
  emailCount = 0;
  entitlement = { slots: 0, active: [], remaining: 0 };
  throwOnQuery = false;
});

const kinds = async () => (await getSetupNudges("org-1")).map((n) => n.kind);

describe("knowledge nudge", () => {
  it("stays quiet before the AI has spoken to anyone", async () => {
    // No evidence yet. Warning here would be a checklist wearing a warning's clothes.
    conversationCount = 0;
    expect(await kinds()).not.toContain("knowledge");
  });

  it("appears once the AI has handled a conversation with no knowledge", async () => {
    conversationCount = 12;
    const nudges = await getSetupNudges("org-1");
    const n = nudges.find((x) => x.kind === "knowledge");
    expect(n).toBeDefined();
    expect(n && "conversations" in n && n.conversations).toBe(12);
  });

  it("goes away as soon as one real knowledge field is filled", async () => {
    conversationCount = 12;
    agentRows = [{ id: "a1", business_context: { services: "Dental cleanings and implants" } }];
    expect(await kinds()).not.toContain("knowledge");
  });

  it("does not count the business NAME as knowledge", async () => {
    // The name is seeded automatically from the workspace. Treating it as knowledge would hide
    // the nudge from every workspace without a single fact having been written.
    conversationCount = 12;
    agentRows = [{ id: "a1", business_context: { businessName: "Deneme" } }];
    expect(await kinds()).toContain("knowledge");
  });

  it("ignores whitespace-only fields", async () => {
    conversationCount = 5;
    agentRows = [{ id: "a1", business_context: { services: "   " } }];
    expect(await kinds()).toContain("knowledge");
  });

  it("says nothing when there is no employee at all", async () => {
    conversationCount = 5;
    agentRows = [];
    expect(await kinds()).not.toContain("knowledge");
  });
});

describe("unused chat capacity nudge", () => {
  it("stays quiet for a workspace that never bought chat", async () => {
    entitlement = { slots: 0, active: [], remaining: 0 };
    expect(await kinds()).not.toContain("unused_chat_slots");
  });

  it("stays quiet when one channel is bought and one is connected", async () => {
    // The owner's rule: a finished workspace must not be nagged.
    entitlement = { slots: 1, active: ["telegram"], remaining: 0 };
    telegramCount = 1;
    expect(await kinds()).not.toContain("unused_chat_slots");
  });

  it("appears when two are bought and one is connected", async () => {
    entitlement = { slots: 2, active: ["telegram"], remaining: 1 };
    telegramCount = 1;
    const n = (await getSetupNudges("org-1")).find((x) => x.kind === "unused_chat_slots");
    expect(n).toBeDefined();
    expect(n && "slots" in n && n.slots).toBe(2);
    expect(n && "connected" in n && n.connected).toBe(1);
  });

  it("counts connections, not activations", async () => {
    // A channel connected but never messaged has not claimed its slot yet. It is still in use
    // as far as the customer is concerned, so it must not read as wasted capacity.
    entitlement = { slots: 2, active: [], remaining: 2 };
    telegramCount = 1;
    emailCount = 1;
    expect(await kinds()).not.toContain("unused_chat_slots");
  });
});

describe("failure behaviour", () => {
  it("returns nothing rather than breaking the dashboard", async () => {
    throwOnQuery = true;
    expect(await getSetupNudges("org-1")).toEqual([]);
  });

  it("returns nothing without an org", async () => {
    expect(await getSetupNudges("")).toEqual([]);
  });
});
