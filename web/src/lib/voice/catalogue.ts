import { LANGUAGES, type LanguageCode } from "@/lib/language/registry";

/**
 * The voices a customer may choose from, and why the list can be longer than the one we have
 * personally heard on a live call.
 *
 * The registry's rule is that Denku never offers a language it cannot actually speak (R-135), and
 * that rule was earned: Turkish sat in two pickers for months with nothing behind it. This
 * catalogue does not weaken it — every entry here speaks its language.
 *
 * What it relaxes is who does the judging. Choosing between two voices that both work is a matter
 * of taste, and it is the business's taste, not ours: a shop owner knows whether their customers
 * should hear a warm voice or a brisk one. The sample is what makes that safe to delegate — nobody
 * picks a voice here without hearing it first, so the picker verifies itself in the only way that
 * matters to the person choosing.
 *
 * Two families, for two reasons:
 *
 *   - **ElevenLabs on `eleven_turbo_v2_5`** — one multilingual model, many voices, available in
 *     every language. The MODEL is what makes them intelligible; `eleven_turbo_v2` without the
 *     `_5` is English-only and would quietly undo the whole thing.
 *   - **A provider's own native voices**, where they exist — trained on the language rather than
 *     reading it. Azure's `tr-TR` pair is the case we measured on a real call: genuinely Turkish,
 *     correct stress, and flatter than ElevenLabs. Kept because "plain and correct" is the right
 *     trade for some businesses, and because a second family is insurance against one vendor.
 */

export interface VoiceOption {
  /** Stored in `agents.voice`. Stable — changing one renames a customer's chosen voice. */
  id: string;
  label: string;
  /** Shown so a list can be scanned. Never used for logic. */
  timbre: "female" | "male";
  /** One line of honest character. No adjective we would not defend on a recording. */
  description: string;
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

/** Multilingual by model, so these appear under every language. */
const ELEVENLABS: readonly VoiceOption[] = [
  {
    id: "sarah",
    label: "Sarah",
    timbre: "female",
    description: "Warm and unhurried. The default for most businesses.",
    provider: "11labs",
    voiceId: "sarah",
    model: "eleven_turbo_v2_5",
    provenCall: true,
  },
  {
    id: "matilda",
    label: "Matilda",
    timbre: "female",
    description: "Brighter and quicker than Sarah.",
    provider: "11labs",
    voiceId: "matilda",
    model: "eleven_turbo_v2_5",
  },
  {
    id: "joseph",
    label: "Joseph",
    timbre: "male",
    description: "Calm and even. Reads long answers well.",
    provider: "11labs",
    voiceId: "joseph",
    model: "eleven_turbo_v2_5",
  },
  {
    id: "mark",
    label: "Mark",
    timbre: "male",
    description: "Direct and businesslike.",
    provider: "11labs",
    voiceId: "mark",
    model: "eleven_turbo_v2_5",
  },
] as const;

/** Voices trained on one language rather than reading it. */
const NATIVE: Partial<Record<LanguageCode, readonly VoiceOption[]>> = {
  tr: [
    {
      id: "tr-TR-EmelNeural",
      label: "Emel",
      timbre: "female",
      description: "Native Turkish. Correct and even — plainer than Sarah.",
      provider: "azure",
      voiceId: "tr-TR-EmelNeural",
      provenCall: true,
    },
    {
      id: "tr-TR-AhmetNeural",
      label: "Ahmet",
      timbre: "male",
      description: "Native Turkish, the male counterpart to Emel.",
      provider: "azure",
      voiceId: "tr-TR-AhmetNeural",
    },
  ],
};

/**
 * Every voice offered for a language, the registry's default first.
 *
 * The default leads because it is the one Denku stands behind for that language, and a customer
 * who never opens this list must still get the best answer we have.
 */
export function voicesForLanguage(language: LanguageCode): VoiceOption[] {
  const defaultVoice = LANGUAGES[language].voice;
  const pool = [...(NATIVE[language] ?? []), ...ELEVENLABS];

  const isDefault = (v: VoiceOption) =>
    v.provider === defaultVoice.provider && v.voiceId === defaultVoice.voiceId;

  return [...pool.filter(isDefault), ...pool.filter((v) => !isDefault(v))];
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

/** Where a rendered sample lives, if one has been generated for this pair. */
export function voiceSamplePath(language: LanguageCode, voiceOptionId: string): string {
  return `/voice-samples/${language}-${voiceOptionId}.mp3`;
}
