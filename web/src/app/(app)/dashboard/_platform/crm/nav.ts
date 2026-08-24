/**
 * CRM hub navigation (Phase 2 of the authenticated redesign).
 *
 * The CRM is the AI workforce's **shared memory** — not a records-management product. Its
 * sections are the things that make an AI interaction compound: who the customer is, and what
 * is currently open for them. Contacts and Requests were competing for top-level sidebar slots
 * while describing the same relationship; grouping them here keeps the primary nav flat and
 * makes the customer, not the record type, the organizing idea.
 *
 * Mirrors the Settings IA pattern deliberately (`_platform/settings/nav.ts`) so the two hubs
 * behave identically — one navigation behaviour to learn, not two.
 *
 * Rule, enforced by `crm-nav.test.ts`: **every section must resolve to a real page on disk.**
 * Companies, Deals and Pipeline are intentionally absent — they are deferred until the memory
 * layer is proven, and advertising them before they exist is the dishonesty this rule prevents.
 */

export interface CrmNavItem {
  label: string;
  href: string;
  /** One-line purpose. Never decorative. */
  description: string;
}

export const CRM_SECTIONS: CrmNavItem[] = [
  {
    label: "Contacts",
    href: "/dashboard/crm/contacts",
    description: "Everyone your AI team has talked to, and what Denku remembers about them.",
  },
  {
    label: "Requests",
    href: "/dashboard/crm/requests",
    description: "Tickets and appointment requests your AI created from conversations.",
  },
];

/** Where `/dashboard/crm` sends you. Contacts is the hub's centre of gravity. */
export const CRM_DEFAULT_HREF = CRM_SECTIONS[0].href;

/** The section matching a pathname (longest match wins), or null outside the hub. */
export function activeCrmSection(pathname: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const item of CRM_SECTIONS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.len) best = { href: item.href, len: item.href.length };
    }
  }
  return best?.href ?? null;
}
