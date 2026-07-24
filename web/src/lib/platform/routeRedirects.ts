/**
 * Legacy → platform route redirect map (Sprint 5, P1).
 *
 * When PLATFORM_UX_ENABLED is on, old voice-first routes 301/redirect to their
 * channel-agnostic equivalents so existing bookmarks and deep links keep working:
 *   /dashboard/calls[/:id]       → /dashboard/conversations[/:id]   (1:1 — a call IS a conversation)
 *   /dashboard/phone-lines[/...] → /dashboard/channels
 *   /dashboard/instagram[/...]   → /dashboard/channels
 *   /dashboard/leads[/...]       → /dashboard/contacts
 *
 * Pure and edge-safe (no imports) so it can run in middleware. Returns null when no
 * redirect applies. New routes never match a legacy pattern → no redirect loop.
 */
export function platformRedirectTarget(pathname: string): string | null {
  // calls → conversations, preserving the detail id (a call id IS the conversation id).
  const calls = pathname.match(/^\/dashboard\/calls(\/[^/]+)?\/?$/);
  if (calls) return `/dashboard/conversations${calls[1] ?? ""}`;

  if (/^\/dashboard\/phone-lines(\/.*)?$/.test(pathname)) return "/dashboard/channels";
  if (/^\/dashboard\/instagram(\/.*)?$/.test(pathname)) return "/dashboard/channels";
  if (/^\/dashboard\/leads(\/.*)?$/.test(pathname)) return "/dashboard/contacts";

  return null;
}
