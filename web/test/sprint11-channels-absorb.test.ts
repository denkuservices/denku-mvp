import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { platformRedirectTarget } from "@/lib/platform/routeRedirects";
import { platformNavRoutes, horizonNavRoutes } from "@/components/horizon-shell/nav";

const SRC = path.join(process.cwd(), "src");
const APP_DIR = path.join(SRC, "app", "(app)");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, "").split("#")[0].split("?")[0];
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

/**
 * SPRINT 11 — "CHANNELS ABSORB".
 *
 * Phone numbers and Instagram were top-level product areas while the architecture already
 * treated them as channels: `employee_channels` binds an employee to what it answers, and the
 * Channels registry renders voice as one card among peers. Keeping a voice-only nav item
 * re-privileged the channel the model had just de-privileged — and set the precedent that
 * WhatsApp would arrive wanting its own page.
 *
 * The rule these tests exist to hold: **nothing was hidden, only moved.** Every URL that ever
 * shipped still resolves.
 */
describe("phone numbers live under Channels", () => {
  it("the moved routes exist in their new home", () => {
    expect(routeExists("/dashboard/channels/phone-numbers")).toBe(true);
    expect(routeExists("/dashboard/channels/phone-numbers/add")).toBe(true);
    expect(routeExists("/dashboard/channels/phone-numbers/[lineId]")).toBe(true);
  });

  it("every old phone-line URL still resolves and forwards", () => {
    for (const old of ["/dashboard/phone-lines", "/dashboard/phone-lines/add", "/dashboard/phone-lines/[lineId]"]) {
      expect(routeExists(old), `${old} must still exist as a redirect`).toBe(true);
    }
    expect(readCode("app/(app)/dashboard/phone-lines/page.tsx")).toMatch(
      /redirect\(["'`]\/dashboard\/channels\/phone-numbers["'`]\)/
    );
    expect(readCode("app/(app)/dashboard/phone-lines/add/page.tsx")).toMatch(/channels\/phone-numbers\/add/);
    expect(readCode("app/(app)/dashboard/phone-lines/[lineId]/page.tsx")).toMatch(
      /channels\/phone-numbers\/\$\{lineId\}/
    );
  });

  it("the old URLs forward unconditionally — the legacy sidebar still points at them", () => {
    // With PLATFORM_UX_ENABLED off the legacy nav links to /dashboard/phone-lines, and the
    // destination is not flag-gated, so these redirects must not depend on the flag.
    const legacyPaths = horizonNavRoutes.map((r) => r.path);
    expect(legacyPaths).toContain("phone-lines");
    expect(readCode("app/(app)/dashboard/phone-lines/page.tsx")).not.toMatch(/platformUxEnabled/);
    expect(readCode("app/(app)/dashboard/instagram/page.tsx")).not.toMatch(/platformUxEnabled/);
  });

  it("the purchase flow moved as-is — its API and compensation logic are untouched", () => {
    const modal = read("app/(app)/dashboard/channels/phone-numbers/_components/AddPhoneNumberModal.tsx");
    expect(modal).toMatch(/\/api\/phone-lines\/purchase/);
  });
});

describe("Instagram lives under Channels", () => {
  it("the moved route exists and the old URL forwards", () => {
    expect(routeExists("/dashboard/channels/instagram")).toBe(true);
    expect(routeExists("/dashboard/instagram")).toBe(true);
    expect(readCode("app/(app)/dashboard/instagram/page.tsx")).toMatch(/channels\/instagram/);
  });

  it("the OAuth round trip returns to the new location, not through a second hop", () => {
    for (const p of ["app/api/instagram/oauth/start/route.ts", "app/api/instagram/oauth/callback/route.ts"]) {
      const body = read(p);
      expect(body).toMatch(/\/dashboard\/channels\/instagram/);
      expect(body).not.toMatch(/["'`]\/dashboard\/instagram["'`]/);
    }
  });
});

describe("Channels is the way in", () => {
  it("the channel cards point at the new locations", () => {
    const card = readCode("app/(app)/dashboard/_platform/channels/ChannelCard.tsx");
    expect(card).toMatch(/channels\/phone-numbers/);
    expect(card).toMatch(/channels\/instagram/);
    expect(card).not.toMatch(/["'`]\/dashboard\/phone-lines/);
    expect(card).not.toMatch(/["'`]\/dashboard\/instagram["'`]/);
  });

  it("no channel became a primary nav item — the whole point of the move", () => {
    const names = platformNavRoutes.map((r) => r.name.toLowerCase());
    for (const channelish of ["instagram", "whatsapp", "phone lines", "phone numbers", "channels"]) {
      expect(names).not.toContain(channelish);
    }
  });

  it("the primary nav is still the approved six", () => {
    expect(platformNavRoutes).toHaveLength(6);
  });
});

describe("creating things happens where they live", () => {
  it("hiring an employee is on AI Team", () => {
    expect(routeExists("/dashboard/team/new")).toBe(true);
    const team = readCode("app/(app)/dashboard/team/page.tsx");
    expect(team).toMatch(/\/dashboard\/team\/new/);
    expect(team).toMatch(/Hire an AI employee/);
  });

  it("the hire form reuses the existing server action rather than a new write path", () => {
    const hire = read("app/(app)/dashboard/team/new/page.tsx");
    expect(hire).toMatch(/createAgentAction/);
    expect(hire).not.toMatch(/supabaseAdmin|vapiFetch/);
  });

  it("adding a contact is in Customers", () => {
    expect(routeExists("/dashboard/crm/contacts/new")).toBe(true);
    const contacts = readCode("app/(app)/dashboard/crm/contacts/page.tsx");
    expect(contacts).toMatch(/\/dashboard\/crm\/contacts\/new/);
    expect(contacts).toMatch(/Add contact/);
  });

  it("the add-contact page reuses the existing form and action", () => {
    const page = read("app/(app)/dashboard/crm/contacts/new/page.tsx");
    expect(page).toMatch(/NewLeadForm/);
    expect(page).not.toMatch(/createLead\(/);
  });

  it("the orphaned creator URLs still resolve", () => {
    expect(routeExists("/dashboard/agents/new")).toBe(true);
    expect(routeExists("/dashboard/leads/new")).toBe(true);
    expect(readCode("app/(app)/dashboard/agents/new/page.tsx")).toMatch(/\/dashboard\/team\/new/);
    expect(readCode("app/(app)/dashboard/leads/new/page.tsx")).toMatch(/\/dashboard\/crm\/contacts\/new/);
  });

  it("those creator redirects are still excluded from the middleware list redirects", () => {
    // routeRedirects deliberately returns null for `/new` so the page itself can decide.
    expect(platformRedirectTarget("/dashboard/agents/new")).toBeNull();
    expect(platformRedirectTarget("/dashboard/leads/new")).toBeNull();
  });
});

describe("nothing was hidden", () => {
  it("no redirect points at a route that does not exist", () => {
    const pairs: Array<[string, string]> = [
      ["/dashboard/phone-lines", "/dashboard/channels/phone-numbers"],
      ["/dashboard/phone-lines/add", "/dashboard/channels/phone-numbers/add"],
      ["/dashboard/phone-lines/[lineId]", "/dashboard/channels/phone-numbers/[lineId]"],
      ["/dashboard/instagram", "/dashboard/channels/instagram"],
      ["/dashboard/agents/new", "/dashboard/team/new"],
      ["/dashboard/leads/new", "/dashboard/crm/contacts/new"],
    ];
    const broken = pairs.filter(([, target]) => !routeExists(target)).map(([from, to]) => `${from} → ${to}`);
    expect(broken).toEqual([]);
  });

  it("the phone-number management pages are not flag-gated — they serve both modes", () => {
    for (const p of [
      "app/(app)/dashboard/channels/phone-numbers/page.tsx",
      "app/(app)/dashboard/channels/phone-numbers/[lineId]/page.tsx",
    ]) {
      expect(readCode(p)).not.toMatch(/platformUxEnabled/);
    }
  });
});
