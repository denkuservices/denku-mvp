import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { recordVoiceCall } from "@/lib/platform/wiring/recordVoiceCall";
import { makeFakeDb, resetFakeIds, type FakeDb } from "./helpers/fakePlatformDb";

let db: FakeDb;
beforeEach(() => {
  resetFakeIds();
  db = makeFakeDb();
  // extra tables the recorder back-links into
  db.tables.calls = [{ id: "call-row-1", org_id: "o1", conversation_id: null }];
  db.tables.tickets = [{ id: "t1", org_id: "o1", call_id: "call-row-1", conversation_id: null }];
  db.tables.appointments = [];
});

describe("recordVoiceCall (voice → shared model)", () => {
  it("records a conversation with per-turn messages and back-links the call", async () => {
    const res = await recordVoiceCall(
      {
        callId: "call-row-1",
        orgId: "o1",
        agentId: "ag1",
        vapiCallId: "vapi-1",
        fromPhone: "+13215551234",
        transcript: "AI: Hi there User: I need help Agent: Sure",
        startedAt: "2026-07-24T00:00:00Z",
      },
      db as any
    );

    expect(res.conversationId).toBeTruthy();
    expect(db.tables.conversations).toHaveLength(1);
    expect(db.tables.conversations[0].channel).toBe("voice");
    expect(db.tables.conversations[0].external_thread_id).toBe("vapi-1");
    expect(db.tables.messages).toHaveLength(3);
    // call back-linked
    expect(db.tables.calls[0].conversation_id).toBe(res.conversationId);
    // artifact back-linked
    expect(db.tables.tickets[0].conversation_id).toBe(res.conversationId);
  });

  it("is idempotent — re-running the same call adds no duplicate messages", async () => {
    const input = {
      callId: "call-row-1",
      orgId: "o1",
      vapiCallId: "vapi-1",
      fromPhone: "+1",
      transcript: "AI: Hi User: Hello",
      startedAt: "2026-07-24T00:00:00Z",
    };
    const a = await recordVoiceCall(input, db as any);
    const b = await recordVoiceCall(input, db as any);
    expect(b.conversationId).toBe(a.conversationId);
    expect(db.tables.conversations).toHaveLength(1);
    expect(db.tables.messages).toHaveLength(2);
  });

  it("no transcript → no conversation, no throw", async () => {
    const res = await recordVoiceCall(
      { callId: "call-row-1", orgId: "o1", vapiCallId: "vapi-1", transcript: "" },
      db as any
    );
    expect(res.conversationId).toBeNull();
    expect(db.tables.conversations).toHaveLength(0);
  });
});
