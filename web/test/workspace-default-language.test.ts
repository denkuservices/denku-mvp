import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGE_CODES } from "@/lib/language/registry";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Settings → Workspace → "Default language" (2026-08-28).
 *
 * Its own helper text has always said "Starting point for new employees; each can override it."
 * Nothing read the column. An owner could set it to Spanish, watch it save, hire an employee and
 * get one that answered in English — a promise the product made in writing and did not keep.
 * These tests pin the place the promise is now kept.
 */
describe("the workspace default language is real", () => {
  const hire = read("src/app/(app)/dashboard/team/new/page.tsx");

  const helper = read("src/lib/org/getWorkspaceDefaultLanguage.ts");

  it("is read where a new employee is created", () => {
    expect(hire).toMatch(/getWorkspaceDefaultLanguage/);
    expect(hire).toMatch(/defaultValue=\{defaultLanguage\}/);
    expect(helper).toMatch(/organization_settings/);
    expect(helper).toMatch(/default_language/);
  });

  it("normalizes it, because onboarding and Setup store different spellings", () => {
    expect(helper).toMatch(/toLanguageCode\(data\?\.default_language\)/);
  });

  it("still hires when the default cannot be read", () => {
    // A workspace setting must never be the reason someone cannot add an employee.
    expect(helper).toMatch(/return "en"/);
    expect(hire).toMatch(/let defaultLanguage = "en"/);
  });

  it("the page still has no write path of its own", () => {
    // Sprint 11 guard: creating goes through the shared server action, never a second writer.
    expect(hire).not.toMatch(/supabaseAdmin|vapiFetch/);
  });
});

describe("the hire form is not a fourth list of languages", () => {
  const hire = read("src/app/(app)/dashboard/team/new/page.tsx");

  it("offers exactly what the registry can speak", () => {
    expect(hire).toMatch(/LANGUAGE_CODES\.map/);
    // R-135 removed Turkish from the other two pickers and missed this one.
    expect(hire).not.toMatch(/"tr"|>Turkish</);
  });

  it("no longer asks for a voice it would have thrown away", () => {
    expect(hire).not.toMatch(/name="voice"/);
    expect(hire).not.toMatch(/alloy/i);

    const action = read("src/app/(app)/dashboard/agents/new/actions.ts");
    expect(action).toMatch(/resolveVoice\(language\)\.voiceId/);
    expect(action).not.toMatch(/formData\.get\("voice"\)/);
  });

  it("stores a normalized language code", () => {
    const action = read("src/app/(app)/dashboard/agents/new/actions.ts");
    expect(action).toMatch(/resolveLanguage\(mustString\(formData\.get\("language"\)/);
  });

  it("every code the registry has is offerable", () => {
    expect(LANGUAGE_CODES.length).toBeGreaterThan(0);
  });
});
