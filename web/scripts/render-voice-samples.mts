/**
 * Render one audio sample per voice, per language, into `web/public/voice-samples/`.
 *
 *   npx vite-node --config vitest.config.ts scripts/render-voice-samples.mts
 *
 * The voice picker in Setup is only honest because the customer can hear a voice before choosing
 * it — three voices were tried on the first Turkish line before one was right, and each round cost
 * a deploy. The picker's `<audio>` element points at the files this writes and stays silent when
 * one is missing, so running this is what turns a list of adjectives into a decision someone can
 * actually make.
 *
 * **Keys.** Vapi bundles these voices, but Vapi will not render a standalone sample — so this talks
 * to the providers directly and needs their own keys:
 *
 *   ELEVENLABS_API_KEY   for the multilingual voices
 *   AZURE_SPEECH_KEY     + AZURE_SPEECH_REGION for the native ones
 *
 * A missing key skips that family with a line on stdout rather than failing the run: half a
 * gallery is useful, and an operator with one account should not be blocked by the other.
 *
 * The output is committed on purpose. These are a handful of small files that every customer's
 * browser fetches, and regenerating them on deploy would mean paying a TTS bill to say the same
 * sentence again.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGE_CODES, type LanguageCode } from "../src/lib/language/registry";
import { voicesForLanguage, type VoiceOption } from "../src/lib/voice/catalogue";

/**
 * What each sample says.
 *
 * A greeting rather than a pangram: the customer is judging how their own callers will be met, and
 * the first sentence of a real call is the thing being decided. Written by a native speaker of each
 * language rather than translated, so the prosody being judged is the prosody they will get.
 */
const SAMPLE_TEXT: Record<LanguageCode, string> = {
  en: "Hello, thanks for calling. How can I help you today?",
  es: "Hola, gracias por llamar. ¿En qué puedo ayudarle?",
  de: "Guten Tag, danke für Ihren Anruf. Wie kann ich Ihnen helfen?",
  tr: "Merhaba, aradığınız için teşekkürler. Size nasıl yardımcı olabilirim?",
};

const OUT_DIR = join(process.cwd(), "public", "voice-samples");

async function renderElevenLabs(voice: VoiceOption, text: string): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: voice.model ?? "eleven_turbo_v2_5" }),
    }
  );
  if (!res.ok) {
    console.warn(`  ! ElevenLabs ${voice.id}: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function renderAzure(voice: VoiceOption, text: string): Promise<Buffer | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;

  // Escape before interpolating: a sample sentence is our own text today, and SSML that breaks on
  // an apostrophe is a trap for whoever adds the next language.
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const locale = voice.voiceId.split("-").slice(0, 2).join("-");
  const ssml = `<speak version='1.0' xml:lang='${locale}'><voice name='${voice.voiceId}'>${escaped}</voice></speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    body: ssml,
  });
  if (!res.ok) {
    console.warn(`  ! Azure ${voice.id}: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  if (!process.env.ELEVENLABS_API_KEY) console.log("· ELEVENLABS_API_KEY not set — skipping those voices");
  if (!process.env.AZURE_SPEECH_KEY) console.log("· AZURE_SPEECH_KEY not set — skipping those voices");

  let written = 0;
  for (const language of LANGUAGE_CODES) {
    const text = SAMPLE_TEXT[language];
    console.log(`\n${language}: ${text}`);

    for (const voice of voicesForLanguage(language)) {
      const audio =
        voice.provider === "11labs"
          ? await renderElevenLabs(voice, text)
          : voice.provider === "azure"
            ? await renderAzure(voice, text)
            : null;

      if (!audio) continue;

      const file = join(OUT_DIR, `${language}-${voice.id}.mp3`);
      writeFileSync(file, audio);
      written += 1;
      console.log(`  ✓ ${voice.label} → ${language}-${voice.id}.mp3`);
    }
  }

  console.log(`\n${written} sample${written === 1 ? "" : "s"} written to public/voice-samples/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
