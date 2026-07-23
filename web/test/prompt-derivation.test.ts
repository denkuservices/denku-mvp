import { describe, it, expect } from "vitest";
import {
  buildBusinessContextBlock,
  deriveEffectivePrompt,
} from "@/app/(app)/dashboard/settings/_lib/prompt-derivation";

/**
 * R-013 — business context must reach the system prompt, concisely and
 * deterministically (only present fields; mandatory fallback preserved).
 */
describe("buildBusinessContextBlock", () => {
  it("is empty when no context", () => {
    expect(buildBusinessContextBlock(null)).toBe("");
    expect(buildBusinessContextBlock({})).toBe("");
  });

  it("includes only non-empty fields, headed by the business name", () => {
    const block = buildBusinessContextBlock({
      businessName: "Acme Plumbing",
      services: "Emergency repairs, installs",
      openingHours: "Mon–Fri 8–6",
      serviceArea: "",
      bookingPolicy: null,
    });
    expect(block).toContain("About Acme Plumbing:");
    expect(block).toContain("- Services: Emergency repairs, installs");
    expect(block).toContain("- Hours: Mon–Fri 8–6");
    expect(block).not.toContain("Service area");
    expect(block).not.toContain("Booking policy");
  });

  it("renders FAQs and tone sections when present", () => {
    const block = buildBusinessContextBlock({ faqs: "Q: Do you do weekends? A: Yes.", tone: "Warm and local" });
    expect(block).toContain("Common caller questions");
    expect(block).toContain("Do you do weekends");
    expect(block).toContain("Tone: Warm and local.");
  });
});

describe("deriveEffectivePrompt with business context", () => {
  const base = {
    orgName: "Acme",
    agentName: "Riley",
    agentType: null,
    behaviorPreset: "concierge",
    emphasisPoints: null,
    language: "en",
    timezone: null,
    firstMessage: null,
  };

  it("injects the business context and keeps the mandatory fallback line", () => {
    const prompt = deriveEffectivePrompt({
      ...base,
      businessContext: { businessName: "Acme Plumbing", openingHours: "24/7" },
    });
    expect(prompt).toContain("About Acme Plumbing:");
    expect(prompt).toContain("- Hours: 24/7");
    expect(prompt).toContain('I\'ll notify our team and make sure someone follows up shortly.');
  });

  it("adds nothing when business context is absent (stays concise)", () => {
    const withCtx = deriveEffectivePrompt({ ...base, businessContext: { businessName: "X" } });
    const without = deriveEffectivePrompt({ ...base, businessContext: null });
    expect(without).not.toContain("About ");
    expect(withCtx.length).toBeGreaterThan(without.length);
  });
});
