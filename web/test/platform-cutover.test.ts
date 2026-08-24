import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateCutover, summarizeCutover, type CutoverFacts } from "@/lib/platform/cutover";
import { platformRedirectTarget } from "@/lib/platform/routeRedirects";
import { horizonNavRoutes, platformNavRoutes } from "@/components/horizon-shell/nav";
import type { NavRoute } from "@/components/horizon-shell/types";

const APP_DIR = path.join(process.cwd(), "src", "app", "(app)");

function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, "");
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

/** `NavRoute` → the URL the sidebar links to. */
function navHref(route: NavRoute): string {
  return route.path ? `/${route.layout}/${route.path}` : `/${route.layout}`;
}

const BASE_FACTS: CutoverFacts = {
  platformMigrationsApplied: true,
  contactsTablePresent: true,
  modelFlagOn: false,
  uxFlagOn: false,
  conversationCount: 0,
  linkedCallCount: 0,
  recentCallCount: 0,
  employeeChannelCount: 0,
};

const facts = (over: Partial<CutoverFacts> = {}): CutoverFacts => ({ ...BASE_FACTS, ...over });
const stage = (f: CutoverFacts, id: string) => evaluateCutover(f).find((s) => s.id === id)!;

/**
 * CUTOVER ORDERING CONTRACT (redesign Phase 1).
 *
 * The two platform flags have different preconditions, and getting them backwards is the
 * expensive mistake: sequencing the IA behind the dual-writes would block the entire redesign
 * on production traffic that only exists once the model flag is already on. These tests pin
 * the ordering so a future change cannot quietly reintroduce that coupling.
 */
describe("platform cutover — stage ordering", () => {
  it("PLATFORM_UX_ENABLED depends on NOTHING — it is flippable today", () => {
    // The read model sources calls/conversations/agents/leads/tickets/appointments, all of
    // which predate the platform migrations. This is the finding the whole roadmap rests on.
    const ux = stage(facts({ platformMigrationsApplied: false, modelFlagOn: false }), "platform_ux");
    expect(ux.dependsOn).toEqual([]);
    expect(ux.status).toBe("ready");
    expect(summarizeCutover(evaluateCutover(facts({ platformMigrationsApplied: false }))).uxReady).toBe(true);
  });

  it("the model flag is BLOCKED until the migrations are applied", () => {
    expect(stage(facts({ platformMigrationsApplied: false }), "model_dual_write").status).toBe("blocked");
    expect(stage(facts({ platformMigrationsApplied: true }), "model_dual_write").status).toBe("ready");
    expect(stage(facts({ modelFlagOn: true }), "model_dual_write").status).toBe("done");
  });

  it("parity is BLOCKED while the model flag is off — nothing writes conversations yet", () => {
    expect(stage(facts({ modelFlagOn: false }), "dual_write_parity").status).toBe("blocked");
  });

  it("parity waits for traffic rather than reporting a false pass on an empty window", () => {
    const s = stage(facts({ modelFlagOn: true, recentCallCount: 0 }), "dual_write_parity");
    expect(s.status).toBe("ready");
    expect(s.detail).toMatch(/no calls/i);
  });

  it("parity is done only when every sampled call carries conversation_id", () => {
    const partial = stage(
      facts({ modelFlagOn: true, recentCallCount: 10, linkedCallCount: 4, conversationCount: 4 }),
      "dual_write_parity"
    );
    expect(partial.status).toBe("ready");
    expect(partial.detail).toContain("4/10");

    const full = stage(
      facts({ modelFlagOn: true, recentCallCount: 10, linkedCallCount: 10, conversationCount: 10 }),
      "dual_write_parity"
    );
    expect(full.status).toBe("done");
  });

  it("read cutover (R-085) is not_implemented and depends on proven parity", () => {
    const s = stage(facts({ modelFlagOn: true, recentCallCount: 5, linkedCallCount: 5 }), "read_cutover");
    expect(s.status).toBe("not_implemented");
    expect(s.dependsOn).toEqual(["dual_write_parity"]);
  });

  it("an unprobeable fact is `unknown`, never a pass or a fail", () => {
    const f = facts({ platformMigrationsApplied: null, conversationCount: null, recentCallCount: null, linkedCallCount: null, employeeChannelCount: null });
    const summary = summarizeCutover(evaluateCutover(f));
    expect(summary.unknown).toContain("platform_migrations");
    expect(stage(f, "identity_backfill").status).toBe("unknown");
  });

  it("reports the backfill as outstanding rather than inventing employee↔channel ownership", () => {
    expect(stage(facts({ employeeChannelCount: 0 }), "identity_backfill").status).toBe("not_implemented");
    expect(stage(facts({ employeeChannelCount: 3 }), "identity_backfill").status).toBe("done");
  });
});

