import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SETTINGS_ITEMS,
  SETTINGS_ELSEWHERE,
  allSettingsItems,
  activeSettingsItem,
  SETTINGS_LANDING,
} from "@/app/(app)/dashboard/_platform/settings/nav";

const APP_DIR = path.join(process.cwd(), "src", "app", "(app)");

/** Does a route actually exist on disk? (`/dashboard/x` → `src/app/(app)/dashboard/x/page.tsx`) */
function routeExists(href: string): boolean {
  // A `#fragment` addresses a section of a page, not a different page.
  const rel = href.replace(/^\//, "").split("#")[0].split("?")[0];
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

const read = (rel: string) => fs.readFileSync(path.join(APP_DIR, rel), "utf8");

/**
 * SETTINGS CONTRACT (Sprint 8.5 / audit S-003, extended when Settings went 9 → 3).
 *
 * The original index advertised "Invoices", "Payment methods", "Limits", "Behavior" and
 * "Advanced" as if they were destinations — they were plain text, several with no page at all.
 * That class of dishonesty stays impossible: every navigable item must resolve to a real page.
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

  it("resolves the active item from a pathname (longest match wins)", () => {
    expect(activeSettingsItem("/dashboard/settings/workspace")?.label).toBe("Workspace");
    // A section of a page still resolves to that page's rail item.
    expect(activeSettingsItem("/dashboard/settings/workspace/audit")?.label).toBe("Workspace");
    // Billing sits under the workspace path but is its own destination — the longer href wins.
    expect(activeSettingsItem("/dashboard/settings/workspace/billing")?.label).toMatch(/billing/i);
    expect(activeSettingsItem("/dashboard/settings/account")?.label).toBe("Account");
    expect(activeSettingsItem("/dashboard/nowhere")).toBeNull();
  });
});

describe("settings is three sections, not nine pages", () => {
  it("the rail lists exactly the three settings destinations", () => {
    expect(SETTINGS_ITEMS.map((i) => i.label)).toEqual(["Workspace", "Billing & usage", "Account"]);
  });

  it("nothing in the rail proper leaves Settings, and everything in 'elsewhere' does", () => {
    // The distinction is what stops the rail implying five sections where there are three.
    expect(SETTINGS_ITEMS.every((i) => !i.external)).toBe(true);
    expect(SETTINGS_ITEMS.every((i) => i.href.startsWith("/dashboard/settings/"))).toBe(true);
    expect(SETTINGS_ELSEWHERE.every((i) => i.external)).toBe(true);
    expect(SETTINGS_ELSEWHERE.every((i) => !i.href.startsWith("/dashboard/settings"))).toBe(true);
  });

  it("employee and channel configuration is reachable, but not as a settings section", () => {
    // R-094 put employee behaviour on the employee; Sprint 11 put channels under Channels.
    const hrefs = SETTINGS_ELSEWHERE.map((i) => i.href);
    expect(hrefs).toContain("/dashboard/team");
    expect(hrefs).toContain("/dashboard/channels");
  });
});

describe("settings has one place to navigate, not two", () => {
  it("the landing target is a real page and a real rail item", () => {
    expect(routeExists(SETTINGS_LANDING)).toBe(true);
    const owning = SETTINGS_ITEMS.find((i) => i.href === SETTINGS_LANDING);
    expect(owning, "landing page must be a section, not a pointer").toBeTruthy();
  });

  it("the settings index redirects rather than re-rendering the rail", () => {
    const page = read("dashboard/settings/page.tsx");
    expect(page).toMatch(/redirect\(SETTINGS_LANDING\)/);
    expect(page, "the duplicate index must not come back").not.toMatch(/PlatformSettingsIndex/);
  });
});

describe("the merged pages keep every old URL working", () => {
  /**
   * Profile, Security, General and Members became sections. Their URLs are shipped in emails,
   * bookmarks and the profile dropdown, so each must still land on the right place rather than
   * 404 — the same rule that has held through every route move since Sprint 11.
   */
  const redirects: Array<[string, string]> = [
    ["dashboard/settings/account/profile/page.tsx", "/dashboard/settings/account#profile"],
    ["dashboard/settings/account/security/page.tsx", "/dashboard/settings/account#security"],
    ["dashboard/settings/workspace/general/page.tsx", "/dashboard/settings/workspace#identity"],
    ["dashboard/settings/workspace/members/page.tsx", "/dashboard/settings/workspace#members"],
  ];

  it.each(redirects)("%s redirects to %s", (file, target) => {
    expect(read(file)).toContain(`redirect("${target}")`);
  });

  it("the merged pages render the sections those redirects point at", () => {
    const account = read("dashboard/settings/account/page.tsx");
    expect(account).toMatch(/id="profile"/);
    expect(account).toMatch(/id="security"/);

    const workspace = read("dashboard/settings/workspace/page.tsx");
    expect(workspace).toMatch(/id="identity"/);
    expect(workspace).toMatch(/id="members"/);
  });

  it("Account no longer carries its own tab strip", () => {
    // Profile/Security tabs inside a layout were a third navigation layer over two short cards.
    expect(fs.existsSync(path.join(APP_DIR, "dashboard/settings/account/layout.tsx"))).toBe(false);
  });

  it("the audit log keeps its own route — it is a record, not a setting", () => {
    expect(routeExists("/dashboard/settings/workspace/audit")).toBe(true);
    expect(read("dashboard/settings/workspace/page.tsx")).toContain(
      "/dashboard/settings/workspace/audit"
    );
  });
});
