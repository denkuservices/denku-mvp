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
  ADDITIONAL_LANGUAGE_OPTIONS,
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
    // French, like Turkish before 2026-08-31, sits in nobody's picker because there is no voice
    // and no transcriber entry for it. Turkish moved into the registry with both; French did not.
    expect(toLanguageCode("French")).toBeNull();
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
      additionalLanguages: ["English", "Spanish", "Turkish", "French"],
      timezone: "UTC",
      behaviorPresetId: null,
      agentType: "",
      firstMessage: "Hi",
      emphasisPoints: [],
      businessContext: EMPTY_BUSINESS_CONTEXT,
    });
    // "English" is the primary under another name. "French" is not in the registry at all.
    // "Turkish" IS in the registry — but only as a primary language: Deepgram documents it for
    // Nova-3 without saying it takes part in code-switching, so it cannot be a second language
    // until that is verified, and the write boundary enforces that rather than trusting the form.
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

/**
 * The control has to look like a control (2026-08-28).
 *
 * It shipped as toggle pills. With two supported languages that rendered as a single grey word
 * under a heading, and nothing about it said it could be clicked — the owner who asked for the
 * feature could not work out how to turn it on. Pills are for showing state; a checkbox is the
 * one control everybody already reads as "tick this to include it".
 */
describe("adding a language is obviously a thing you can do", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const form = read("src/app/(app)/dashboard/_platform/team/SetupForm.tsx");

  it("is a checkbox, not a pill that looks like a badge", () => {
    expect(form).toMatch(/type="checkbox"/);
    expect(form).not.toMatch(/aria-pressed/);
  });

  it("makes the whole row clickable, not just the box", () => {
    expect(form).toMatch(/<label[\s\S]{0,1200}type="checkbox"/);
    expect(form).toMatch(/cursor-pointer/);
  });

  it("says what ticking one does, naming the primary language", () => {
    expect(form).toMatch(/Tick any language it should answer in besides \$\{primaryLanguageLabel\}/);
  });

  it("describes the off state too, so an empty section reads as a choice", () => {
    expect(form).toMatch(/On calls it only speaks \$\{primaryLanguageLabel\}/);
  });

  it("scopes the limit to CALLS, and says chat has no such limit", () => {
    // These checkboxes are a voice constraint: a language needs an ear that transcribes it and a
    // mouth that speaks it. Chat has neither, and its prompt already tells the AI to follow the
    // customer's language. Stating only the voice half read as "your AI cannot understand
    // Turkish", which is false and loses the customer a channel they already have.
    expect(form).toMatch(/In chat it replies in whichever language the customer writes in/);
  });

  it("still cannot offer the primary language as an extra", () => {
    expect(form).toMatch(/opt\.code !== toLanguageCode\(form\.language\)/);
  });
});

describe("Turkish: a primary language, not yet a second one (added 2026-08-31)", () => {
  it("resolves from every spelling an owner or an old row might hold", () => {
    for (const spelling of ["tr", "Turkish", "türkçe", "TURKCE"]) {
      expect(toLanguageCode(spelling)).toBe("tr");
    }
  });

  it("is offered as a primary language", () => {
    expect(SETUP_LANGUAGES).toContain("Turkish");
  });

  it("is NOT offered as an extra: Deepgram's code-switching set does not include it", () => {
    // `multi` covers exactly ten languages — en, es, fr, de, hi, ru, pt, ja, it, nl. Turkish is a
    // fully supported language on its own but cannot be the SECOND one, so offering it here would
    // let an owner tick a box that quietly does nothing. German, which IS in that set, is offered.
    expect(ADDITIONAL_LANGUAGE_OPTIONS.map((o) => o.code)).not.toContain("tr");
    expect(ADDITIONAL_LANGUAGE_OPTIONS.map((o) => o.code)).toEqual(["en", "es", "de"]);
  });

  it("is dropped from a stored language set rather than silently mistranscribed", () => {
    // Legacy rows can already hold it. The voice stack is configured from this function, so the
    // employee simply does not understand what the ear cannot switch to.
    expect(resolveLanguageSet("en", ["tr", "es"])).toEqual(["en", "es"]);
  });

  it("keeps its own ear and mouth when it is the primary", () => {
    expect(resolveTranscriberForLanguages(["tr"])).toEqual({
      provider: "deepgram",
      model: "nova-3",
      language: "tr",
    });
    // Two real calls decided this. `openai/nova` read Turkish with English stress; Azure's
    // tr-TR neural voice fixed the stress and stayed flat. The model is asserted alongside the
    // provider on purpose: with ElevenLabs, `eleven_turbo_v2` is English-only and silently
    // undoes the whole choice, and it is one character away from the multilingual one.
    expect(resolveVoiceForLanguages(["tr"])).toEqual({
      provider: "11labs",
      voiceId: "sarah",
      model: "eleven_turbo_v2_5",
    });
  });
});
