/**
 * What Denku can actually hear and speak (2026-08-28).
 *
 * Three lists used to describe one capability, in three files: the workspace picker
 * (`LANGUAGE_OPTIONS`), the employee Setup picker (`SETUP_LANGUAGES`), and the voice/transcriber
 * defaults in `assistantConfig`. R-135 is what happens when they disagree — Turkish sat in two
 * pickers with no voice behind it, so a workspace set to Turkish answered its callers in English
 * while three screens said otherwise. The pickers now derive from this file, so a language that
 * cannot be heard and spoken cannot be offered.
 *
 * Adding a language means proving it end to end HERE — an ear that transcribes it, a mouth that
 * speaks it — and the pickers follow. That is the whole point: the registry is the limit, and the
 * limit is honest.
 *
 * Pure and client-safe: the Setup form imports it too.
 */

export type LanguageCode = "en" | "es" | "de" | "tr";

export interface LanguageCapability {
  code: LanguageCode;
  /** What a customer sees, and the NAME form the Setup editor persists. */
  label: string;
  /** Every spelling seen in storage. Lowercase. Locale forms ("es-MX") fall back to the base tag. */
  aliases: readonly string[];
  /** Deepgram model when this is the only language — pinned is the most accurate the ear gets. */
  transcriberModel: string;
  /** The Vapi `voice` object for this language. */
  voice: Readonly<{ provider: string; voiceId: string; version?: number; language?: string }>;
  /**
   * Can this voice follow whichever language the brain answered in?
   *
   * Only a voice that can decides what a multilingual employee sounds like. A voice pinned to one
   * language would read Spanish text with an English mouth — worse than the problem it solves.
   */
  voiceFollowsCaller: boolean;
  /** Can this language take part in multilingual code-switching on the transcriber? */
  codeSwitch: boolean;
}

export const LANGUAGES: Readonly<Record<LanguageCode, LanguageCapability>> = {
  en: {
    code: "en",
    label: "English",
    aliases: ["en", "eng", "english"],
    transcriberModel: "nova-3",
    voice: { provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" },
    voiceFollowsCaller: true,
    codeSwitch: true,
  },
  es: {
    code: "es",
    label: "Spanish",
    aliases: ["es", "spa", "spanish", "español", "espanol", "castellano"],
    // Spanish stays on nova-2 and OpenAI TTS: nova-3's gains and the Vapi V2 voice ids are
    // English-first, and swapping a language nobody has reported on trades something known to
    // work for something unverified.
    transcriberModel: "nova-2",
    voice: { provider: "openai", voiceId: "nova" },
    voiceFollowsCaller: false,
    codeSwitch: true,
  },
  de: {
    code: "de",
    label: "German",
    aliases: ["de", "deu", "ger", "german", "deutsch"],
    // Deepgram documents German for Nova-3, AND `de` is one of the ten languages in the `multi`
    // code-switching set (en, es, fr, de, hi, ru, pt, ja, it, nl) — checked against Deepgram's
    // models-languages overview, not assumed. So unlike Turkish, German can be a second language.
    transcriberModel: "nova-3",
    // OpenAI TTS, the same mouth Spanish uses. ⚠ Pending the first real German call, like Turkish:
    // added because the marketing site now serves German visitors a German page and the demo has
    // to answer in the language it is being read in.
    voice: { provider: "openai", voiceId: "nova" },
    voiceFollowsCaller: false,
    codeSwitch: true,
  },
  tr: {
    code: "tr",
    label: "Turkish",
    aliases: ["tr", "tur", "turkish", "türkçe", "turkce", "türkce", "turkçe"],
    // Deepgram added Turkish to Nova-3 (batch AND streaming) — verified against Deepgram's own
    // announcement, not inferred. This is the ear.
    transcriberModel: "nova-3",
    // The mouth: OpenAI TTS, the same choice Spanish makes. It reads whatever language the text
    // is in, which is what a Turkish-primary employee needs.
    //
    // ⚠ PENDING FIRST REAL CALL. Turkish was removed from the pickers in R-135 precisely because
    // it was offered with nothing behind it. It is back because an operator asked for it and is
    // about to place a real Turkish call on a connected line — the transcript and the recording
    // from that call are the verification. If it does not hold up, this entry comes out again
    // rather than being quietly tolerated.
    voice: { provider: "openai", voiceId: "nova" },
    voiceFollowsCaller: false,
    // VERIFIED FALSE (2026-08-31): Deepgram's `multi` code-switching option covers exactly ten
    // languages — en, es, fr, de, hi, ru, pt, ja, it, nl — and Turkish is not among them. It is a
    // fully supported language on its own; it simply cannot be the SECOND one. This is no longer
    // caution about a gap in the docs, it is what the docs say.
    codeSwitch: false,
  },
} as const;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

/** The Deepgram model used when an employee understands more than one language. */
export const MULTILINGUAL_TRANSCRIBER_MODEL = "nova-3";

/**
 * The voice a multilingual employee speaks with.
 *
 * Used when the primary language's own voice cannot follow the caller — a Spanish-primary
 * employee that also understands English needs a mouth that can do both, and OpenAI's `nova` is
 * pinned. Callers hear this voice speaking their own language, not an English accent.
 */
export const MULTILINGUAL_VOICE = LANGUAGES.en.voice;

/** Every alias in one lookup. Built once. */
const BY_ALIAS: Readonly<Record<string, LanguageCode>> = Object.fromEntries(
  LANGUAGE_CODES.flatMap((code) => LANGUAGES[code].aliases.map((a) => [a, code]))
);

/**
 * Normalize any stored language string to a supported code, or null when it is not one.
 *
 * Callers that must have a language use `resolveLanguage`, which falls back to English. This one
 * returns null so a caller can tell "not set" from "set to something we cannot speak".
 */
export function toLanguageCode(language?: string | null): LanguageCode | null {
  const raw = (language ?? "").trim().toLowerCase();
  if (!raw) return null;
  const exact = BY_ALIAS[raw];
  if (exact) return exact;
  // "es-ES" / "es_MX" / "en-GB" → base subtag
  return BY_ALIAS[raw.split(/[-_]/)[0]] ?? null;
}

/**
 * The full ordered language list for an employee: primary first, then the extras it also
 * understands. Deduplicated, unknown values dropped, primary always present.
 *
 * This is the one function that turns what is stored (`agents.language` +
 * `agents.additional_languages`) into what the voice stack is configured from.
 */
export function resolveLanguageSet(
  primary?: string | null,
  additional?: readonly string[] | null
): LanguageCode[] {
  const head = toLanguageCode(primary) ?? "en";
  const out: LanguageCode[] = [head];
  for (const raw of additional ?? []) {
    const code = toLanguageCode(raw);
    if (!code || out.includes(code)) continue;
    // `codeSwitch` used to be metadata nobody read. It is enforced here because this is the one
    // function the voice stack is configured from: adding a second language switches the ear to
    // code-switching, and a language the switching model cannot handle would be transcribed as
    // noise while three screens claimed the employee understood it. Dropping it is the honest
    // outcome — the employee does not understand what we cannot hear.
    if (!LANGUAGES[code].codeSwitch) continue;
    out.push(code);
  }
  return out;
}
