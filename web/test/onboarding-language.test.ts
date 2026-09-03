import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LANGUAGE_CODES } from "@/lib/language/registry";

const ONBOARDING_DIR = path.join(process.cwd(), "src", "app", "(app)", "onboarding");
const CLIENT = fs.readFileSync(path.join(ONBOARDING_DIR, "OnboardingClient.tsx"), "utf8");
const ACTIONS = fs.readFileSync(path.join(ONBOARDING_DIR, "_actions.ts"), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const CLIENT_CODE = stripComments(CLIENT);
const ACTIONS_CODE = stripComments(ACTIONS);

/**
 * ONBOARDING ASKS WHICH LANGUAGE THE AI SPEAKS (2026-09-03).
 *
 * `organization_settings.onboarding_language` was read in three places — the Vapi assistant's
 * transcriber + voice, the `agents` row activation creates, and `resolveWorkspaceLineDefaults`
 * when a BYO number is connected — and written by NOBODY. Every workspace therefore fell through
 * to `?? "en"`, so a business in Türkiye finished onboarding and its AI answered its callers in
 * English until someone found Team → Setup.
 *
 * These are guardrails for the wiring, not for the copy: the question exists, it is asked of
 * everyone rather than only of voice customers, its options come from the language registry, and
 * the value survives the trip to the column activation reads.
 */
describe("onboarding asks for the AI's language", () => {
  it("submits a `language` field from the Goal step's form", () => {
    // The Goal step is the one form every customer posts — chat-only customers skip the phone
    // form entirely, and their agent row reads the same column.
    const goalForm = CLIENT_CODE.slice(
      CLIENT_CODE.indexOf('value="saveGoalLanguage"'),
      CLIENT_CODE.indexOf("currentStep === 2")
    );
    expect(goalForm).toContain('name="language"');
  });

  it("derives the options from the language registry, not a hand-written list", () => {
    // R-135: a picker that outlives the registry offers a language with no ear and no mouth.
    expect(CLIENT_CODE).toMatch(/LANGUAGE_CODES\.map\(/);
    for (const code of LANGUAGE_CODES) {
      // Rendered through the registry's own label rather than repeated as literals.
      expect(CLIENT_CODE).toContain("LANGUAGES[code].label");
    }
  });

  it("does not gate the question on having bought voice", () => {
    // The plan is chosen two steps LATER, so a voice-only question could not be asked here even
    // if it should be — and chat employees are born from this same column.
    const goalForm = CLIENT_CODE.slice(
      CLIENT_CODE.indexOf('value="saveGoalLanguage"'),
      CLIENT_CODE.indexOf("currentStep === 2")
    );
    expect(goalForm).not.toMatch(/planCode|isPlanActive|voicePlan/);
  });

  it("normalizes the submitted value through the registry before saving", () => {
    // An unrecognised code must not reach the Vapi assistant: it would claim a language with no
    // transcriber and no voice behind it.
    expect(ACTIONS_CODE).toMatch(/toLanguageCode\(formData\.get\("language"\)/);
    expect(ACTIONS_CODE).toMatch(/from "@\/lib\/language\/registry"/);
  });

  it("writes onboarding_language, and only when the registry recognised it", () => {
    expect(ACTIONS_CODE).toMatch(/preferences\.language\s*\?\s*\{\s*onboarding_language:/);
  });

  it("still writes the column activation actually reads", () => {
    // The whole point: the wizard's answer must land where the assistant and the agent row are
    // born from. If either read moves, this question stops mattering and nobody notices.
    // Once per path that can create an employee: the Vapi assistant, the voice agent row, the
    // BYO agent row, and the non-voice employee shared by the chat and free-preview paths. The
    // last of these used to read `chatSettings` — the block moved into `ensureNonVoiceEmployee`
    // and the local is now called `settings`, which is why this counts rather than naming both.
    const languageReads = ACTIONS_CODE.match(
      /language:\s*(chat)?[Ss]ettings\?\.onboarding_language\s*\?\?\s*"en"/g
    );
    expect(languageReads?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
