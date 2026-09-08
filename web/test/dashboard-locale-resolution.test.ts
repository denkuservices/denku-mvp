import { describe, expect, it } from "vitest";
import { resolveDashboardLocale } from "@/i18n/dashboardLocale";
import { UI_LOCALE_COOKIE, routing } from "@/i18n/routing";
import { isLocalizedAppPath } from "@/components/dashboard-i18n/DashboardLocaleProvider";

/**
 * The order in which the product decides what language it speaks.
 *
 * This exists because of a specific afternoon: the dashboard read `NEXT_LOCALE`, next-intl writes
 * `NEXT_LOCALE` on any locale-resolving navigation on the marketing site — including a visit to
 * the canonical English `/` — and so a customer who had set the product to Turkish and then
 * clicked the Denku logo came back to an English dashboard. Their saved preference still said
 * `tr`; it was ignored, because a cookie was present and the cookie was the marketing site's.
 *
 * The rule that fixes it looks arbitrary from the outside, which is exactly why it is asserted
 * here rather than left to a comment.
 */
describe("resolveDashboardLocale", () => {
  it("uses the dashboard's own choice above everything else", () => {
    expect(
      resolveDashboardLocale({ chosen: "tr", account: "de", profile: "es", hint: "en" }),
    ).toBe("tr");
  });

  it("ignores NEXT_LOCALE when the account has a preference — the whole point", () => {
    expect(resolveDashboardLocale({ account: "tr", hint: "en" })).toBe("tr");
    expect(resolveDashboardLocale({ profile: "tr", hint: "en" })).toBe("tr");
  });

  it("prefers the session's metadata over a database round-trip", () => {
    expect(resolveDashboardLocale({ account: "de", profile: "es" })).toBe("de");
  });

  it("falls back to the profile for accounts saved before the metadata existed", () => {
    expect(resolveDashboardLocale({ profile: "es" })).toBe("es");
  });

  it("takes the marketing hint only when nobody has ever chosen", () => {
    expect(resolveDashboardLocale({ hint: "de" })).toBe("de");
  });

  it("falls back to English when nothing is known", () => {
    expect(resolveDashboardLocale({})).toBe(routing.defaultLocale);
  });

  it("refuses a value that is not a locale we serve, at every level", () => {
    expect(
      resolveDashboardLocale({ chosen: "fr", account: "zz", profile: "", hint: "tr" }),
    ).toBe("tr");
    expect(resolveDashboardLocale({ chosen: "en-US" })).toBe(routing.defaultLocale);
  });

  it("does not share a cookie name with next-intl", () => {
    // If these ever converge the marketing site is writing the product's preference again.
    expect(UI_LOCALE_COOKIE).not.toBe("NEXT_LOCALE");
  });
});

/**
 * Where the locale boundary is allowed to run.
 *
 * Onboarding sits inside the same provider but was excluded from the observer until 2026-09-07 —
 * the guard named `/dashboard` only, because that is where the language switcher lives. The
 * result was that the entire setup flow, the first authenticated screens anyone sees, rendered in
 * English no matter what they had chosen on the marketing site. It is a one-line rule and it was
 * wrong for months, so it is asserted rather than described.
 */
describe("isLocalizedAppPath", () => {
  it("covers the dashboard and onboarding", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/inbox",
      "/dashboard/settings/workspace/billing",
      "/onboarding",
      "/onboarding?step=2",
    ]) {
      expect(isLocalizedAppPath(path), path).toBe(true);
    }
  });

  it("leaves everything else alone", () => {
    for (const path of ["/", "/login", "/signup", "/tr/pricing", "/embed/chat", null, undefined]) {
      expect(isLocalizedAppPath(path), String(path)).toBe(false);
    }
  });
});
