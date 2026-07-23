import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the OpenAI SDK so no network call happens; control what `create` returns.
const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
    constructor(_opts?: unknown) {}
  },
}));

import { classifyIntentRegex, classifyCallIntent } from "@/lib/intent/classifyCallIntent";

function llmReturns(obj: unknown) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] });
}

describe("classifyIntentRegex (conservative fallback, pure)", () => {
  it("returns other/none for empty transcript", () => {
    expect(classifyIntentRegex("")).toMatchObject({ intent: "other", source: "none" });
    expect(classifyIntentRegex(null)).toMatchObject({ intent: "other", source: "none" });
  });
  it("detects booking keywords → appointment", () => {
    expect(classifyIntentRegex("User: I'd like to book an appointment").intent).toBe("appointment");
    expect(classifyIntentRegex("can we reschedule my slot?").intent).toBe("appointment");
  });
  it("non-booking content → support", () => {
    expect(classifyIntentRegex("my invoice looks wrong").intent).toBe("support");
  });
});

describe("classifyCallIntent (AI-primary, regex fallback, never throws)", () => {
  const OLD = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = OLD;
  });

  it("uses the LLM result when confident (source=llm) and extracts booking details", async () => {
    llmReturns({
      intent: "appointment",
      confidence: 0.92,
      booking_details: { name: "Jane", service: "cleaning", preferred_time: "Friday 2pm" },
    });
    const r = await classifyCallIntent("I want to book a cleaning on Friday");
    expect(r).toMatchObject({ intent: "appointment", source: "llm" });
    expect(r.confidence).toBeCloseTo(0.92);
    expect(r.bookingDetails).toEqual({ name: "Jane", service: "cleaning", preferredTime: "Friday 2pm" });
  });

  it("falls back to regex when the LLM errors (webhook never fails)", async () => {
    mockCreate.mockRejectedValue(new Error("network down"));
    const r = await classifyCallIntent("I need to book an appointment");
    expect(r).toMatchObject({ intent: "appointment", source: "regex" });
  });

  it("falls back to regex on low LLM confidence", async () => {
    llmReturns({ intent: "appointment", confidence: 0.2, booking_details: null });
    const r = await classifyCallIntent("uh, maybe, I'm not sure");
    expect(r.source).toBe("regex"); // low-confidence LLM ignored
  });

  it("uses regex when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await classifyCallIntent("can I schedule a visit?");
    expect(r).toMatchObject({ intent: "appointment", source: "regex" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns other/none for an empty transcript without calling the LLM", async () => {
    const r = await classifyCallIntent("   ");
    expect(r).toMatchObject({ intent: "other", source: "none" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("never throws even on malformed LLM JSON", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const r = await classifyCallIntent("hello I have a question about my bill");
    expect(r.source).toBe("regex");
    expect(r.intent).toBe("support");
  });
});
