import { describe, it, expect } from "vitest";
import { voiceAdapter, parseTranscriptTurns } from "@/lib/platform/adapters/voice";
import { instagramAdapter } from "@/lib/platform/adapters/instagram";
import { getChannelAdapter, hasChannelAdapter } from "@/lib/platform/adapters/registry";

describe("parseTranscriptTurns (pure)", () => {
  it("splits by speaker labels into roles", () => {
    const t = "AI: Hi, how can I help? User: I need to book. Agent: Sure, when?";
    const turns = parseTranscriptTurns(t);
    expect(turns.map((x) => x.role)).toEqual(["assistant", "user", "assistant"]);
    expect(turns[1].content).toContain("book");
  });
  it("no labels → single system turn", () => {
    expect(parseTranscriptTurns("just some text")).toEqual([{ role: "system", content: "just some text" }]);
  });
  it("empty/nullish → no turns", () => {
    expect(parseTranscriptTurns("")).toEqual([]);
    expect(parseTranscriptTurns(null)).toEqual([]);
  });
});

describe("voiceAdapter.normalizeInbound", () => {
  const ctx = { orgId: "o1", agentId: "ag1" };
  it("produces one normalized message per turn, one thread per call", () => {
    const out = voiceAdapter.normalizeInbound(
      { vapiCallId: "call-1", fromPhone: "+13215551234", callerName: "Jane", transcript: "AI: Hello User: hi", startedAt: "2026-07-24T00:00:00Z" },
      ctx
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((m) => m.externalThreadId))).toEqual(new Set(["call-1"]));
    expect(out[0].channel).toBe("voice");
    expect(out[0].contact.externalId).toBe("+13215551234");
    expect(out[0].message.direction).toBe("outbound"); // AI turn
    expect(out[1].message.direction).toBe("inbound"); // caller turn
    // Stable per-turn ids for idempotent re-ingest.
    expect(out.map((m) => m.message.externalMessageId)).toEqual(["call-1:0", "call-1:1"]);
  });
  it("returns [] with no transcript or no call id", () => {
    expect(voiceAdapter.normalizeInbound({ vapiCallId: "c", transcript: "" }, ctx)).toEqual([]);
    expect(voiceAdapter.normalizeInbound({ vapiCallId: "", transcript: "AI: hi" }, ctx)).toEqual([]);
    expect(voiceAdapter.normalizeInbound(null, ctx)).toEqual([]);
  });
});

describe("instagramAdapter.normalizeInbound", () => {
  const ctx = { orgId: "o1", agentId: null };
  it("maps inbound DMs to user/inbound, one thread per sender", () => {
    const entry = {
      id: "biz-123",
      messaging: [
        { sender: { id: "cust-9" }, recipient: { id: "biz-123" }, timestamp: 1721779200000, message: { mid: "m1", text: "hello" } },
      ],
    };
    const out = instagramAdapter.normalizeInbound(entry, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].channel).toBe("instagram");
    expect(out[0].externalThreadId).toBe("cust-9");
    expect(out[0].contact.externalId).toBe("cust-9");
    expect(out[0].message.role).toBe("user");
    expect(out[0].message.direction).toBe("inbound");
    expect(out[0].message.externalMessageId).toBe("m1");
    expect(out[0].transcriptForIntent).toBe("hello");
    expect(out[0].message.createdAt).toBe("2024-07-24T00:00:00.000Z");
  });
  it("maps business echoes to assistant/outbound, thread stays the customer", () => {
    const entry = {
      id: "biz-123",
      messaging: [
        { sender: { id: "biz-123" }, recipient: { id: "cust-9" }, message: { mid: "m2", text: "thanks!", is_echo: true } },
      ],
    };
    const out = instagramAdapter.normalizeInbound(entry, ctx);
    expect(out[0].externalThreadId).toBe("cust-9");
    expect(out[0].message.role).toBe("assistant");
    expect(out[0].message.direction).toBe("outbound");
    expect(out[0].transcriptForIntent).toBeNull();
  });
  it("ignores non-text events (reactions, reads, empty)", () => {
    const entry = { id: "biz", messaging: [{ sender: { id: "c" }, message: { mid: "x" } }] };
    expect(instagramAdapter.normalizeInbound(entry, ctx)).toEqual([]);
    expect(instagramAdapter.normalizeInbound({ id: "biz" }, ctx)).toEqual([]);
    expect(instagramAdapter.normalizeInbound(null, ctx)).toEqual([]);
  });
});

describe("adapter registry", () => {
  it("resolves adopted channels, not unadopted ones", () => {
    expect(getChannelAdapter("voice")).toBe(voiceAdapter);
    expect(getChannelAdapter("instagram")).toBe(instagramAdapter);
    expect(hasChannelAdapter("whatsapp")).toBe(false);
    expect(getChannelAdapter("email")).toBeUndefined();
  });
});
