/**
 * Settings information architecture (Sprint 8.5 / R-094, audit S-004).
 *
 * **Grouped by what the customer manages, not by which table it lives in.** The previous structure
 * mirrored the org chart (Account / Workspace / Agents / Billing / Usage) and had no home for
 * Channels, Knowledge or Automations — so WhatsApp/Telegram/Email settings had nowhere natural to
 * land. Here they land under **Channels** automatically, via the Sprint 7 registry.
 *
 * Rule enforced by `settings-nav.test.ts`: **every item must be a real destination.** The old index
 * advertised "Invoices", "Payment methods", "Limits", "Behavior" as if they were pages — they were
 * plain text, several with no page at all.
 */

export interface SettingsNavItem {
  label: string;
  href: string;
  /** One-line purpose, shown on the index. Never decorative. */
  description: string;
  /** True when the destination is outside Settings (e.g. the Channels surface). */
  external?: boolean;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  /** lucide icon key, resolved by the nav component. */
  icon: string;
  items: SettingsNavItem[];
}

export const SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    id: "employees",
    label: "AI Employees",
    icon: "users",
    items: [
      {
        // Sprint 10 · R-094: configuration lives on the employee, so this points at AI Team
        // rather than a parallel editor in Settings — the same pattern as Channels below.
        label: "Your employees",
        href: "/dashboard/team",
        description:
          "Behavior, language, voice and business knowledge — configured on each AI Employee, under Setup and Knowledge.",
        external: true,
      },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    icon: "radio",
    items: [
      {
        label: "Connected channels",
        href: "/dashboard/channels",
        description:
          "Connect and monitor phone lines, Instagram, and the channels arriving next. This is the only place channels are managed — once connected, they appear as badges and filters throughout Inbox and Customers.",
        external: true,
      },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    icon: "building",
    items: [
      {
        label: "General",
        href: "/dashboard/settings/workspace/general",
        description: "Company identity, timezone and operational defaults.",
      },
      {
        label: "Team",
        href: "/dashboard/settings/workspace/members",
        description: "Who can access this workspace, and invitations.",
      },
      {
        label: "Audit log",
        href: "/dashboard/settings/workspace/audit",
        description: "A record of key actions taken in this workspace.",
      },
    ],
  },
  {
    id: "billing",
    label: "Billing & Usage",
    icon: "credit-card",
    items: [
      {
        label: "Plan & invoices",
        href: "/dashboard/settings/workspace/billing",
        description: "Your plan, payment method, add-ons and invoice history.",
      },
      {
        // Sprint 9 · T5: Usage is a section of Billing, not a destination of its own. It used to
        // be a separate page promising minutes and overage while rendering "—" and "Coming soon";
        // the real numbers were already on Billing. One concept, one place.
        label: "Usage",
        href: "/dashboard/settings/workspace/billing#usage",
        description: "Minutes used this period, included allowance and overage.",
      },
    ],
  },
  {
    id: "account",
    label: "Your account",
    icon: "user",
    items: [
      {
        label: "Profile",
        href: "/dashboard/settings/account/profile",
        description: "Your name and contact details.",
      },
      {
        label: "Security",
        href: "/dashboard/settings/account/security",
        description: "Password and sign-in security.",
      },
    ],
  },
  // Sprint 9 · T5: **Integrations is deliberately absent.** It advertised "Connect Denku to the
  // tools you already use" and delivered two disabled "Coming soon" cards — a destination that
  // was never a destination. It returns as a group when the first integration is real (R-020
  // calendar is the likely first); until then Settings promises nothing it cannot do.
];

/** Flattened items — used by the nav and by the "every item is real" contract test. */
export function allSettingsItems(): SettingsNavItem[] {
  return SETTINGS_GROUPS.flatMap((g) => g.items);
}

/** The group whose item best matches a pathname (longest match wins). */
export function activeSettingsGroup(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const g of SETTINGS_GROUPS) {
    for (const it of g.items) {
      if (pathname === it.href || pathname.startsWith(`${it.href}/`)) {
        if (!best || it.href.length > best.len) best = { id: g.id, len: it.href.length };
      }
    }
  }
  return best?.id ?? null;
}
