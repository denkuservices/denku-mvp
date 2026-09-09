import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defaultGreeting } from "@/lib/language/greeting";
import { LANGUAGE_CODES } from "@/lib/language/registry";

/**
 * The first sentence a caller hears.
 *
 * `prompt-derivation.ts` already draws the line: an instruction to the model may be English, but a
 * sentence quoted under "say exactly" is speech and must be in the caller's language. That was
 * found when a Turkish caller heard an English apology at the one moment the call had gone wrong.
 * `firstMessage` is the same kind of thing and far more heard — every caller, every call — and it
 * was hardcoded English in five places, so a workspace that chose Turkish got a Turkish ear, a
 * Turkish voice and an English hello.
 */
describe("defaultGreeting", () => {
  it("speaks every language the registry offers", () => {
    for (const code of LANGUAGE_CODES) {
      const withName = defaultGreeting(code, "NOTUS Uniform");
      const without = defaultGreeting(code);
      expect(withName).toBeTruthy();
      expect(without).toBeTruthy();
      expect(withName).toContain("NOTUS Uniform");
    }
  });

  it("is actually different per language, not English four times", () => {
    const all = LANGUAGE_CODES.map((c) => defaultGreeting(c, "Acme"));
    expect(new Set(all).size).toBe(LANGUAGE_CODES.length);
  });

  it("accepts a stored language NAME as well as a code — the product has both", () => {
    expect(defaultGreeting("Turkish", "Acme")).toBe(defaultGreeting("tr", "Acme"));
    expect(defaultGreeting("Spanish", "Acme")).toBe(defaultGreeting("es", "Acme"));
  });

  it("falls back to English rather than throwing", () => {
    // A line that will not provision is worse than one that opens in English.
    expect(defaultGreeting(null, "Acme")).toBe(defaultGreeting("en", "Acme"));
    expect(defaultGreeting("klingon", "Acme")).toBe(defaultGreeting("en", "Acme"));
    expect(defaultGreeting(undefined)).toBe(defaultGreeting("en"));
  });

  it("keeps English byte-for-byte, so existing workspaces are untouched", () => {
    // Both forms are the sentences the product already used — the provisioning paths' unnamed
    // one and the employee editor's named one. Nothing English changes; the other three
    // languages stop being English.
    expect(defaultGreeting("en")).toBe("Hi, thanks for calling. How can I help you today?");
    expect(defaultGreeting("en", "Front Desk")).toBe(
      "Hello, thanks for calling Front Desk. How can I help you today?",
    );
  });

  it("never bends a business name onto a Turkish case suffix", () => {
    // 'a vs 'e depends on the last vowel of a name we do not control; getting a customer's own
    // name wrong is worse than a plainer sentence that never can.
    const tr = defaultGreeting("tr", "Mavi Diş");
    expect(tr).toContain("Mavi Diş");
    expect(tr).not.toMatch(/Mavi Diş['’][ae]/);
  });

  it("treats a blank business name as no name", () => {
    expect(defaultGreeting("de", "   ")).toBe(defaultGreeting("de"));
  });
});

/**
 * The rule, not just the helper: no path may invent an English greeting of its own again.
 */
describe("every line is born speaking the workspace's language", () => {
  function files(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...files(full));
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  }

  const SEP = String.fromCharCode(92);
  const SOURCES = [join(process.cwd(), "src", "app"), join(process.cwd(), "src", "lib")];

  it("has no hardcoded English greeting left on any provisioning path", () => {
    const offenders: string[] = [];
    for (const root of SOURCES) {
      for (const file of files(root)) {
        const src = readFileSync(file, "utf8");
        // A greeting ASSIGNED to firstMessage. A placeholder or a demo table is not a default.
        const re = /firstMessage:\s*["'`][^"'`]*(thanks for calling|How can I help)[^"'`]*["'`]/gi;
        for (const m of src.matchAll(re)) {
          offenders.push(`${file.replace(process.cwd(), "").split(SEP).join("/")}  ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
