import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const SETTINGS = path.join(SRC, "app", "(app)", "dashboard", "settings");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const BILLING = path.join(SETTINGS, "workspace", "billing");

/**
 * SPRINT 14 — "SINGLE TRACK", ungated half (R-129).
 *
 * The sprint's deletions — dormant legacy bodies, the legacy nav, PLATFORM_UX_ENABLED itself —
 * are gated by decision D1 on a 2–4 week bake period after Sprint 12, plus cutover readiness and
 * a quiet support window. None of those can be satisfied from here, so the rollback path stays.
 *
 * What is NOT gated is the re-skin: the settings pages were a light-only `zinc` scale inside a
 * platform that renders gray/navy with dark variants — the most jarring adjacency in the product
 * and the one part of it that broke in dark mode. That is done.
 */
describe("R-129 · settings speak the platform's design language", () => {
  const files = walk(SETTINGS).filter((f) => !f.startsWith(BILLING));

  it("no surviving settings page still uses the zinc scale", () => {
    const offenders = files
      .filter((f) => /\bzinc-\d/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SETTINGS, f));
    expect(offenders).toEqual([]);
  });

  it("every re-skinned surface carries dark-mode variants", () => {
    // The zinc pages were light-only; a swap that produced a light-only gray page would have
    // moved the problem rather than fixed it.
    const missing = files
      .filter((f) => {
        const body = fs.readFileSync(f, "utf8");
        const hasColour = /\b(bg|text|border)-(gray|navy|white)/.test(body);
        return hasColour && !/dark:/.test(body);
      })
      .map((f) => path.relative(SETTINGS, f));
    expect(missing).toEqual([]);
  });

  it("billing is deliberately untouched — R-131 defers the money path", () => {
    expect(fs.existsSync(path.join(BILLING, "page.tsx"))).toBe(true);
  });
});

describe("the rollback path is still intact — D1's bake period is not over", () => {
  it("the platform flag still exists", () => {
    const flags = fs.readFileSync(path.join(SRC, "lib", "platform", "flags.ts"), "utf8");
    expect(flags).toMatch(/platformUxEnabled/);
    expect(flags).toMatch(/PLATFORM_UX_ENABLED/);
  });

  it("the legacy nav still exists", () => {
    const nav = fs.readFileSync(path.join(SRC, "components", "horizon-shell", "nav.tsx"), "utf8");
    expect(nav).toMatch(/horizonNavRoutes/);
    expect(nav).toMatch(/platformNavRoutes/);
  });

  it("the legacy bodies the flag falls back to are still on disk", () => {
    for (const rel of [
      "app/(app)/dashboard/DashboardClient.tsx",
      "app/(app)/dashboard/calls/page.tsx",
      "app/(app)/dashboard/tickets/page.tsx",
      "app/(app)/dashboard/leads/page.tsx",
      "app/(app)/dashboard/agents/page.tsx",
    ]) {
      expect(fs.existsSync(path.join(SRC, rel)), `${rel} is the rollback path`).toBe(true);
    }
  });
});
