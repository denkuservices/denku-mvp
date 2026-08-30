"use client";

import { usePathname } from "next/navigation";

/**
 * Picks the surface class for the current marketing route.
 *
 * F5 in docs/LANDING_V3_DESIGN_PLAN.md: the marketing layout used to hardcode the
 * warm theme (`bg-[#F7F5F1] text-[#0A1A2F]`), so a dark homepage would have broken
 * every other page in the group. It no longer hardcodes anything — both
 * `.brand-surface` and `.landing-surface` define the same `--s-*` role tokens
 * (globals.css), so shared chrome and page bodies read the roles and the cascade
 * resolves them per surface. That is why the sweep to dark needed no per-page
 * conditionals.
 *
 * P6 completed the propagation: the whole `(marketing)` group now renders on the
 * dark canvas. `WARM_SURFACE_ROUTES` is the escape hatch — a route listed there
 * keeps the warm luxury theme. It is empty, and the mechanism exists so a single
 * page can be pulled back without reintroducing a hardcoded theme.
 *
 * Auth, onboarding and the dashboard are NOT covered by this file and keep
 * `.brand-surface` / Horizon respectively (CLAUDE.md design-system rule).
 */
const WARM_SURFACE_ROUTES: readonly string[] = [];

export function isDarkSurface(pathname: string): boolean {
  return !WARM_SURFACE_ROUTES.includes(pathname);
}

export function MarketingSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dark = isDarkSurface(pathname);

  return (
    <div
      data-surface={dark ? "dark" : "warm"}
      className={`${dark ? "landing-surface" : "brand-surface"} marketing flex min-h-screen flex-col bg-[var(--s-bg)] text-[var(--s-ink)]`}
    >
      {children}
    </div>
  );
}
