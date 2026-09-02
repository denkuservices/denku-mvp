/**
 * Prove that every voice in the catalogue is a voice Vapi will actually take.
 *
 *   npx vite-node --config vitest.config.ts scripts/verify-vapi-voices.mts
 *
 * The picker lets a business choose its own voice, and the whole chain between that click and a
 * caller's ear is: `agents.voice` → `findVoiceOption` → `buildAssistantConfigPatch` →
 * `PATCH /assistant/{id}`. The unit tests pin the first three links. This script exercises the
 * fourth against the live API, because a voice object that is correct by our rules and rejected by
 * Vapi's is a setting that saves cleanly and changes nothing — the worst kind of failure, since the
 * dashboard would report success.
 *
 * **It never touches a customer's assistant.** It creates a throwaway one, PATCHes every
 * language × voice combination onto it, reads each one back to confirm Vapi stored what we sent,
 * and deletes it at the end (including on failure). Nothing else in the account is read or written.
 *
 * What it does NOT prove: how a voice sounds. Vapi accepts an arbitrary provider voice id and only
 * resolves it at call time, so acceptance here means "configured", not "verified on a call". The
 * `provenCall` flag in the catalogue is the only claim about how a voice actually sounds, and it is
 * set by a person who listened.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGE_CODES, type LanguageCode } from "../src/lib/language/registry";
import { voicesForLanguage } from "../src/lib/voice/catalogue";
import { buildAssistantConfigPatch } from "../src/lib/vapi/assistantConfig";
import { vapiFetch } from "../src/lib/vapi/server";

/** Minimal `.env.local` reader — this runs outside Next, which is what loads env files normally. */
function loadEnvLocal(): void {
  if (process.env.VAPI_API_KEY) return;
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No file is fine — an operator may have exported the key instead.
  }
}

type Assistant = {
  id: string;
  voice?: Record<string, unknown>;
  model?: { toolIds?: string[]; messages?: unknown; [k: string]: unknown } | null;
};

/**
 * Compare only the keys we sent, and compare them as text.
 *
 * Two deliberate loosenings, both observed on the live API (2026-09-02): Vapi echoes defaults we
 * never sent (`chunkPlan`, `speed`, `fallbackPlan`), and it stores `version: 2` back as the STRING
 * `"2"`. Neither is a mismatch that could change what a caller hears, and a check that failed on
 * them would cry wolf on the one voice — English's Elliot — that every production line runs.
 */
function storedMatches(sent: Record<string, unknown>, stored: Record<string, unknown> | undefined) {
  if (!stored) return false;
  return Object.entries(sent).every(([k, v]) => String(stored[k]) === String(v));
}

async function main() {
  loadEnvLocal();
  if (!process.env.VAPI_API_KEY) {
    console.error("VAPI_API_KEY is not set (checked the environment and web/.env.local).");
    process.exit(1);
  }

  const created = await vapiFetch<Assistant>("/assistant", {
    method: "POST",
    body: JSON.stringify({
      name: `denku-voice-check-${Date.now()}`,
      model: { provider: "openai", model: "gpt-4o" },
    }),
  });
  console.log(`\nthrowaway assistant ${created.id}\n`);

  const failures: string[] = [];
  let checked = 0;

  try {
    for (const language of LANGUAGE_CODES as LanguageCode[]) {
      for (const voice of voicesForLanguage(language)) {
        // The real assistant, exactly as `ensureAssistantConfig` reads it before merging — a
        // synthetic `{ model: {} }` would drop the model provider and fail for a reason that has
        // nothing to do with voices.
        const current = await vapiFetch<Assistant>(`/assistant/${created.id}`, { method: "GET" });
        const patch = buildAssistantConfigPatch(current, { language, voiceId: voice.id });
        const sent = patch.voice as Record<string, unknown>;

        try {
          await vapiFetch(`/assistant/${created.id}`, { method: "PATCH", body: JSON.stringify(patch) });
          const back = await vapiFetch<Assistant>(`/assistant/${created.id}`, { method: "GET" });

          if (storedMatches(sent, back.voice)) {
            console.log(`  ok    ${language}/${voice.id} → ${JSON.stringify(sent)}`);
          } else {
            failures.push(
              `${language}/${voice.id}: sent ${JSON.stringify(sent)}, Vapi stored ${JSON.stringify(back.voice)}`
            );
            console.log(`  DIFF  ${language}/${voice.id}`);
          }
        } catch (err) {
          failures.push(`${language}/${voice.id}: ${err instanceof Error ? err.message : String(err)}`);
          console.log(`  FAIL  ${language}/${voice.id}`);
        }
        checked += 1;
      }
    }
  } finally {
    await vapiFetch(`/assistant/${created.id}`, { method: "DELETE" }).catch((err) =>
      console.error(`could not delete ${created.id} — remove it by hand:`, err)
    );
  }

  console.log(`\n${checked - failures.length}/${checked} voice configurations accepted by Vapi.`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

void main();
