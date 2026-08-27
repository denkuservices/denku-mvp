import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LANGUAGES,
  LANGUAGE_CODES,
  resolveLanguageSet,
  toLanguageCode,
} from "@/lib/language/registry";
import {
  buildAssistantConfigPatch,
  resolveTranscriberForLanguages,
  resolveVoiceForLanguages,
} from "@/lib/vapi/assistantConfig";
import { deriveEffectivePrompt } from "@/app/(app)/dashboard/settings/_lib/prompt-derivation";
import {
  EMPTY_BUSINESS_CONTEXT,
  SETUP_LANGUAGES,
  toSetupFormState,
  toUpdateAgentConfigPayload,
} from "@/app/(app)/dashboard/_platform/team/setupFields";
import { LANGUAGE_OPTIONS } from "@/app/(app)/dashboard/settings/_lib/options";

const PROD = { NODE_ENV: "production", VAPI_WEBHOOK_BASE_URL: "https://www.denku.io" } as NodeJS.ProcessEnv;

const prompt = (over: Partial<Parameters<typeof deriveEffectivePrompt>[0]> = {}) =>
  deriveEffectivePrompt({
    orgName: "Acme Dental",
    agentName: "Front Desk",
    agentType: null,
    behaviorPreset: "professional",
    emphasisPoints: null,
    language: "English",
    additionalLanguages: null,
    timezone: null,
    firstMessage: null,
    ...over,
  });

/**
 * An employee that understands more than one language (2026-08-28).
 *
 * Only one part of the chain needs telling: the transcriber. The model already knows every
 * language and the voice follows whatever it answered in. So the whole feature is a single
 * decision — one language pins the ear, more than one switches it to code-switching — and there
 * is deliberately no second toggle that could disagree with the first.
 */
describe("the registry is the limit of what can be offered", () => {
  it("both pickers are the registry, so neither can offer a language with no voice (R-135)", () => {
    const labels = LANGUAGE_CODES.map((c) => LANGUAGES[c].label);
    expect([...SETUP_LANGUAGES]).toEqual(labels);
    expect(LANGUAGE_OPTIONS.map((o) => o.value)).toEqual(LANGUAGE_CODES);
  });

  it("every language resolves from both its code and its name", () => {
    for (const code of LANGUAGE_CODES) {
      expect(toLanguageCode(code)).toBe(code);
      expect(toLanguageCode(LANGUAGES[code].label)).toBe(code);
    }
  });

  it("a language that cannot be spoken is not a language", () => {
    expect(toLanguageCode("Turkish")).toBeNull();
    expect(toLanguageCode("")).toBeNull();
    expect(toLanguageCode("es-MX")).toBe("es"); // locale forms still resolve
  });
});

describe("resolveLanguageSet", () => {
  it("puts the primary first and drops anything unspeakable", () => {
    expect(resolveLanguageSet("English", ["Spanish", "Turkish"])).toEqual(["en", "es"]);
  });

  it("never lets the primary appear twice", () => {
    expect(resolveLanguageSet("en", ["English", "en"])).toEqual(["en"]);
  });

  it("falls back to English rather than leaving a call with no language", () => {
    expect(resolveLanguageSet(null, null)).toEqual(["en"]);
  });
});

describe("one language behaves exactly as it did before", () => {
  it("pins the ear to that language — the most accurate it gets", () => {
    expect(resolveTranscriberForLanguages(["en"])).toEqual({
      provider: "deepgram",
      model: "nova-3",
      language: "en",
    });
    expect(resolveTranscriberForLanguages(["es"])).toEqual({
      provider: "deepgram",
      model: "nova-2",
      language: "es",
    });
  });

  it("keeps that language's own voice", () => {
    expect(resolveVoiceForLanguages(["es"])).toEqual(LANGUAGES.es.voice);
  });

  it("an employee with no extra languages produces the identical patch", () => {
    const before = buildAssistantConfigPatch({ model: {} }, { language: "en" }, PROD);
    const after = buildAssistantConfigPatch(
      { model: {} },
      { language: "en", additionalLanguages: [] },
      PROD
    );
    expect(after).toEqual(before);
    expect(after.transcriber).toEqual({ provider: "deepgram", model: "nova-3", language: "en" });
  });

  it("says nothing about multiple languages in the prompt", () => {
    expect(prompt()).toMatch(/Primary language: English/);
    expect(prompt()).not.toMatch(/You speak/);
  });
});

