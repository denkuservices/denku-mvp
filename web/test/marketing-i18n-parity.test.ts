import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routing } from "@/i18n/routing";

/**
 * Every language the site is served in must actually be translated.
 *
 * This was found by looking at the live site rather than the code: `/de` and `/tr` rendered
 * fully translated pages with an ENGLISH call button on them — "Talk to Denku now" — because that
 * string was hardcoded in a shared component instead of coming from the message files. The one
 * control the landing page exists to get pressed was the one thing a German visitor could not
 * read.
 *
 * A missing key is invisible in development (next-intl falls back) and invisible in review (the
 * file is 400 lines of JSON). It is only visible to the visitor. So it is asserted here.
 */

type Json = Record<string, unknown>;

function load(locale: string): Json {
  return JSON.parse(
    readFileSync(join(process.cwd(), "src", "messages", `${locale}.json`), "utf8")
  ) as Json;
}

/** Every leaf path in a message file, e.g. "home.demo.cta". Arrays count as leaves. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Json).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

function at(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc as Json)?.[k], obj);
}

const en = load("en");
const enPaths = keyPaths(en).sort();
const otherLocales = routing.locales.filter((l) => l !== "en");

describe("message files cover every locale the site serves", () => {
  it.each(otherLocales)("%s has exactly the same keys as English", (locale) => {
    const paths = keyPaths(load(locale)).sort();
    // Reported as two lists so a failure names the offending keys rather than dumping the file.
    expect({
      locale,
      missing: enPaths.filter((p) => !paths.includes(p)),
      extra: paths.filter((p) => !enPaths.includes(p)),
    }).toEqual({ locale, missing: [], extra: [] });
  });
});

describe("the strings a visitor cannot miss are actually translated", () => {
  /**
   * Not every string differing from English would be a bug — "Denku", "24/7" and "0.8s" are the
   * same in every language. So this checks only the handful where an English word on a
   * non-English page is unambiguously wrong: the demo call-to-action and its supporting line.
   */
  const MUST_DIFFER = [
    "home.demo.cta",
    "home.demo.endCall",
    "home.demo.noSignup",
    "home.hero.ticker",
  ];

  it.each(otherLocales.flatMap((l) => MUST_DIFFER.map((p) => [l, p] as const)))(
    "%s translates %s",
    (locale, path) => {
      const mine = at(load(locale), path);
      expect(mine).toBeDefined();
      expect(JSON.stringify(mine)).not.toBe(JSON.stringify(at(en, path)));
    }
  );
});
