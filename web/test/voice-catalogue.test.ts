import { describe, it, expect } from "vitest";
import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "../src/lib/language/registry";
import {
  HUMANNESS_LABELS,
  defaultVoiceForLanguage,
  findVoiceOption,
  isDefaultVoice,
  voiceLanguageLabels,
  voicesForLanguage,
} from "../src/lib/voice/catalogue";
import { resolveVoice, buildAssistantConfigPatch } from "../src/lib/vapi/assistantConfig";

/**
 * The voice picker's contract (2026-09-02).
 *
 * The bug this file is mostly about: the catalogue did not contain the languages' own DEFAULT
 * voices, so `voicesForLanguage("en")` returned four ElevenLabs voices and none of them was what
 * an English employee actually spoke with. The picker highlighted the first row, so a workspace
 * that had never chosen a voice was told it used "Sarah" while every caller heard Elliot — the
 * product saying one thing and doing another, which is the exact failure mode R-135 was about.
 *
 * So the load-bearing assertion here is the round trip: what the picker shows as selected must
 * resolve, through the same code path Vapi is configured from, to the voice object Vapi receives.
 */

const PROD = { NODE_ENV: "test", VAPI_WEBHOOK_BASE_URL: "https://denku.io" } as NodeJS.ProcessEnv;

describe("voice catalogue — the default is offered, and it leads", () => {
  it("offers at least one voice for every language the registry can speak", () => {
    for (const code of LANGUAGE_CODES) {
      expect(voicesForLanguage(code).length, `${code} must offer a voice`).toBeGreaterThan(0);
    }
  });

  it("contains each language's own default, as the first option", () => {
    for (const code of LANGUAGE_CODES) {
      const first = voicesForLanguage(code)[0];
      expect(isDefaultVoice(code, first), `${code}'s first option must be its default`).toBe(true);
      expect(defaultVoiceForLanguage(code)?.id).toBe(first.id);
    }
  });

  it("reproduces the registry default EXACTLY — provider, id, model, version and language", () => {
    // A "Default" badge on a row that resolves to something else is worse than no badge: the
    // customer would believe they had confirmed what they already had.
    for (const code of LANGUAGE_CODES) {
      const option = defaultVoiceForLanguage(code)!;
      expect(resolveVoice(code, option.id), `${code} default must round-trip`).toEqual(
        resolveVoice(code, null)
      );
      expect(resolveVoice(code, option.id)).toEqual(LANGUAGES[code].voice);
    }
  });

  it("shows English as Elliot, not as the first ElevenLabs voice (the bug)", () => {
    const first = voicesForLanguage("en")[0];
    expect(first.id).toBe("Elliot");
    expect(first.label).toBe("Elliot");
  });
});

describe("voice catalogue — every row's claims are true", () => {
  const everyVoice = LANGUAGE_CODES.flatMap((code) =>
    voicesForLanguage(code).map((v) => [code, v] as const)
  );

  it("only offers a voice under a language it says it speaks", () => {
    for (const [code, voice] of everyVoice) {
      expect(voice.languages, `${voice.id} offered under ${code}`).toContain(code);
    }
  });

  it("names every language it claims, in registry order", () => {
    for (const [, voice] of everyVoice) {
      const labels = voiceLanguageLabels(voice);
      expect(labels.length).toBe(voice.languages.length);
      expect(labels).toEqual(
        LANGUAGE_CODES.filter((c) => voice.languages.includes(c)).map((c) => LANGUAGES[c].label)
      );
    }
  });

  it("keeps `openai/nova` off Turkish — it read Turkish with English prosody on a real call", () => {
    const nova = findVoiceOption("es", "nova")!;
    expect(nova.languages).not.toContain("tr" as LanguageCode);
    expect(voicesForLanguage("tr").some((v) => v.id === "nova")).toBe(false);
  });

  it("carries a humanness rating in range, with a label, and awards no 5", () => {
    for (const [, voice] of everyVoice) {
      expect(voice.humanness).toBeGreaterThanOrEqual(1);
      expect(voice.humanness).toBeLessThanOrEqual(5);
      expect(HUMANNESS_LABELS[voice.humanness]).toBeTruthy();
      // The top of the scale is "indistinguishable from a person". Nothing we ship is, and the
      // day something is, this line is the deliberate place to say so.
      expect(voice.humanness, `${voice.id} may not be rated 5`).toBeLessThan(5);
    }
  });

  it("gives every voice a description and a unique id", () => {
    const ids = new Set<string>();
    for (const [, voice] of everyVoice) {
      expect(voice.description.trim().length, `${voice.id} needs a description`).toBeGreaterThan(0);
      ids.add(voice.id);
    }
    // Ids are stable identifiers stored in `agents.voice`; two rows sharing one would make a
    // customer's stored choice ambiguous.
    const seen = new Map<string, string>();
    for (const [, voice] of everyVoice) {
      const prior = seen.get(voice.id);
      if (prior) expect(prior).toBe(voice.label);
      seen.set(voice.id, voice.label);
    }
    expect(ids.size).toBeGreaterThan(0);
  });
});

describe("voice catalogue — what reaches Vapi", () => {
  it("sends the chosen voice's WHOLE object, provider included", () => {
    // Spreading the default and swapping only the id is how you ask ElevenLabs for an Azure voice.
    for (const code of LANGUAGE_CODES) {
      for (const voice of voicesForLanguage(code)) {
        const patch = buildAssistantConfigPatch({ model: {} }, { language: code, voiceId: voice.id }, PROD);
        const expected: Record<string, unknown> = { provider: voice.provider, voiceId: voice.voiceId };
        if (voice.model) expected.model = voice.model;
        if (voice.version) expected.version = voice.version;
        if (voice.language) expected.language = voice.language;
        expect(patch.voice, `${code}/${voice.id}`).toEqual(expected);
      }
    }
  });

  it("falls back to the language default for a stored value the catalogue does not know", () => {
    // `agents.voice` is NOT NULL with an `alloy` default and older rows hold provider ids like
    // "jennifer" — both must resolve to the language's own voice, not be forwarded to Vapi.
    for (const stored of ["", "alloy", "jennifer", "shimmer"]) {
      expect(resolveVoice("en", stored)).toEqual(LANGUAGES.en.voice);
      expect(findVoiceOption("en", stored)?.id ?? null).toBe(null);
    }
  });

  it("resolves the ids the employee-creation path writes into `agents.voice`", () => {
    // `dashboard/agents/new/actions.ts` stores `resolveVoice(language).voiceId` — the PROVIDER id.
    // The picker has to recognise those rows, or a live workspace reads as "no choice made".
    for (const code of LANGUAGE_CODES) {
      const storedAtCreation = resolveVoice(code).voiceId;
      const found = findVoiceOption(code, storedAtCreation);
      if (found) {
        expect(isDefaultVoice(code, found), `${code}: ${storedAtCreation}`).toBe(true);
      } else {
        // Not in the catalogue is acceptable only because the fallback lands on the same voice.
        expect(resolveVoice(code, storedAtCreation)).toEqual(LANGUAGES[code].voice);
      }
    }
  });
});