describe("a second language switches the ear by itself", () => {
  it("goes to code-switching — no separate toggle exists to disagree with", () => {
    expect(resolveTranscriberForLanguages(["en", "es"])).toEqual({
      provider: "deepgram",
      model: "nova-3",
      language: "multi",
    });
  });

  it("keeps a voice that can follow the caller", () => {
    // English's voice already follows the caller, so it is kept.
    expect(resolveVoiceForLanguages(["en", "es"])).toEqual(LANGUAGES.en.voice);
    // Spanish's voice is pinned, so a Spanish-primary multilingual employee gets the one that
    // is not — a voice stuck in one language reading another is worse than the problem.
    expect(resolveVoiceForLanguages(["es", "en"])).toEqual(LANGUAGES.en.voice);
    expect(resolveVoiceForLanguages(["es", "en"]).language).toBe("auto");
  });

  it("reaches the Vapi patch", () => {
    const patch = buildAssistantConfigPatch(
      { model: {} },
      { language: "English", additionalLanguages: ["Spanish"] },
      PROD
    );
    expect(patch.transcriber).toMatchObject({ language: "multi", model: "nova-3" });
    expect(patch.voice).toMatchObject({ language: "auto" });
  });

  it("names the languages in the prompt — Vapi's docs say a model will not infer this", () => {
    const p = prompt({ additionalLanguages: ["Spanish"] });
    expect(p).toMatch(/You speak English and Spanish/);
    expect(p).toMatch(/Start the call in English/);
  });

  it("says the language's name even when the code was stored", () => {
    // Onboarding writes "en", the Setup editor writes "English" — the prompt must not read
    // "You speak en and Spanish".
    const p = prompt({ language: "en", additionalLanguages: ["es"] });
    expect(p).toMatch(/You speak English and Spanish/);
    expect(p).not.toMatch(/You speak en/);
  });

  it("ignores an extra language that is really the primary again", () => {
    const p = prompt({ language: "English", additionalLanguages: ["en", "English"] });
    expect(p).toMatch(/Primary language: English/);
    expect(p).not.toMatch(/You speak/);
  });
});

describe("it survives the migration not being applied yet", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("reads the new column separately so the Setup page cannot 500 on it", () => {
    const model = read("src/lib/platform/readModel/employeeProfile.ts");
    expect(model).toMatch(/CONFIG_COLUMNS_WITH_LANGUAGES/);
    expect(model).toMatch(/NO_ADDITIONAL_LANGUAGES/);
  });

  it("still saves the rest of the form if the column is missing", () => {
    const actions = read("src/app/(app)/dashboard/settings/_actions/agents.ts");
    expect(actions).toMatch(/retrying save without additional_languages/);
  });
});

/**
 * Found on production, in the rendered page (2026-08-28).
 *
 * The Setup editor offered "English" under "Also understands" on an employee whose language WAS
 * English. The primary is stored as the code "en" by onboarding and as the label "English" by
 * this editor — R-135's split again — so a filter comparing raw strings never matched. Everything
 * on this seam now compares through `toLanguageCode`, and the new column stores codes only.
 */
describe("the primary language is never offered as an extra", () => {
  it("filters it out whichever way it was stored", () => {
    for (const stored of ["en", "English", "eng", "en-GB"]) {
      const state = toSetupFormState({
        name: "Front Desk",
        language: stored,
        additionalLanguages: ["English", "en", "Spanish"],
        timezone: null,
        behaviorPreset: null,
        agentType: null,
        firstMessage: "Hi",
        emphasisPoints: null,
        businessContext: null,
      });
      expect(state.additionalLanguages, `stored as "${stored}"`).toEqual(["es"]);
    }
  });

  it("cannot be saved as an extra either, whatever the form sent", () => {
    const payload = toUpdateAgentConfigPayload("a", {
      language: "en",
      additionalLanguages: ["English", "Spanish", "Turkish"],
      timezone: "UTC",
      behaviorPresetId: null,
      agentType: "",
      firstMessage: "Hi",
      emphasisPoints: [],
      businessContext: EMPTY_BUSINESS_CONTEXT,
    });
    // "English" is the primary under another name; "Turkish" has no voice behind it.
    expect(payload.additional_languages).toEqual(["es"]);
  });

  it("stores codes, so nothing downstream has to guess which spelling it got", () => {
    const payload = toUpdateAgentConfigPayload("a", {
      language: "Spanish",
      additionalLanguages: ["English"],
      timezone: "UTC",
      behaviorPresetId: null,
      agentType: "",
      firstMessage: "Hola",
      emphasisPoints: [],
      businessContext: EMPTY_BUSINESS_CONTEXT,
    });
    expect(payload.additional_languages).toEqual(["en"]);
  });
});
