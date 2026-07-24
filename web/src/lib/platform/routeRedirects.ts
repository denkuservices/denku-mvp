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
 *   - /dashboard/leads[/…]      — current leads; linked from the Contacts placeholder until
 *                                  the full Contacts surface ships (Sprint 5.5).
 *
 * Pure and edge-safe (no imports) so it can run in middleware. Returns null when no redirect
 * applies. The target never matches a legacy pattern → no redirect loop.
 */
export function platformRedirectTarget(pathname: string): string | null {
  if (pathname === "/dashboard/calls" || pathname === "/dashboard/calls/") {
    return "/dashboard/conversations";
  }
  return null;
}
