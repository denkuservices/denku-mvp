import { describe, expect, it } from "vitest";
import { translateDashboardCopy } from "@/i18n/dashboardRuntime";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { routing } from "@/i18n/routing";

const NON_ENGLISH = routing.locales.filter((locale) => locale !== "en");

describe("dashboard runtime translations", () => {
  it("translates changing Turkish counters without touching their values", () => {
    expect(translateDashboardCopy("22m ago", {}, "tr")).toBe("22m önce");
    expect(translateDashboardCopy("9% of your CRM", {}, "tr")).toBe("CRM'inizin %9'i");
    expect(translateDashboardCopy("Page 1 of 11", {}, "tr")).toBe("11 sayfadan 1. sayfa");
  });

  it("translates dynamic accessibility labels while retaining record names", () => {
    expect(translateDashboardCopy("Select Ada Lovelace", {}, "tr")).toBe(
      "Ada Lovelace kişisini seç",
    );
    expect(translateDashboardCopy("Call Ada Lovelace", {}, "es")).toBe(
      "Llamar a Ada Lovelace",
    );
  });

  it("keeps customer copy and English locale copy unchanged when no rule matches", () => {
    expect(translateDashboardCopy("A customer-written sentence", {}, "tr")).toBe(
      "A customer-written sentence",
    );
    expect(translateDashboardCopy("22m ago", {}, "en")).toBe("22m ago");
  });

  it("localises launchpad templates without changing workspace or employee names", () => {
    const dictionary = { Voice: "Ses", Email: "E-posta" };

    expect(translateDashboardCopy("Let's get Acme Dental ready for its first customer.", dictionary, "tr")).toBe(
      "Acme Dental çalışma alanını ilk müşterisine hazırlayalım.",
    );
    expect(translateDashboardCopy("Make Mia sound like you", dictionary, "tr")).toBe("Mia sizin gibi konuşsun");
    expect(translateDashboardCopy("Voice, Email connected", dictionary, "tr")).toBe("Ses, E-posta bağlı");
    expect(translateDashboardCopy("3 of 6 complete", dictionary, "tr")).toBe(
      "6 adımdan 3 tanesi tamamlandı",
    );
  });
});

/**
 * Counted sentences that used to arrive in pieces.
 *
 * Both nudges on the dashboard home interpolate a number into the middle of a sentence. Rendered
 * as separate JSX children they reach the locale boundary as separate DOM text nodes, and the
 * boundary translates one node at a time — so a Turkish reader got two translated fragments with
 * an English "conversations" between them, in English clause order. The components compose them
 * into one string now, and these rules are what that string is for.
 */
describe("counted dashboard sentences", () => {
  const cases = [
    "Your AI has answered 3 conversations without knowing anything about your business.",
    "Your AI has answered 1 conversation without knowing anything about your business.",
    "You are paying for 99 chat channels and using 1.",
    "You are paying for 1 chat channel and using 0.",
  ];

  it.each(NON_ENGLISH.flatMap((locale) => cases.map((source) => [locale, source] as const)))(
    "%s translates %s",
    (locale, source) => {
      const translated = translateDashboardCopy(source, getDashboardDictionary(locale), locale);
      expect(translated).not.toBe(source);
      // The counter survives; only the words around it change.
      for (const number of source.match(/\d+/g) ?? []) {
        expect(translated).toContain(number);
      }
      expect(translated).not.toMatch(/conversations?\b|chat channels?\b/);
    },
  );
});
