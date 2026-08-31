import { resolveTranscriber, resolveVoice } from "@/lib/vapi/assistantConfig";
import { toLanguageCode, type LanguageCode } from "@/lib/language/registry";

/**
 * The marketing demo call, in the language the page is being read in.
 *
 * A German visitor now gets a German landing page (the middleware picks the locale from the
 * visitor's country). An English-speaking demo under a German page is the same class of mismatch
 * R-135 was about: the product saying one thing and doing another. So the call is started with
 * per-call overrides for the language.
 *
 * **Overrides, never a PATCH.** The demo assistant (`155b21ad…`) is a shared, live object — it is
 * also bound to a real phone number. Editing it to speak German would change what that phone line
 * does. Vapi's `assistantOverrides` apply to ONE call and leave the assistant alone, which is why
 * this returns a payload rather than reconfiguring anything.
 *
 * **What is deliberately NOT overridden: the model and its system prompt.** That prompt is what
 * makes the demo a good demo, and replacing it to bolt on "answer in German" would trade the
 * demo's quality for a language hint the model does not need — GPT-4o answers in the language it
 * is spoken to. The two things it cannot infer are the ear (the transcriber must be told which
 * language to expect) and the mouth (the voice), and those are exactly what is set here.
 */

/** The greeting, in each language the marketing site is served in. */
const DEMO_GREETING: Record<LanguageCode, string> = {
  en: "Hi — thanks for calling Denku. What would you like to know?",
  es: "Hola, gracias por llamar a Denku. ¿Qué te gustaría saber?",
  de: "Hallo, danke für Ihren Anruf bei Denku. Was möchten Sie wissen?",
  tr: "Merhaba, Denku'yu aradığınız için teşekkürler. Ne öğrenmek istersiniz?",
};

export interface DemoAssistantOverrides {
  firstMessage: string;
  voice: { provider: string; voiceId: string; version?: number; language?: string };
  transcriber: { provider: string; model: string; language: string };
}

/**
 * Build the per-call overrides for a locale. Pure.
 *
 * An unknown or missing locale resolves to English rather than throwing — a demo that refuses to
 * start is worse than a demo in the wrong language, and this runs on the visitor's first click.
 */
export function demoAssistantOverrides(locale?: string | null): DemoAssistantOverrides {
  const code: LanguageCode = toLanguageCode(locale) ?? "en";
  return {
    firstMessage: DEMO_GREETING[code],
    voice: resolveVoice(code),
    transcriber: resolveTranscriber(code),
  };
}
