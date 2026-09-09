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

/**
 * Brevity (2026-08-27). A real caller asked what the plans were and got all three, with prices
 * and minute allowances, in one turn — twice. Nothing in the prompt asked for short answers, so
 * the model optimised for completeness. These assertions pin the rule that fixes it.
 */
describe("deriveEffectivePrompt keeps the AI phone-length", () => {
  const prompt = deriveEffectivePrompt({
    orgName: "Acme Dental",
    agentName: "Front Desk",
    agentType: null,
    behaviorPreset: "professional",
    emphasisPoints: null,
    language: null,
    timezone: null,
    firstMessage: null,
  });

  it("caps the length of a spoken answer", () => {
    expect(prompt).toMatch(/one or two sentences/i);
  });

  it("forbids reciting prices and options nobody asked for", () => {
    expect(prompt).toMatch(/never recite a list of options, prices, or features unprompted/i);
    expect(prompt).toMatch(/ask whether they want the detail/i);
  });

  it("still carries the never-dead-end fallback line", () => {
    // The brevity rule must not have displaced the product's core promise.
    expect(prompt).toMatch(/I'll notify our team and make sure someone follows up shortly/);
  });
});

/**
 * The never-dead-end sentence is SPEECH, not an instruction — it is quoted under "say exactly".
 * Left in English it reached a Turkish caller at the one moment the call had already failed
 * (NOTUS, 2026-09-03). These assertions pin the fix and, just as importantly, pin that English
 * did not move.
 */
describe("deriveEffectivePrompt speaks the caller's language", () => {
  const base = {
    orgName: "NOTUS",
    agentName: "NOTUS AI",
    agentType: null,
    behaviorPreset: "support",
    emphasisPoints: null,
    timezone: null,
    firstMessage: null,
    businessContext: null,
  };

  it("quotes the fallback sentence in Turkish for a Turkish employee", () => {
    const prompt = deriveEffectivePrompt({ ...base, language: "Turkish" });
    expect(prompt).toContain('"Ekibimize ileteceğim, en kısa sürede size dönüş yapılacak."');
    expect(prompt).not.toContain("I'll notify our team");
  });

  it("accepts either spelling of the stored language", () => {
    // Onboarding writes "tr", the Setup editor writes "Turkish" — R-135's split, still live.
    const code = deriveEffectivePrompt({ ...base, language: "tr" });
    const label = deriveEffectivePrompt({ ...base, language: "Turkish" });
    expect(code).toBe(label);
  });

  /**
   * The stronger form of "don't drift into English": there is no English left to drift into.
   *
   * The prompt used to argue with the model — "these instructions are written in English for
   * internal reasons… speak ONLY Turkish" — because the frame around the Turkish facts was
   * English. A Turkish frame removes the asymmetry instead of restating the prohibition, so the
   * assertion is about the ABSENCE of the scaffold, not the presence of a warning about it.
   */
  it("writes the whole prompt in Turkish for a Turkish employee", () => {
    const prompt = deriveEffectivePrompt({ ...base, language: "tr" });

    expect(prompt).toContain("sesli asistansın");
    expect(prompt).toContain("TELEFONDAKİ BİR İNSAN GİBİ KONUŞ");
    expect(prompt).toContain("ÇOK ÖNEMLİ:");

    expect(prompt).not.toMatch(/You are a calm and empathetic/);
    expect(prompt).not.toMatch(/SPEAK LIKE A PERSON ON A PHONE/);
    // A quoted example the AI is shown as something to SAY — R-166's rule, in the one place it
    // still applied after the fallback sentence was fixed.
    expect(prompt).not.toMatch(/Want me to run through the options/);
    expect(prompt).not.toMatch(/These instructions are written in English/);
  });

  it("names the language in the frame's own words", () => {
    // "Konuşma dili: Turkish" was the one English word left in an otherwise Turkish prompt — and
    // it sat in the very line telling the model which language to speak.
    expect(deriveEffectivePrompt({ ...base, language: "tr" })).toContain("Konuşma dili: Türkçe");
    expect(deriveEffectivePrompt({ ...base, language: "en" })).toContain("Primary language: English");
  });

  it("still names the asymmetry for a language with no frame of its own", () => {
    // Spanish has its own spoken fallback but no frame, so everything around it is still English
    // — which is exactly when the model has to be told twice not to answer in it.
    const prompt = deriveEffectivePrompt({ ...base, language: "es" });
    expect(prompt).toMatch(/Speak ONLY Spanish/);
    expect(prompt).toMatch(/including when you are confused/i);
  });

  it("leaves an English employee byte-for-byte unchanged", () => {
    const prompt = deriveEffectivePrompt({ ...base, language: "en" });
    expect(prompt).toContain('"I\'ll notify our team and make sure someone follows up shortly."');
    expect(prompt).toContain("You are NOTUS AI, a voice assistant for NOTUS.");
    expect(prompt).toContain("SPEAK LIKE A PERSON ON A PHONE, NOT A BROCHURE:");
    expect(prompt).toContain('(e.g. "Want me to run through the options?")');
    expect(prompt).not.toMatch(/Speak ONLY/);
  });

  it("falls back to English for a language with no sentence of its own", () => {
    // An unknown value must never produce an empty quote — that would order silence.
    const prompt = deriveEffectivePrompt({ ...base, language: "Klingon" });
    expect(prompt).toContain("I'll notify our team and make sure someone follows up shortly.");
  });
});
