import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { namesMatch, recallPromptBlock, type RecallFacts } from "@/lib/platform/recall";
import { buildChatSystemPrompt } from "@/lib/platform/reply/prompt";
import type { ReplyEmployee } from "@/lib/platform/reply/types";

/**
 * Contact recall (R-139) — the pure half.
 *
 * The security property of this feature is a comparison and a filter, and both are pure. The
 * database half is exercised live (spec §9); what must never regress silently is *who* is
 * considered the same person, and *what* is allowed into a third-party prompt.
 */

describe("namesMatch — the only thing between a customer and a stranger holding their phone", () => {
  it("matches the same person written differently", () => {
    expect(namesMatch("jack", "Jack")).toBe(true);
    expect(namesMatch("  Jack  ", "Jack")).toBe(true);
    expect(namesMatch("Jack", "Jack Miller")).toBe(true);
    expect(namesMatch("Jack Miller", "Jack")).toBe(true);
    expect(namesMatch("Jack Miller", "Miller Jack")).toBe(true);
    expect(namesMatch("Ayşe", "ayşe")).toBe(true);
    expect(namesMatch("Mehmet.", "Mehmet")).toBe(true);
  });

  it("refuses a different person, however close", () => {
    expect(namesMatch("Mehmet", "Ali")).toBe(false);
    expect(namesMatch("Jack", "Jacqueline")).toBe(false);
    expect(namesMatch("Jak", "Jack")).toBe(false);
  });

  it("does not unlock on a surname alone", () => {
    // Surnames are shared by families and guessable from a business's own paperwork. A first name
    // is the weaker claim to guess and the stronger claim to have been told by the person.
    expect(namesMatch("Miller", "Jack Miller")).toBe(false);
  });

  it("never matches on nothing", () => {
    expect(namesMatch("", "Jack")).toBe(false);
    expect(namesMatch("Jack", "")).toBe(false);
    expect(namesMatch(null, null)).toBe(false);
    expect(namesMatch(undefined, "Jack")).toBe(false);
    expect(namesMatch("   ", "Jack")).toBe(false);
  });
});

describe("recallPromptBlock — what is allowed to reach a third-party model", () => {
  const facts: RecallFacts = {
    contactId: "c1",
    name: "Jack",
    nextAppointmentAt: "2026-08-28T20:00:00.000Z",
    hasOpenRequest: true,
  };

  it("renders nothing at all for a first-time contact", () => {
    expect(recallPromptBlock(null, "America/New_York")).toBe("");
    expect(
      recallPromptBlock({ contactId: "c1", name: null, nextAppointmentAt: null, hasOpenRequest: false }, null)
    ).toBe("");
  });

  it("states the appointment in the business's own zone", () => {
    const block = recallPromptBlock(facts, "America/New_York");
    expect(block).toContain("Jack");
    expect(block).toContain("4:00 PM");
    expect(block).not.toContain("20:00");
  });

  it("says a request is open without saying what it is (Tier 2 stays shut)", () => {
    const block = recallPromptBlock(facts, "America/New_York");
    expect(block).toMatch(/open request/i);
    expect(block).toMatch(/do not guess its status or contents/i);
  });

  it("tells the AI to use it, not to recite it", () => {
    const block = recallPromptBlock(facts, null);
    expect(block).toMatch(/never read it out as a list/i);
    expect(block).toMatch(/never ask for any of it/i);
  });

  it("survives a broken timezone rather than dropping the fact", () => {
    const block = recallPromptBlock(facts, "Not/AZone");
    expect(block).toContain("Upcoming appointment:");
  });
});

describe("recall in the chat prompt", () => {
  const employee: ReplyEmployee = {
    id: "a1",
    name: "Denku",
    orgId: "o1",
    orgName: "Bright Dental",
    language: "en",
    timezone: "America/New_York",
    systemPromptOverride: "Always mention the Tuesday discount.",
    firstMessage: null,
    businessContext: { businessName: "Bright Dental", openingHours: "Mon–Fri 9–6" },
  };

  const recall = recallPromptBlock(
    { contactId: "c1", name: "Jack", nextAppointmentAt: null, hasOpenRequest: false },
    "America/New_York"
  );

  it("is absent unless it is passed — the prompt never invents it", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null });
    expect(p).not.toMatch(/already know about this customer/i);
  });

  it("sits after the business's facts and before the honesty rules", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null, recall });
    // Facts → recall → rules. Recall may shape what is said; it may never outrank the rules.
    expect(p.indexOf("Bright Dental")).toBeLessThan(p.indexOf("already know about this customer"));
    expect(p.indexOf("already know about this customer")).toBeLessThan(p.indexOf("Never invent a price"));
  });

  it("adds nothing when there is nothing to recall", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null, recall: "" });
    expect(p).not.toMatch(/already know about this customer/i);
  });
});
