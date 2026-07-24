import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { ingestInboundMessage } from "@/lib/platform/ingest";
import { instagramAdapter } from "@/lib/platform/adapters/instagram";
import { makeFakeDb, resetFakeIds, type FakeDb } from "./helpers/fakePlatformDb";
import type { NormalizedInbound } from "@/lib/platform/adapters/types";

let db: FakeDb;
beforeEach(() => {
  resetFakeIds();
  db = makeFakeDb();
});

function igMessage(text: string, mid: string): NormalizedInbound {
  return instagramAdapter.normalizeInbound(
    { id: "biz", messaging: [{ sender: { id: "cust-1" }, recipient: { id: "biz" }, timestamp: 1721779200000, message: { mid, text } }] },
    { orgId: "o1", agentId: null }
  )[0];
}

describe("ingestInboundMessage (shared pipeline)", () => {
  it("records contact + conversation + message end-to-end", async () => {
    const res = await ingestInboundMessage(igMessage("hello", "m1"), { db: db as any });
    expect(res.ok).toBe(true);
    expect(res.conversationId).toBeTruthy();
    expect(res.contactId).toBeTruthy();
    expect(res.messageId).toBeTruthy();
    expect(db.tables.contacts).toHaveLength(1);
    expect(db.tables.conversations).toHaveLength(1);
    expect(db.tables.messages).toHaveLength(1);
  });

  it("is idempotent for the same channel message (fires twice → one message)", async () => {
    const first = await ingestInboundMessage(igMessage("hello", "m1"), { db: db as any });
    const again = await ingestInboundMessage(igMessage("hello", "m1"), { db: db as any });
    expect(again.messageId).toBe(first.messageId);
    expect(db.tables.messages).toHaveLength(1);
    expect(db.tables.conversations).toHaveLength(1);
  });

  it("second message in the same thread reuses the conversation + contact", async () => {
    await ingestInboundMessage(igMessage("hello", "m1"), { db: db as any });
    await ingestInboundMessage(igMessage("still there?", "m2"), { db: db as any });
    expect(db.tables.conversations).toHaveLength(1);
    expect(db.tables.contacts).toHaveLength(1);
    expect(db.tables.messages).toHaveLength(2);
  });

  it("runs the optional Intent stage only when a signal is present", async () => {
    const classifyIntent = vi.fn().mockResolvedValue({ intent: "appointment", confidence: 0.9 });
    const res = await ingestInboundMessage(igMessage("I want to book", "m1"), { db: db as any, classifyIntent });
    expect(classifyIntent).toHaveBeenCalledOnce();
    expect(res.intent?.intent).toBe("appointment");

    classifyIntent.mockClear();
    const echo = { ...igMessage("noop", "m2"), transcriptForIntent: null };
    await ingestInboundMessage(echo, { db: db as any, classifyIntent });
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("runs the optional Automation stage with full context", async () => {
    const runAutomation = vi.fn();
    const res = await ingestInboundMessage(igMessage("book me", "m1"), {
      db: db as any,
      classifyIntent: () => ({ intent: "appointment", confidence: 1 }),
      runAutomation,
    });
    expect(runAutomation).toHaveBeenCalledOnce();
    const ctx = runAutomation.mock.calls[0][0];
    expect(ctx.conversationId).toBe(res.conversationId);
    expect(ctx.intent.intent).toBe("appointment");
  });

  it("never throws / degrades when intent or automation blows up", async () => {
    const res = await ingestInboundMessage(igMessage("hi", "m1"), {
      db: db as any,
      classifyIntent: () => {
        throw new Error("LLM down");
      },
      runAutomation: () => {
        throw new Error("automation down");
      },
    });
    // The record still lands; the pipeline swallows stage errors.
    expect(res.ok).toBe(true);
    expect(res.messageId).toBeTruthy();
    expect(res.intent).toBeNull();
  });

  it("returns empty result on a malformed normalized event", async () => {
    const res = await ingestInboundMessage(
      { channel: "instagram", orgId: "", externalThreadId: "", contact: { externalId: "x" }, message: { role: "user", direction: "inbound", content: "x" } } as NormalizedInbound,
      { db: db as any }
    );
    expect(res.ok).toBe(false);
  });
});
