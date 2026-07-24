import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { listConversations, getConversationMessages, listEmployeeChannels } from "@/lib/platform/read";

/** A tiny chainable stub that records the filters applied and returns canned rows. */
function stubDb(rows: any[]) {
  const calls: Record<string, any> = { eq: [] };
  const builder: any = {
    select() {
      return builder;
    },
    eq(col: string, val: any) {
      calls.eq.push([col, val]);
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve: (v: any) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return { calls, from: () => builder } as any;
}

describe("platform read helpers (org-scoped)", () => {
  it("listConversations always scopes by org and returns rows", async () => {
    const db = stubDb([{ id: "c1", channel: "voice" }]);
    const out = await listConversations("o1", { channel: "voice" }, db);
    expect(out).toHaveLength(1);
    expect(db.calls.eq).toContainEqual(["org_id", "o1"]);
    expect(db.calls.eq).toContainEqual(["channel", "voice"]);
  });

  it("getConversationMessages scopes by org + conversation", async () => {
    const db = stubDb([{ id: "m1", role: "user", content: "hi" }]);
    const out = await getConversationMessages("o1", "conv-1", db);
    expect(out).toHaveLength(1);
    expect(db.calls.eq).toContainEqual(["org_id", "o1"]);
    expect(db.calls.eq).toContainEqual(["conversation_id", "conv-1"]);
  });

  it("returns [] on missing inputs without querying", async () => {
    const db = stubDb([{ id: "x" }]);
    expect(await listConversations("", {}, db)).toEqual([]);
    expect(await getConversationMessages("o1", "", db)).toEqual([]);
    expect(await listEmployeeChannels("", "e1", db)).toEqual([]);
  });
});
