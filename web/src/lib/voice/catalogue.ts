import { LANGUAGES, LANGUAGE_CODES, type LanguageCode } from "@/lib/language/registry";

/**
 * The voices a customer may choose from, and why the list can be longer than the one we have
 * personally heard on a live call.
 *
 * The registry's rule is that Denku never offers a language it cannot actually speak (R-135), and
 * that rule was earned: Turkish sat in two pickers for months with nothing behind it. This
 * catalogue does not weaken it — every entry here speaks the languages it claims.
 *
 * What it relaxes is who does the judging. Choosing between two voices that both work is a matter
 * of taste, and it is the business's taste, not ours: a shop owner knows whether their customers
 * should hear a warm voice or a brisk one.
 *
 * **There is no audio preview, by decision (2026-09-02).** An earlier design fetched vendor samples
 * so a voice could be auditioned in the dashboard; the owner cut it, because a generic English clip
 * is not the thing being judged and the honest version — a rendered greeting per language — costs
 * two provider keys and a build step to maintain a feature nobody asked for. What carries the choice
 * instead is written down here and must therefore stay TRUE: the `description`, the `humanness`
 * rating, and `provenCall` for the voices a person has actually heard answer a call. A voice is
 * changed by picking it and listening to the next real call — one save, no deploy, which is the
 * thing that used to be expensive.
 *
 * Three families, for three reasons:
 *
 *   - **The language's own default** — the voice the registry already stands behind, and the one
 *     a customer who never opens the picker is served by. It is listed here (2026-09-02) because
 *     it was NOT, and a list that omits the running voice cannot tell the truth about what is
 *     selected: an English employee showed "Sarah" ticked while every caller heard Elliot.
 *   - **ElevenLabs on `eleven_turbo_v2_5`** — one multilingual model, many voices, available in
 *     every language. The MODEL is what makes them intelligible; `eleven_turbo_v2` without the
 *     `_5` is English-only and would quietly undo the whole thing.
 *   - **A provider's own native voices**, where they exist — trained on the language rather than
 *     reading it. Azure's `tr-TR` pair is the case we measured on a real call: genuinely Turkish,
 *     correct stress, and flatter than ElevenLabs. Kept because "plain and correct" is the right
 *     trade for some businesses, and because a second family is insurance against one vendor.
 */

/**
 * How close to a person this voice sounds, 1–5. **Denku's own rating, not a vendor score.**
 *
 * Vapi's API publishes no such number — `GET /voice-library/{provider}` returns name, gender,
 * accent, description and a preview, and nothing else (checked 2026-09-02 against the live API and
 * the OpenAPI schema). So this is a judgement, and it is written down rather than implied so it can
 * be argued with: it rates the SYNTHESIS, not the personality, and it moves only when someone hears
 * something new on a real call.
 *
 * The bands are what we have actually observed:
 *
 *   5 — indistinguishable from a person on the phone. **Nothing here is a 5**, deliberately. The
 *       top of the scale is left empty rather than awarded to the best of what we ship.
 *   4 — natural rhythm and stress; a caller notices it is synthetic only if they think about it.
 *   3 — clear and correct, with audibly even delivery.
 *   2 — correct pronunciation, flat prosody. Reads a sentence rather than meaning one.
 *   1 — obviously synthetic.
 */
export type Humanness = 1 | 2 | 3 | 4 | 5;

export const HUMANNESS_LABELS: Readonly<Record<Humanness, string>> = {
  5: "Indistinguishable",
  4: "Very natural",
  3: "Natural",
  2: "Plain",
  1: "Robotic",
};

/** One line the picker can put under the scale, so the number is never bare. */
export const HUMANNESS_LEGEND =
  "Humanness is Denku's own 1–5 rating of how lifelike a voice sounds on a call — not a score from the voice provider.";

export interface VoiceOption {
  /** Stored in `agents.voice`. Stable — changing one renames a customer's chosen voice. */
  id: string;
  label: string;
  /** Shown so a list can be scanned. Never used for logic. */
  timbre: "female" | "male";
  /** Where it sounds like it is from, when the provider says. Omitted rather than guessed. */
  accent?: string;
  /** One line of honest character. No adjective we would not defend on a recording. */
  description: string;
  /** See {@link Humanness}. Ours, not the vendor's. */
  humanness: Humanness;
  /**
   * The languages this voice speaks well — the picker offers it under these and no others.
   *
   * Explicit per voice rather than "multilingual: true", because the two families disagree about
   * what multilingual means: ElevenLabs on `eleven_turbo_v2_5` genuinely covers all four, while
   * OpenAI's `nova` was moved OFF Turkish for reading it with English prosody (see the registry).
   * A boolean would have carried it straight back.
   */
  languages: readonly LanguageCode[];
  provider: string;
  voiceId: string;
  model?: string;
  version?: number;
  language?: string;
  /**
   * True only where a real call has been placed and listened to. The picker says so, because
   * someone choosing a voice deserves to know which ones we have actually heard in production.
   */
  provenCall?: boolean;
}

/** Every language the product supports — what a voice with no language limit covers. */
const EVERY_LANGUAGE: readonly LanguageCode[] = LANGUAGE_CODES;

/**
 * The registry defaults, as selectable options.
 *
 * These are not new voices — they are the ones already running. `LANGUAGES[lang].voice` is what an
 * employee speaks with when `agents.voice` is empty, and until 2026-09-02 the picker did not list
 * them, so the first ElevenLabs row was highlighted instead and the UI named a voice no caller
 * heard. Each entry below reproduces its registry object EXACTLY (provider, id, version, language);
 * the parity test fails if the two ever drift, because a "default" that resolves to something else
 * is the same lie in a new place.
 *
 * The ids are the provider's own voice ids on purpose: `dashboard/agents/new/actions.ts` writes
 * `resolveVoice(language).voiceId` into `agents.voice` at creation, so rows already exist holding
 * "Elliot" and "nova". Matching those ids means the picker reads an existing workspace correctly
 * instead of falling through to a guess.
 */
