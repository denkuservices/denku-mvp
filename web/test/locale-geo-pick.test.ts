import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { localeForCountry, LOCALE_CHOICE_COOKIE, routing } from "@/i18n/routing";

/**
 * Which language a first-time visitor is served.
 *
 * The bug this pins was found on 2026-09-03, on the owner's own browser: typing `denku.io`
 * from Turkey opened the site in English, every time. The country detection was working
 * perfectly — the redirect never ran, because the middleware treated `NEXT_LOCALE` as evidence
 * that the visitor had CHOSEN a language.
 *
 * next-intl writes `NEXT_LOCALE` on any locale-resolving navigation, and that includes simply
 * landing on `/en` — the canonical English URL, the one in the sitemap, the one a Google result
 * points at. So one arrival from an English search result pinned English permanently, and the
 * visitor had no way to know why. "Working as designed" and "wrong" at the same time.
 *
 * The fix is a second cookie written in exactly one place, and these tests exist to stop anyone
 * "simplifying" the two back into one.
 */

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("country to language", () => {
  it("serves Turkish to a visitor from Turkey", () => {
    expect(localeForCountry("TR")).toBe("tr");
    expect(localeForCountry("tr")).toBe("tr");
  });

  it("falls back to the default for a country we have no language for", () => {
    expect(localeForCountry("JP")).toBe(routing.defaultLocale);
    expect(localeForCountry(null)).toBe(routing.defaultLocale);
    expect(localeForCountry("")).toBe(routing.defaultLocale);
  });
});

describe("the geo pick reads a CHOICE, not a rendered page", () => {
  const middleware = stripComments(read("middleware.ts"));

  it("does not treat NEXT_LOCALE as a choice", () => {
    // The entire bug in one line. next-intl writes NEXT_LOCALE when a page in some locale is
    // rendered — which is not the same fact as a person picking a language.
    expect(middleware).not.toMatch(/cookies\.has\(\s*["']NEXT_LOCALE["']\s*\)/);
  });

  it("skips the geo redirect only when a deliberate choice was recorded", () => {
    expect(middleware).toMatch(/cookies\.has\(LOCALE_CHOICE_COOKIE\)/);
  });

  it("still remembers its own guess, so the redirect runs once and not on every click", () => {
    // The guess is stored under NEXT_LOCALE deliberately: it must stay overridable by the
    // switcher, which is exactly what the choice cookie is for.
    expect(middleware).toMatch(/cookies\.set\(\s*["']NEXT_LOCALE["']/);
  });
});

describe("the choice cookie is written in exactly one place", () => {
  it("is written by the language switcher", () => {
    const switcher = read("components/marketing/LocaleSwitcher.tsx");
    expect(switcher).toMatch(/LOCALE_CHOICE_COOKIE/);
    expect(switcher).toMatch(/document\.cookie/);
  });

  it("is written nowhere else", () => {
    // If a second writer appears, the cookie stops meaning "a person clicked a language" and
    // the bug comes back wearing a different name.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const body = fs.readFileSync(full, "utf8");
          if (body.includes("DENKU_LOCALE=") || body.includes("LOCALE_CHOICE_COOKIE}=")) {
            hits.push(path.relative(SRC, full).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(SRC);
    expect(hits).toEqual(["components/marketing/LocaleSwitcher.tsx"]);
  });

  it("names a cookie distinct from next-intl's", () => {
    expect(LOCALE_CHOICE_COOKIE).not.toBe("NEXT_LOCALE");
  });
});
