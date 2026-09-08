import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { localeAlternates, localeHref } from "@/i18n/alternates";
import { routing } from "@/i18n/routing";
import { siteConfig } from "@/config/site";

// Derived, never retyped: the site URL is configuration, and a second copy here would make
// these tests fail for a domain change rather than for a regression.
const BASE = siteConfig.url;

/**
 * What a localised page tells a search engine about itself.
 *
 * Two things were wrong at once, and the first is the harmful one.
 *
 * The root layout declared `alternates: { canonical: '/' }`. Next.js merges metadata down the
 * tree, so every page in every language announced the English home page as its canonical URL:
 * `/tr/pricing` said it WAS `https://www.denku.io`. That is not a missing signal but an
 * incorrect one, and the correct response to it is to drop the Turkish page from the index —
 * on a site that had just been translated into four languages.
 *
 * The second: `hreflang` existed only in `sitemap.xml`. The comment in `[locale]/layout.tsx`
 * justifies leaving `<html lang="en">` on the grounds that search engines take their signal
 * from "the hreflang alternates in each page's metadata", and there were none in any page's
 * metadata.
 */

describe("localeAlternates", () => {
  it("names the page itself, in its own language", () => {
    expect(localeAlternates("tr", "/pricing").canonical).toBe(`${BASE}/tr/pricing`);
    // English has no prefix — `localePrefix: "as-needed"`.
    expect(localeAlternates("en", "/pricing").canonical).toBe(`${BASE}/pricing`);
  });

  it("never points one language at another's URL", () => {
    // The bug, stated as an assertion: a locale's canonical must contain its own prefix.
    for (const locale of routing.locales) {
      const { canonical } = localeAlternates(locale, "/about");
      if (locale === routing.defaultLocale) {
        expect(canonical).toBe(`${BASE}/about`);
      } else {
        expect(canonical).toContain(`/${locale}/about`);
      }
    }
  });

  it("lists every language plus x-default", () => {
    const { languages } = localeAlternates("de", "/docs");
    for (const locale of routing.locales) {
      expect(languages[locale]).toBe(localeHref(locale, "/docs"));
    }
    // Without x-default the group is ambiguous for a reader whose language matches none.
    expect(languages["x-default"]).toBe(localeHref(routing.defaultLocale, "/docs"));
  });

  it("handles the home page, where the path is empty", () => {
    expect(localeAlternates("tr").canonical).toBe(`${BASE}/tr`);
    expect(localeAlternates("en").canonical).toBe(BASE);
  });

  it("is absolute, because a relative canonical resolves against a locale-less base", () => {
    // `metadataBase` has no locale, so "/about" on the Turkish page would resolve back to the
    // English URL — the original bug in a quieter form.
    expect(localeAlternates("tr", "/about").canonical).toMatch(/^https:\/\//);
  });
});

/**
 * The wiring, not just the helper. A page that forgets this ships a page nobody can find in
 * three of the four languages, and nothing else in the build would complain.
 */
describe("every marketing page declares its own alternates", () => {
  const MARKETING = "src/app/[locale]/(marketing)";

  function pagesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...pagesUnder(full));
      else if (entry === "page.tsx" || entry === "layout.tsx") out.push(full);
    }
    return out;
  }

  const files = pagesUnder(MARKETING);
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

  it("finds the marketing tree", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("has no hand-written canonical left anywhere", () => {
    // A literal canonical cannot know which language it is on; that is the whole defect.
    const offenders = [...sources]
      .filter(([, s]) => /alternates:\s*\{\s*canonical:\s*['"`]/.test(s))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });

  it("declares alternates on every page, through the helper", () => {
    const missing = [...sources]
      .filter(([f]) => f.endsWith("page.tsx"))
      // A route that only redirects renders no document, so it has no metadata to carry
      // alternates in — and should not: the alternates belong to the page it points at.
      .filter(([, s]) => !/\bpermanentRedirect\(|\bredirect\(/.test(s))
      // A page whose metadata lives in its route layout is covered by that layout.
      .filter(([f, s]) => {
        if (s.includes("localeAlternates(")) return false;
        const layout = f.replace(/page\.tsx$/, "layout.tsx");
        return !(sources.get(layout) ?? "").includes("localeAlternates(");
      })
      .map(([f]) => f);
    expect(missing).toEqual([]);
  });

  it("redirects rather than duplicating a page that already exists", () => {
    // `/about` and `/company` were two about-us pages competing for the same search results,
    // and the linked one was the stale one. Guarding the redirect so a future edit cannot
    // quietly restore the duplicate.
    const about = sources.get(join(MARKETING, "about", "page.tsx"));
    expect(about).toBeDefined();
    expect(about).toMatch(/permanentRedirect\(\{\s*href:\s*['"]\/company['"]/);
  });

  it("never declares alternates twice in one file", () => {
    // The duplicate-key trap: in JS the LAST wins, so a leftover literal would silently
    // reinstate the bug while the helper sits above it looking correct.
    const doubled = [...sources]
      .filter(([, s]) => (s.match(/alternates:/g) ?? []).length > 1)
      .map(([f]) => f);
    expect(doubled).toEqual([]);
  });
});

describe("the root layout does not hand its canonical to every language", () => {
  const root = readFileSync("src/app/layout.tsx", "utf8");

  it("declares no alternates of its own", () => {
    expect(root).not.toMatch(/alternates:\s*\{/);
  });
});
