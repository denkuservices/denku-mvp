import { toLanguageCode, type LanguageCode } from "@/lib/language/registry";

/**
 * The first sentence a caller hears, in the language the business chose.
 *
 * This repo already draws the line this file sits on, in `settings/_lib/prompt-derivation.ts`:
 * everything in a system prompt is an *instruction to the model* and may safely be written in
 * English, because the model reads English and answers in the language it was told to — but a
 * sentence quoted under "say exactly" is **speech**, and speech has to be in the caller's
 * language. That distinction was found on 2026-09-03, on the first Turkish workspace, when a
 * Turkish caller heard an English apology at the one moment the call had already gone wrong.
 *
 * `firstMessage` is speech, and it is the most-heard sentence Denku produces: every caller, every
 * call, before anything else. It was hardcoded English in five places, so a workspace that picked
 * Turkish in onboarding got a Turkish ear, a Turkish voice, and an English hello. Denku had
 * already localised the greeting of its OWN marketing demo (`lib/marketing/demoCall.ts`) into
 * these same four languages while leaving its customers' in English.
 *
 * A language with no entry falls back to English — the same rule `SPOKEN_FALLBACK` uses, and for
 * the same reason: adding a language to the registry must never silently change an existing
 * workspace's greeting, and `en` stays byte-for-byte what it always was.
 */

/** With the business named. */
const WITH_NAME: Record<LanguageCode, (name: string) => string> = {
  // The exact sentence the employee editor has always prefilled. English is deliberately
  // unchanged by this file: a workspace that never picked a language keeps the greeting it
  // already had, and `test/sprint10-one-employee.test.ts` pins that.
  en: (name) => `Hello, thanks for calling ${name}. How can I help you today?`,
  es: (name) => `Hola, gracias por llamar a ${name}. ¿En qué puedo ayudarle?`,
  de: (name) => `Hallo, danke für Ihren Anruf bei ${name}. Wie kann ich Ihnen helfen?`,
  /*
   * Turkish puts the business in a position that takes no case suffix, on purpose. The natural
   * phrasing ("NOTUS Uniform'a hoş geldiniz") needs 'a or 'e depending on the last vowel of a name
   * we do not control, and a generated greeting that gets a customer's own name wrong is worse
   * than a plainer one that never does.
   */
  tr: (name) => `Merhaba, ben ${name} asistanı. Size nasıl yardımcı olabilirim?`,
};

/** When the business name is not known at the point the line is created. */
const WITHOUT_NAME: Record<LanguageCode, string> = {
  en: "Hi, thanks for calling. How can I help you today?",
  es: "Hola, gracias por llamar. ¿En qué puedo ayudarle?",
  de: "Hallo, danke für Ihren Anruf. Wie kann ich Ihnen helfen?",
  tr: "Merhaba, size nasıl yardımcı olabilirim?",
};

/**
 * Build the default opening line. Pure.
 *
 * `language` accepts whatever the workspace happens to store — a code (`tr`) or a name
 * (`Turkish`), which the product has both of — and anything unrecognised resolves to English
 * rather than throwing: a line that will not provision is worse than one that opens in English.
 */
export function defaultGreeting(
  language?: string | null,
  businessName?: string | null,
): string {
  const code: LanguageCode = toLanguageCode(language) ?? "en";
  const name = businessName?.trim();
  return name ? WITH_NAME[code](name) : WITHOUT_NAME[code];
}
