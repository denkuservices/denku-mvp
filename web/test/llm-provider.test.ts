import { describe, it, expect } from "vitest";
import { resolveLlmProvider, llmConfigured } from "@/lib/llm/provider";

/**
 * WHICH MODEL ANSWERS, AND WHY IT IS AN ENV VAR.
 *
 * Denku's one LLM call today (call-intent classification) and the chat replies coming next both
 * want the same thing: a cheap model that returns JSON. Gemini is reached through its
 * OpenAI-compatible endpoint, so the SDK, the code path and the types stay single — switching
 * providers is an env change, not a refactor.
 *
 * The load-bearing property: **no key means no provider**, so every caller keeps its
 * deterministic fallback (regex intent) rather than throwing. An outage in a model vendor must
 * never take a call artifact down with it.
 */

describe("resolveLlmProvider", () => {
  it("returns null when neither key is set — callers fall back", () => {
    expect(resolveLlmProvider({})).toBeNull();
    expect(llmConfigured({})).toBe(false);
  });

  it("treats a blank key as no key", () => {
    expect(resolveLlmProvider({ GEMINI_API_KEY: "   ", OPENAI_API_KEY: "" })).toBeNull();
  });

  it("routes Gemini through the OpenAI-compatible endpoint", () => {
    const p = resolveLlmProvider({ GEMINI_API_KEY: "AIza-x" })!;
    expect(p.id).toBe("gemini");
    expect(p.apiKey).toBe("AIza-x");
    expect(p.baseURL).toBe("https://generativelanguage.googleapis.com/v1beta/openai/");
    expect(p.model).toMatch(/^gemini-/);
  });

  it("uses OpenAI's own endpoint when that is the configured key", () => {
    const p = resolveLlmProvider({ OPENAI_API_KEY: "sk-x" })!;
    expect(p.id).toBe("openai");
    expect(p.baseURL).toBeUndefined();
    expect(p.model).toBe("gpt-4o-mini");
  });

  it("prefers Gemini when both are set, so the cheaper key wins by being present", () => {
    expect(resolveLlmProvider({ GEMINI_API_KEY: "AIza-x", OPENAI_API_KEY: "sk-x" })!.id).toBe("gemini");
  });

  it("LLM_MODEL overrides the default for whichever provider is active", () => {
    expect(resolveLlmProvider({ GEMINI_API_KEY: "k", LLM_MODEL: "gemini-2.5-flash" })!.model).toBe(
      "gemini-2.5-flash"
    );
    expect(resolveLlmProvider({ OPENAI_API_KEY: "k", LLM_MODEL: "gpt-4.1-mini" })!.model).toBe(
      "gpt-4.1-mini"
    );
  });

  it("never leaks the key into the model field or vice versa", () => {
    const p = resolveLlmProvider({ GEMINI_API_KEY: "AIza-secret" })!;
    expect(p.model).not.toContain("AIza");
  });
});
