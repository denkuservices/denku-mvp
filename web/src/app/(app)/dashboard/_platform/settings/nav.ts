/**
 * Settings information architecture.
 *
 * **Three destinations, not nine.** Sprint 8.5 grouped Settings by what the customer manages
 * rather than by which table things live in — the right instinct — but it left nine separate
 * pages behind five group headings, and an index that listed all of them a second time. A
 * customer changing their password crossed three navigation layers to get there: the product nav,
 * the settings rail, and a tab strip inside Account.
 *
 * What actually differs is narrower than nine pages:
 *   - **Workspace** — the business, who can reach it, how it runs (was General + Members + the
 *     runtime and control cards, joined by quick-links).
 *   - **Billing & usage** — money. Usage is a section of it, never a peer (Sprint 9 · T5).
 *   - **Account** — *me*, as opposed to the workspace (was Profile + Security + their own layout).
 *
 * Everything else that looked like a settings section was configuration that belongs on the
 * object it configures: employee behaviour lives on the employee (R-094), channel connections
 * live under Channels (Sprint 11). Those are wayfinding, marked `external`, and rendered apart
 * so the rail never implies five sections where there are three.
 *
 * The audit log keeps its own route, linked from Workspace: it is a paginated record rather than
 * a setting, and embedding it would leave that page with no bottom.
 *
 * Rules enforced by `settings-nav.test.ts`: every item resolves to a real page, no item is
 * reachable from two places, and the landing target is a real section rather than a pointer.
 */

export interface SettingsNavItem {
  label: string;
  href: string;
  /** One-line purpose. Never decorative. */
  description: string;
  /** True when the destination is outside Settings (e.g. the Channels surface). */
  external?: boolean;
}

/** Where `/dashboard/settings` lands — Settings has no index of its own. */
export const SETTINGS_LANDING = "/dashboard/settings/workspace";

/** The settings sections themselves. */
export const SETTINGS_ITEMS: SettingsNavItem[] = [
  {
    label: "Workspace",
    href: "/dashboard/settings/workspace",
    description: "Your business, who can access it, and how it runs.",
  },
  {
    label: "Billing & usage",
    href: "/dashboard/settings/workspace/billing",
    description: "Plan, minutes used, invoices and payment method.",
  },
  {
    label: "Account",
    href: "/dashboard/settings/account",
    description: "Your details and how you sign in.",
  },
];

/**
 * Reachable from Settings, configured elsewhere. Kept because someone hunting in Settings for
 * "where do I change what my AI says" should find the way out, not a dead end.
 */
export const SETTINGS_ELSEWHERE: SettingsNavItem[] = [
  {
    label: "AI Employees",
    href: "/dashboard/team",
    description: "Behaviour, language and business knowledge — set on each employee.",
    external: true,
  },
  {
    label: "Channels",
    href: "/dashboard/channels",
    description: "Phone lines, Instagram, and the channels arriving next.",
    external: true,
  },
];

/** Everything navigable from the rail — used by the nav and the "every item is real" test. */
export function allSettingsItems(): SettingsNavItem[] {
  return [...SETTINGS_ITEMS, ...SETTINGS_ELSEWHERE];
}

/** The item whose href best matches a pathname (longest match wins), or null. */
export function activeSettingsItem(pathname: string): SettingsNavItem | null {
  let best: { item: SettingsNavItem; len: number } | null = null;
  for (const item of allSettingsItems()) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.len) best = { item, len: item.href.length };
    }
  }
  return best?.item ?? null;
}
