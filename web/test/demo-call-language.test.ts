import { describe, it, expect } from "vitest";
import { demoAssistantOverrides } from "@/lib/marketing/demoCall";
import { routing, localeForCountry } from "@/i18n/routing";
import { toLanguageCode } from "@/lib/language/registry";

/**
 * The demo answers in the language the page is being read in.
 *
 * The marketing site picks a locale from the visitor's country, so a visitor in Germany reads a
 * German page. A demo that then greets them in English is the product contradicting itself on the
 * one screen meant to prove it works — the same class of failure as R-135, one step earlier in the
 * funnel.
 */

describe("the site cannot offer a page language the demo cannot speak", () => {
  /**
   * The load-bearing test in this file. Adding a marketing locale is a one-line change in
   * `i18n/routing.ts`; without this, that line would quietly ship a page whose demo answers in
   * English. Here it fails instead, and the fix is to give the language an ear and a mouth in
   * `lib/language/registry.ts` first.
   */
  it.each(routing.locales)("%s is a language the voice stack supports", (locale) => {
    expect(toLanguageCode(locale)).toBe(locale);
  });

  it.each(routing.locales)("%s has a greeting of its own, not English", (locale) => {
    const overrides = demoAssistantOverrides(locale);
    expect(overrides.firstMessage.trim().length).toBeGreaterThan(0);
    if (locale !== "en") {
      expect(overrides.firstMessage).not.toBe(demoAssistantOverrides("en").firstMessage);
    }
  });
});

describe("per-locale overrides", () => {
  it("pins the ear to the language and picks a mouth for it", () => {
    const de = demoAssistantOverrides("de");
    expect(de.transcriber).toEqual({ provider: "deepgram", model: "nova-3", language: "de" });
    expect(de.voice.provider).toBe("openai");
    expect(de.firstMessage).toContain("Denku");

    const tr = demoAssistantOverrides("tr");
    expect(tr.transcriber.language).toBe("tr");
  });

  it("never overrides the model or its system prompt", () => {
    // The demo assistant's prompt is what makes it a good demo, and it is shared with a live
    // phone line. The language belongs in the ear and the mouth; the brain already knows.
    const keys = Object.keys(demoAssistantOverrides("de"));
    expect(keys.sort()).toEqual(["firstMessage", "transcriber", "voice"]);
  });

  it("falls back to English rather than throwing on an unknown or missing locale", () => {
    // This runs on the visitor's first click. A demo that refuses to start is worse than a demo
    // in the wrong language.
    const en = demoAssistantOverrides("en").firstMessage;
    expect(demoAssistantOverrides(null).firstMessage).toBe(en);
    expect(demoAssistantOverrides("fr").firstMessage).toBe(en);
    expect(demoAssistantOverrides("").firstMessage).toBe(en);
  });
});

describe("country → page language (the owner's rule)", () => {
  it.each([
    ["TR", "tr"],
    ["DE", "de"],
    ["AT", "de"],
    ["ES", "es"],
    ["MX", "es"],
    ["AR", "es"],
  ])("a visitor from %s reads %s", (country, expected) => {
    expect(localeForCountry(country)).toBe(expected);
  });

  it.each(["FR", "IT", "JP", "GB", "US", "ZZ"])(
    "a visitor from %s reads English, because that is the stated default",
    (country) => {
      expect(localeForCountry(country)).toBe("en");
    }
  );

  it("falls back to English when the edge gives us no country at all", () => {
    // Local development and any non-Vercel/Cloudflare edge: no header, no guess.
    expect(localeForCountry(null)).toBe("en");
    expect(localeForCountry(undefined)).toBe("en");
  });
});
