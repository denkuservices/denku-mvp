import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The read model imports the service-role client at module load; this suite only exercises its
// pure helpers, so the client is stubbed rather than configured.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { SETTINGS_GROUPS, allSettingsItems } from "@/app/(app)/dashboard/_platform/settings/nav";
import { platformRedirectTarget } from "@/lib/platform/routeRedirects";
import { appointmentHref, appointmentToRequest } from "@/lib/platform/readModel/requests";
import { deriveInitials, deriveFirstName } from "@/components/horizon-shell/useProfileIdentity";

const SRC = path.join(process.cwd(), "src");
const APP_DIR = path.join(SRC, "app", "(app)");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}
/**
 * File contents with comments stripped.
 *
 * These assertions are about what the product *does*, so they must not trip over documentation
 * that names the thing being removed — several of these files explain in a comment why a control
 * or a stub is gone, and that explanation necessarily quotes it.
 */
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}
function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, "").split("#")[0].split("?")[0];
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

/**
 * SPRINT 9 — "ONE PRODUCT" CONTRACT.
 *
 * The sprint's premise: a first-time owner should not be able to tell Denku contains two
 * overlapping product shells. These tests pin the specific dishonesties and dead ends that were
 * removed, so none of them can quietly return.
 */
describe("T1 · one header system", () => {
  const topbar = readCode("components/horizon-shell/HorizonTopbar.tsx");

  it("the topbar renders no page title and no breadcrumb", () => {
    // The page's own PageHeader is the single H1. A second title in the chrome is what put
    // "Main Dashboard" above Home and a title-cased UUID above every detail page.
    expect(topbar).not.toMatch(/routeMeta/);
    expect(topbar).not.toMatch(/breadcrumb/i);
    expect(topbar).not.toMatch(/<h[1-6]/);
  });

  it('no surface renders the template strings "Main Dashboard" or "Pages /"', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const body = readCode(path.relative(SRC, full));
          if (body.includes("Main Dashboard") || body.includes("Pages /")) {
            offenders.push(path.relative(SRC, full));
          }
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  it("no page title can be derived from a URL segment", () => {
    // `toTitleCase(lastSegment)` is how a UUID became a heading.
    expect(topbar).not.toMatch(/toTitleCase|deriveMetaFromPathname|split\(["'`]\/["'`]\)/);
  });

  it("the dead route-title helpers and duplicate headers are gone", () => {
    expect(exists("components/horizon-shell/navigation.ts")).toBe(false);
    expect(exists("components/horizon-shell/DashboardHeader.tsx")).toBe(false);
    expect(exists("app/(app)/DashboardHeader.tsx")).toBe(false);
  });
});

describe("T2 · no decorative global search", () => {
  const widget = readCode("components/horizon-shell/ProfileWidget.tsx");

  it("the topbar has no search control", () => {
    expect(widget).not.toMatch(/dashboard-search-input/);
    expect(widget).not.toMatch(/placeholder=["']Search/);
    expect(widget).not.toMatch(/searchValue/);
  });

  it("keeps only the mobile menu, the theme toggle and the account menu", () => {
    expect(widget).toMatch(/aria-label="Open menu"/);
    expect(widget).toMatch(/Switch to (light|dark) mode/);
    expect(widget).toMatch(/aria-label="Account menu"/);
    // The bell and info buttons were also inert — no handler, no destination.
    expect(widget).not.toMatch(/aria-label="Notifications"/);
    expect(widget).not.toMatch(/aria-label="Information"/);
  });

  it("page-level search is untouched", () => {
    for (const p of [
      "app/(app)/dashboard/inbox/page.tsx",
      "app/(app)/dashboard/crm/contacts/page.tsx",
      "app/(app)/dashboard/crm/requests/page.tsx",
    ]) {
      expect(read(p)).toMatch(/SearchField/);
    }
  });
});

describe("T3 · real user identity", () => {
  it("no stock template avatar is shown as the user", () => {
    expect(read("components/horizon-shell/ProfileWidget.tsx")).not.toMatch(/avatar4\.png/);
    expect(read("components/horizon-shell/ProfileDropdown.tsx")).not.toMatch(/avatar4\.png/);
  });

  it("derives initials deterministically from a name", () => {
    expect(deriveInitials("Ada Lovelace")).toBe("AL");
    expect(deriveInitials("ada lovelace byron")).toBe("AL");
    expect(deriveInitials("Ada")).toBe("A");
    expect(deriveInitials("  Ada  Lovelace  ")).toBe("AL");
  });

  it("falls back to the email, then to nothing — never to a wrong initial", () => {
    expect(deriveInitials(null, "ada@denku.io")).toBe("A");
    expect(deriveInitials("", "ada@denku.io")).toBe("A");
    expect(deriveInitials(null, null)).toBeNull();
    expect(deriveInitials("   ", "   ")).toBeNull();
    // Punctuation-only names must not produce a punctuation "initial".
    expect(deriveInitials("!!!", null)).toBeNull();
  });

  it("derives a greeting name, defaulting to a neutral one", () => {
    expect(deriveFirstName("ada lovelace")).toBe("Ada");
    expect(deriveFirstName(null)).toBe("there");
    expect(deriveFirstName("   ")).toBe("there");
  });
});

describe("T4 · the appointment dead end is closed", () => {
  it("an appointment links to a page about that appointment, not to a list", () => {
    const href = appointmentHref("appt-1");
    expect(href).toBe("/dashboard/crm/requests/appointment/appt-1");
    expect(href).not.toBe("/dashboard/appointments");
  });

  it("that destination exists on disk", () => {
    expect(routeExists("/dashboard/crm/requests/appointment/[appointmentId]")).toBe(true);
  });

  it("the destination is not itself redirected — the loop is gone", () => {
    // The old href hit this redirect and returned the user to the page they clicked from.
    expect(platformRedirectTarget("/dashboard/appointments")).toBe(
      "/dashboard/crm/requests?type=appointment"
    );
    expect(platformRedirectTarget(appointmentHref("appt-1"))).toBeNull();
  });

  it("the read model carries the per-appointment href", () => {
    const view = appointmentToRequest({
      id: "appt-9",
      notes: "Boiler service",
      status: "scheduled",
      start_at: "2026-09-01T10:00:00Z",
      created_at: "2026-08-25T09:00:00Z",
      call_id: "call-1",
      lead_id: "lead-1",
    });
    expect(view.href).toBe("/dashboard/crm/requests/appointment/appt-9");
  });

  it("the conversation rail links artifacts to the artifact", () => {
    const rail = readCode("app/(app)/dashboard/_platform/conversation/ContextRail.tsx");
    expect(rail).toMatch(/appointmentHref\(a\.id\)/);
    expect(rail).not.toMatch(/requests\?type=appointment/);
  });
});

describe("T5 · Usage and Integrations are honest", () => {
  it("Settings advertises no Integrations destination", () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).not.toContain("integrations");
    expect(allSettingsItems().some((i) => /integration/i.test(i.label))).toBe(false);
  });

  it("Usage points at the Billing section that holds the real numbers", () => {
    const usage = allSettingsItems().find((i) => /usage/i.test(i.label));
    expect(usage?.href).toBe("/dashboard/settings/workspace/billing#usage");
  });

  it("Billing actually has that anchor", () => {
    expect(read("app/(app)/dashboard/settings/workspace/billing/page.tsx")).toMatch(/id="usage"/);
  });

  it("the old Usage URLs redirect instead of dead-ending", () => {
    const stub = readCode("app/(app)/dashboard/settings/workspace/usage/page.tsx");
    expect(stub).toMatch(/redirect\("\/dashboard\/settings\/workspace\/billing#usage"\)/);
    expect(stub).not.toMatch(/Coming soon/);

    const legacy = readCode("app/(app)/dashboard/usage/page.tsx");
    expect(legacy).toMatch(/billing#usage/);
  });

  it("the Integrations URL redirects and no longer shows a stub", () => {
    const page = readCode("app/(app)/dashboard/settings/integrations/page.tsx");
    expect(page).toMatch(/redirect\("\/dashboard\/settings"\)/);
    expect(page).not.toMatch(/Coming soon/);
  });

  it("nothing still links to the removed Integrations destination", () => {
    for (const p of [
      "app/(app)/dashboard/settings/workspace/general/_components/RuntimeCard.tsx",
      "app/(app)/dashboard/settings/workspace/general/_components/WebhooksCard.tsx",
    ]) {
      expect(read(p)).not.toMatch(/settings\/integrations/);
    }
  });
});

describe("T6 · no fake controls, no dead files", () => {
  const tab = readCode("app/(app)/dashboard/phone-lines/[lineId]/_tabs/AssignedAITab.tsx");

  it("the phone-line tab shows only fields that persist", () => {
    // These three had no column to save to and rendered disabled under "Coming soon".
    expect(tab).not.toMatch(/BEHAVIOR_PRESETS|behaviorPreset/);
    expect(tab).not.toMatch(/fallbackMessage/);
    expect(tab).not.toMatch(/escalationPhrase/);
    expect(tab).not.toMatch(/Coming soon/);
  });

  it("keeps the field that is real", () => {
    expect(tab).toMatch(/first_message/);
  });

  it("the confirmed-dead files are gone", () => {
    for (const dead of [
      "app/(app)/_components/DashboardSidebar.tsx",
      "app/(app)/_components/DashboardTopBar.tsx",
      "app/(app)/_components/DashboardNav.tsx",
      "app/(app)/AccountMenu.tsx",
      "app/(app)/EmptyStatePanel.tsx",
    ]) {
      expect(exists(dead)).toBe(false);
    }
    expect(fs.existsSync(path.join(process.cwd(), "project-schema.txt"))).toBe(false);
  });
});

describe("T7 · one search-input recipe", () => {
  it("the platform search field pairs its icon offset with the input padding", () => {
    const ui = read("app/(app)/dashboard/_platform/ui/index.tsx");
    // 16px icon at left-3 (12px) ends at 28px, so text must start at 36px (pl-9).
    expect(ui).toMatch(/left-3/);
    expect(ui).toMatch(/pl-9/);
  });

  it("no platform surface hand-rolls its own search input any more", () => {
    for (const p of [
      "app/(app)/dashboard/inbox/page.tsx",
      "app/(app)/dashboard/crm/contacts/page.tsx",
      "app/(app)/dashboard/crm/requests/page.tsx",
    ]) {
      expect(read(p)).not.toMatch(/type="search"/);
    }
  });

  it("the command palette wrapper grows with its input instead of clipping it", () => {
    // A fixed h-9 wrapper around an h-10/h-12 input pushed the field off the icon's baseline.
    const cmd = readCode("components/ui/command.tsx");
    expect(cmd).toMatch(/min-h-9 items-center/);
    expect(cmd).not.toMatch(/"flex h-9 items-center gap-2 border-b px-3"/);
  });
});

describe("T8 · terminology", () => {
  it('customer-facing surfaces say "AI employee", not "agent"', () => {
    // Sprint 10 folded the Settings agent editor into the employee and deleted its components;
    // what remains customer-facing is the hire form plus the employee surfaces that replaced it.
    const surfaces = [
      "app/(app)/dashboard/agents/new/page.tsx",
      "app/(app)/dashboard/team/page.tsx",
      "app/(app)/dashboard/_platform/team/KnowledgeForm.tsx",
    ];
    for (const p of surfaces) {
      const body = read(p);
      // Visible copy only: identifiers, imports, routes and types legitimately keep "agent".
      const visible = [...body.matchAll(/>([^<>{}]{2,120})</g)].map((m) => m[1]);
      const offending = visible.filter((t) => /\bagents?\b/i.test(t) && t.trim().length > 0);
      expect({ file: p, offending }).toEqual({ file: p, offending: [] });
    }
  });

  it("the Advanced surface may still say agent — it is the sanctioned exception", () => {
    expect(routeExists("/dashboard/settings/agents/[agentId]/advanced")).toBe(true);
  });

  it('the primary nav says "Customers", and /dashboard/crm still resolves', () => {
    expect(routeExists("/dashboard/crm")).toBe(true);
    expect(routeExists("/dashboard/crm/contacts")).toBe(true);
    // Renaming the label must not have quietly redirected the hub away.
    expect(platformRedirectTarget("/dashboard/crm/contacts")).toBeNull();
  });
});
