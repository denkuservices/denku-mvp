import { describe, expect, it } from "vitest";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { routing } from "@/i18n/routing";

const NON_ENGLISH = routing.locales.filter((locale) => locale !== "en");
const REQUIRED_SURFACES = [
  "Home",
  "Inbox",
  "Customers",
  "AI Team",
  "Settings",
  "Workspace",
  "Billing & usage",
  "Account",
  "Channels",
  "Interface language",
  "Search conversations, customers, requests",
  "Nothing needs your attention — your AI team has it covered.",
  "Write a message",
  "Save changes",
  "No requests yet",
  "Customer segment",
  "Sort contacts",
  "Most open requests",
  "Gone quiet",
  "Everyone your AI team has spoken to, and what is still open for them.",
  "Email receiving is not configured on this environment yet. Contact support before connecting an address.",
  "Web Chat is not configured on this deployment yet, so the widget cannot start a conversation. Contact support.",
  "Please sign in again.",
] as const;

describe("authenticated dashboard locales", () => {
  it.each(NON_ENGLISH)("%s covers the shared dashboard surfaces", (locale) => {
    const dictionary = getDashboardDictionary(locale);
    for (const english of REQUIRED_SURFACES) {
      expect(dictionary[english], `${locale}: ${english}`).toBeTruthy();
      expect(dictionary[english], `${locale}: ${english}`).not.toBe(english);
    }
  });

  it.each(NON_ENGLISH)("%s contains no empty translations", (locale) => {
    const dictionary = getDashboardDictionary(locale);
    expect(Object.keys(dictionary).length).toBeGreaterThan(200);
    expect(Object.entries(dictionary).filter(([source, target]) => !source || !target)).toEqual([]);
  });

  it("keeps English as the source locale", () => {
    expect(getDashboardDictionary("en")).toEqual({});
  });

  it("uses the requested Turkish team label", () => {
    expect(getDashboardDictionary("tr")["AI Team"]).toBe("AI Ekibim");
  });
});