/**
 * FUNCTIONAL PARITY CONTRACT.
 *
 * Sprint 8.5 caught a functional regression *before* the flag flipped (platform Conversations
 * had no search/date/outcome filters vs legacy Calls). This encodes the structural half of that
 * check: flipping PLATFORM_UX_ENABLED must not make any legacy destination unreachable.
 *
 * A legacy nav destination is acceptable post-flip if it is EITHER still navigable in the
 * platform nav, OR redirected to a platform surface, OR deliberately preserved and linked from
 * one (the "no capability loss" rule in routeRedirects.ts).
 */
describe("functional parity — no legacy destination is lost when the flag flips", () => {
  /**
   * Legacy routes intentionally kept reachable instead of redirected, each linked from a
   * platform surface. Listing them here is the point: dropping a link becomes a test change,
   * not a silent capability loss.
   */
  const PRESERVED_AND_LINKED: Record<string, string> = {
    "/dashboard/phone-lines": "Channels → Manage",
    "/dashboard/instagram": "Channels → Manage",
    "/dashboard/usage": "Settings → Billing & Usage",
  };

  it("every legacy nav destination stays reachable after the flip", () => {
    const platformHrefs = new Set(platformNavRoutes.map(navHref));
    const lost: string[] = [];

    for (const route of horizonNavRoutes) {
      const href = navHref(route);
      if (platformHrefs.has(href)) continue;
      if (platformRedirectTarget(href)) continue;
      if (href in PRESERVED_AND_LINKED) continue;
      lost.push(`${route.name} (${href})`);
    }

    expect(lost).toEqual([]);
  });

  it("every preserved-and-linked legacy route still exists on disk", () => {
    const missing = Object.keys(PRESERVED_AND_LINKED).filter((href) => !routeExists(href));
    expect(missing).toEqual([]);
  });

  it("every platform nav destination resolves to a real page", () => {
    const missing = platformNavRoutes.map(navHref).filter((href) => !routeExists(href));
    expect(missing).toEqual([]);
  });

  it("every redirect target resolves to a real page (no redirect into a 404)", () => {
    // legacy source → the on-disk route its target must resolve to. Detail routes are listed
    // with their dynamic segment because that is what exists on disk.
    const cases: [source: string, expectedRoute: string][] = [
      ["/dashboard/calls", "/dashboard/conversations"],
      ["/dashboard/leads", "/dashboard/contacts"],
      ["/dashboard/leads/lead-1", "/dashboard/contacts/[contactId]"],
      ["/dashboard/agents", "/dashboard/employees"],
      ["/dashboard/agents/emp-1", "/dashboard/employees/[employeeId]"],
      ["/dashboard/tickets", "/dashboard/requests"],
      ["/dashboard/appointments", "/dashboard/requests"],
    ];

    const broken: string[] = [];
    for (const [source, expectedRoute] of cases) {
      const target = platformRedirectTarget(source);
      if (!target) {
        broken.push(`${source} → (no redirect)`);
        continue;
      }
      if (!routeExists(expectedRoute)) broken.push(`${source} → ${target} (missing ${expectedRoute}/page.tsx)`);
    }
    expect(broken).toEqual([]);
  });

  it("no redirect target is itself redirected (no loops)", () => {
    for (const src of ["/dashboard/calls", "/dashboard/leads", "/dashboard/agents", "/dashboard/tickets"]) {
      const target = platformRedirectTarget(src)!.split("?")[0];
      expect(platformRedirectTarget(target)).toBeNull();
    }
  });
});
