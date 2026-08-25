import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SETTINGS_GROUPS,
  allSettingsItems,
  activeSettingsGroup,
  SETTINGS_LANDING,
} from "@/app/(app)/dashboard/_platform/settings/nav";

const APP_DIR = path.join(process.cwd(), "src", "app", "(app)");

/** Does a route actually exist on disk? (`/dashboard/x` → `src/app/(app)/dashboard/x/page.tsx`) */
function routeExists(href: string): boolean {
  // A `#fragment` addresses a section of a page, not a different page — Sprint 9 · T5 points
  // Usage at `/dashboard/settings/workspace/billing#usage`.
  const rel = href.replace(/^\//, "").split("#")[0].split("?")[0];
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

/**
 * SETTINGS CONTRACT (Sprint 8.5 / audit S-003).
 *
 * The old settings index advertised "Invoices", "Payment methods", "Limits", "Behavior" and
 * "Advanced" as if they were destinations — they were plain text, several with no page at all.
 * This test makes that class of dishonesty impossible: **every navigable item must resolve to a
 * real page on disk.**
 */
describe("settings navigation contract", () => {
  it("every item points at a route that actually exists", () => {
    const missing = allSettingsItems().filter((i) => !routeExists(i.href));
    expect(missing.map((m) => `${m.label} → ${m.href}`)).toEqual([]);
  });

  it("every item has a real, non-decorative description", () => {
    for (const item of allSettingsItems()) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(10);
    }
  });

  it("hrefs are unique — no item is reachable from two places", () => {
    const hrefs = allSettingsItems().map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("groups the platform model, with a home for Channels (so future channels need no new section)", () => {
    const ids = SETTINGS_GROUPS.map((g) => g.id);
    expect(ids).toContain("employees");
    expect(ids).toContain("channels");
    expect(ids).toContain("organization");
    expect(ids).toContain("billing");
    expect(ids).toContain("account");
  });

  it("Usage lives under Billing — it is not a separate top-level concept", () => {
    const billing = SETTINGS_GROUPS.find((g) => g.id === "billing")!;
    expect(billing.items.some((i) => /usage/i.test(i.label))).toBe(true);
  });

  it("resolves the active group from a pathname (longest match wins)", () => {
    expect(activeSettingsGroup("/dashboard/settings/workspace/billing")).toBe("billing");
    expect(activeSettingsGroup("/dashboard/settings/workspace/members")).toBe("organization");
    // Sprint 10 · R-094: the AI Employees group points at /dashboard/team, and
    // /dashboard/settings/agents/* is now only a redirect — not a settings destination.
    expect(activeSettingsGroup("/dashboard/team")).toBe("employees");
    expect(activeSettingsGroup("/dashboard/settings/agents/abc")).toBeNull();
    expect(activeSettingsGroup("/dashboard/settings/account/security")).toBe("account");
    expect(activeSettingsGroup("/dashboard/nowhere")).toBeNull();
  });
});

describe("settings has one place to navigate, not two", () => {
  /**
   * Sprint 8.5 gave Settings a nav rail — correct, it had none. But the index kept listing every
   * destination as well, so `/dashboard/settings` rendered all nine items twice: once in the rail
   * and once as cards with a paragraph each. The index now redirects to its first section.
   */
  it("the landing target is a real page", () => {
    expect(routeExists(SETTINGS_LANDING)).toBe(true);
  });

  it("lands on a section that lives inside Settings", () => {
    expect(SETTINGS_LANDING.startsWith("/dashboard/settings/")).toBe(true);
    const owning = SETTINGS_GROUPS.find((g) => g.items.some((i) => i.href === SETTINGS_LANDING));
    expect(owning, "landing page must be an item in the rail").toBeTruthy();
    expect(owning!.elsewhere ?? false, "must not land on a wayfinding pointer").toBe(false);
  });

  it("the settings index does not re-render the rail", () => {
    const page = fs.readFileSync(path.join(APP_DIR, "dashboard", "settings", "page.tsx"), "utf8");
    expect(page).toMatch(/redirect\(SETTINGS_LANDING\)/);
    expect(page, "the duplicate index must not come back").not.toMatch(/PlatformSettingsIndex/);
  });

  it("groups whose destinations leave Settings are marked as such", () => {
    // Employee behaviour and channel connections were moved onto their objects (R-094, Sprint 11).
    // Marking them keeps the rail honest about how many settings sections there actually are.
    for (const g of SETTINGS_GROUPS) {
      const allExternal = g.items.every((i) => i.external);
      expect(g.elsewhere ?? false, `group ${g.id}`).toBe(allExternal);
    }
  });
});