const DEFAULTS: readonly VoiceOption[] = [
  {
    id: "Elliot",
    label: "Elliot",
    timbre: "male",
    accent: "Canadian",
    description: "Vapi's own voice — calm, quick to answer, and the shortest silence between turns.",
    humanness: 4,
    languages: ["en"],
    provider: "vapi",
    voiceId: "Elliot",
    version: 2,
    language: "auto",
    // Every English line in production has run on this voice, including the first call that
    // produced an appointment end to end (2026-08-27).
    provenCall: true,
  },
  {
    id: "nova",
    label: "Nova",
    timbre: "female",
    description: "OpenAI's voice — clear and even, with less colour than the ElevenLabs voices.",
    humanness: 3,
    // NOT Turkish. `openai/nova` read Turkish with English prosody on a real call and was replaced
    // for it (registry, 2026-09-01). It stays the default for Spanish and German.
    languages: ["es", "de"],
    provider: "openai",
    voiceId: "nova",
  },
] as const;

/** Multilingual by model, so these appear under every language. */
const ELEVENLABS: readonly VoiceOption[] = [
  {
    id: "sarah",
    label: "Sarah",
    timbre: "female",
    accent: "American",
    description: "Warm and unhurried, with a reassuring, professional tone. The default for most businesses.",
    humanness: 4,
    languages: EVERY_LANGUAGE,
    provider: "11labs",
    voiceId: "sarah",
    model: "eleven_turbo_v2_5",
    provenCall: true,
  },
  {
    id: "matilda",
    label: "Matilda",
    timbre: "female",
    accent: "American",
    description: "Brighter and quicker than Sarah — a pleasing alto that keeps a call moving.",
    humanness: 4,
    languages: EVERY_LANGUAGE,
    provider: "11labs",
    voiceId: "matilda",
    model: "eleven_turbo_v2_5",
  },
  {
    id: "joseph",
    label: "Joseph",
    timbre: "male",
    description: "Calm and even. Reads long answers well.",
    humanness: 4,
    languages: EVERY_LANGUAGE,
    provider: "11labs",
    voiceId: "joseph",
    model: "eleven_turbo_v2_5",
  },
  {
    id: "mark",
    label: "Mark",
    timbre: "male",
    description: "Direct and businesslike.",
    humanness: 4,
    languages: EVERY_LANGUAGE,
    provider: "11labs",
    voiceId: "mark",
    model: "eleven_turbo_v2_5",
  },
] as const;

/** Voices trained on one language rather than reading it. */
const NATIVE: readonly VoiceOption[] = [
  {
    id: "tr-TR-EmelNeural",
    label: "Emel",
    timbre: "female",
    accent: "Turkish",
    description: "Native Turkish. Correct stress and plain delivery — accurate rather than expressive.",
    // Heard on a real call (2026-09-01): genuinely Turkish, and flat. That is what a 2 is.
    humanness: 2,
    languages: ["tr"],
    provider: "azure",
    voiceId: "tr-TR-EmelNeural",
    provenCall: true,
  },
  {
    id: "tr-TR-AhmetNeural",
    label: "Ahmet",
    timbre: "male",
    accent: "Turkish",
    description: "Native Turkish, the male counterpart to Emel. Same accuracy, same flat delivery.",
    humanness: 2,
    languages: ["tr"],
    provider: "azure",
    voiceId: "tr-TR-AhmetNeural",
  },
] as const;

/** Declaration order decides the order inside a language, after the default is hoisted. */
const ALL_VOICES: readonly VoiceOption[] = [...DEFAULTS, ...NATIVE, ...ELEVENLABS];

/** True when this option resolves to exactly what the language would use with no choice made. */
export function isDefaultVoice(language: LanguageCode, voice: VoiceOption): boolean {
  const def = LANGUAGES[language].voice;
  return voice.provider === def.provider && voice.voiceId === def.voiceId;
}

/**
 * Every voice offered for a language, the registry's default first.
 *
 * The default leads because it is the one Denku stands behind for that language, and a customer
 * who never opens this list must still get the best answer we have.
 */
export function voicesForLanguage(language: LanguageCode): VoiceOption[] {
  const pool = ALL_VOICES.filter((v) => v.languages.includes(language));
  return [
    ...pool.filter((v) => isDefaultVoice(language, v)),
    ...pool.filter((v) => !isDefaultVoice(language, v)),
  ];
}

/**
 * The option a language falls back to when nothing is chosen.
 *
 * Returns null only if a registry default is not in the catalogue at all — which the parity test
 * forbids. Callers still handle null rather than assert, because a picker that throws on a
 * misconfigured language is worse than one that shows a list.
 */
export function defaultVoiceForLanguage(language: LanguageCode): VoiceOption | null {
  return voicesForLanguage(language).find((v) => isDefaultVoice(language, v)) ?? null;
}

/** Resolve a stored `agents.voice` to a full voice object, or null when it is not offered here. */
export function findVoiceOption(
  language: LanguageCode,
  voiceId: string | null | undefined
): VoiceOption | null {
  const id = (voiceId ?? "").trim();
  if (!id) return null;
  return voicesForLanguage(language).find((v) => v.id === id) ?? null;
}


/** The display names of the languages a voice speaks, in registry order. */
export function voiceLanguageLabels(voice: VoiceOption): string[] {
  return LANGUAGE_CODES.filter((c) => voice.languages.includes(c)).map((c) => LANGUAGES[c].label);
}
