import { describe, expect, it } from "vitest";
import { translateDashboardCopy } from "@/i18n/dashboardRuntime";

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
});
