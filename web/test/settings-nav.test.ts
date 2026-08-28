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
import { platformNavRoutes, horizonNavRoutes } from "@/components/horizon-shell/nav";

const APP_DIR = path.join(process.cwd(), "src", "app", "(app)");
const SRC_DIR = path.join(process.cwd(), "src");

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

/**
 * SETTINGS NAVIGATES FROM THE SIDEBAR, NOT FROM INSIDE THE PAGE.
 *
 * The sections used to be a rail rendered into every settings page: a second navigation column
 * beside the product's own sidebar, carrying a description line per item, squeezing the forms it
 * pointed at into a strip. They are now the Settings sub-menu in the sidebar, where the rest of
 * the product's navigation lives — one place to navigate, as the section above already demands.
 */
describe("settings navigation lives in the sidebar", () => {
  const settingsRoute = platformNavRoutes.find((r) => r.name === "Settings");
  const children = settingsRoute?.items ?? [];

  it("Settings carries the three sections plus Channels, in order", () => {
    expect(children.map((c) => c.name)).toEqual([
      "Workspace",
      "Billing & usage",
      "Account",
      "Channels",
    ]);
  });

  it("Settings navigates to the first section, not through the redirect", () => {
    // `/dashboard/settings` has no page of its own — clicking the sidebar item used to land on an
    // empty frame on the way to the section. `path` still says `settings` so the item stays
    // highlighted (and open) across every settings page.
    expect(settingsRoute?.href).toBe(SETTINGS_LANDING);
    expect(settingsRoute?.path).toBe("settings");
  });

  it("every sub-item resolves to a real page", () => {
    const missing = children.filter((c) => !routeExists(`/dashboard/${c.path}`));
    expect(missing.map((m) => `${m.name} → /dashboard/${m.path}`)).toEqual([]);
  });

  it("AI Employees is not repeated — it is the 'AI Team' item", () => {
    // Channels had no other entry point in the product, so it moved under Settings. The employee
    // surface already has a top-level slot; listing it twice is the duplication the rail had.
    expect(children.some((c) => c.path === "team")).toBe(false);
    expect(platformNavRoutes.some((r) => r.path === "team")).toBe(true);
  });

  it("labels only — the description lines stay on the pages", () => {
    // `name` and `path` are the whole sub-item. A nav you read instead of scan has stopped working.
    for (const child of children) {
      expect(Object.keys(child).sort()).toEqual(["layout", "name", "path"]);
    }
  });

  it("Settings is the only item with a sub-menu, and the legacy nav has none", () => {
    const withItems = platformNavRoutes.filter((r) => (r.items?.length ?? 0) > 0);
    expect(withItems.map((r) => r.name)).toEqual(["Settings"]);
    // Flag-off experience is untouched.
    expect(horizonNavRoutes.every((r) => !r.items?.length)).toBe(true);
  });

  it("no settings page renders a navigation rail of its own", () => {
    const layout = read("dashboard/settings/layout.tsx");
    expect(layout).not.toMatch(/SettingsNav/);
    expect(
      fs.existsSync(path.join(SRC_DIR, "app/(app)/dashboard/_platform/settings/SettingsNav.tsx")),
      "the in-page rail must not come back"
    ).toBe(false);
  });
});
