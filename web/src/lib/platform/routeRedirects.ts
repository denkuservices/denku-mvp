/**
 * Legacy → platform route redirect map (Sprint 5, P1/P3).
 *
 * When PLATFORM_UX_ENABLED is on, the old voice-first **list** views that are FULLY
 * replaced by a channel-agnostic surface redirect to it, preserving bookmarks:
 *   /dashboard/calls  → /dashboard/conversations   (the unified inbox replaces the call list)
 *
 * Deliberately NOT redirected (to avoid capability loss — a cleaner design than a blanket
 * collapse): the rich detail / management pages stay reachable and are LINKED from the new
 * surfaces instead of hidden:
 *   - /dashboard/calls/:id      — full call detail (recording, cost); linked from the
 *                                  conversation thread ("Full call details").
 *   - /dashboard/phone-lines[/…]— number purchase/management; linked from Channels ("Manage").
 *   - /dashboard/instagram      — IG connect/management; linked from Channels ("Manage").
 *
 * Redirected as of Sprint 5.5 (their platform replacements are now real):
 *   /dashboard/leads[/:id] → /dashboard/contacts[/:id]  — Contacts reads `leads` and uses
 *                              the lead id as the contact id, so this is lossless (1:1).
 *
 * Still NOT redirected (reachable, linked from the new surfaces to avoid capability loss):
 *   - /dashboard/calls/:id       — full call detail (recording, cost).
 *   - /dashboard/phone-lines[/…] — number purchase/management.
 *   - /dashboard/instagram       — IG connect/management.
 *
 * Pure and edge-safe (no imports) so it can run in middleware. Returns null when no redirect
 * applies. The target never matches a legacy pattern → no redirect loop.
 */
export function platformRedirectTarget(pathname: string): string | null {
  if (pathname === "/dashboard/calls" || pathname === "/dashboard/calls/") {
    return "/dashboard/conversations";
  }
  // leads list + detail → contacts (contact id = lead id → lossless). Keep the create
  // form (/dashboard/leads/new) reachable — Contacts has no create surface yet.
  const leads = pathname.match(/^\/dashboard\/leads(\/[^/]+)?\/?$/);
  if (leads) {
    const seg = leads[1];
    if (seg === "/new") return null;
    return `/dashboard/contacts${seg ?? ""}`;
  }

  return null;
}
