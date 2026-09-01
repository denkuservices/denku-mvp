/**
 * Legacy → platform route redirect map (Sprint 5 · retargeted for the Phase 2 IA).
 *
 * Runs in middleware when PLATFORM_UX_ENABLED is on. Two kinds of source live here:
 *
 * 1. **Voice-first legacy routes** whose LIST view is fully replaced by a channel-agnostic
 *    surface. Their bookmarks must keep working.
 * 2. **First-generation platform routes** (`/conversations`, `/employees`, `/contacts`,
 *    `/requests`) renamed in Phase 2 to the approved IA. These never shipped to production —
 *    PLATFORM_UX_ENABLED has always been off there — so this is insurance for preview/staging
 *    sessions and in-flight links, not a compatibility debt.
 *
 * The IA, for reference:
 *   Home /dashboard · Inbox /dashboard/inbox · CRM /dashboard/crm/{contacts,requests}
 *   · AI Team /dashboard/team · Analytics · Settings. Channels is configuration
 *   (/dashboard/channels, reached from Settings), deliberately not primary navigation.
 *
 * **The no-capability-loss rule.** Only LIST views redirect. Rich detail and management pages
 * stay reachable and are LINKED from the new surfaces rather than hidden:
 *   - /dashboard/calls/:id       — full call detail (recording, cost) ← linked from the thread
 *   - /dashboard/channels/phone-numbers[/…] — number purchase/management (Sprint 11: moved
 *     under Channels; the old /dashboard/phone-lines URLs forward there)
 *   - /dashboard/channels/instagram         — IG connect/management (same move)
 *   - /dashboard/tickets/:id, /tickets/new, /leads/new, /agents/new  — no replacement yet
 * `test/platform-cutover.test.ts` fails if any of those becomes unreachable.
 *
 * Pure and edge-safe (no imports) so it can run in middleware. Returns null when no redirect
 * applies; no target matches a source pattern, so there are no loops.
 */

/** Matches `/dashboard/<base>` and `/dashboard/<base>/<segment>`, tolerating a trailing slash. */
function matchListOrDetail(pathname: string, base: string): { segment: string | null } | null {
  const m = pathname.match(new RegExp(`^/dashboard/${base}(/[^/]+)?/?$`));
  return m ? { segment: m[1] ?? null } : null;
}

export function platformRedirectTarget(pathname: string): string | null {
  // --- 1. Legacy voice-first routes ----------------------------------------

  // Analytics is a TAB on Home, not a surface of its own: Home already leads with outcomes, so a
  // separate page repeating the same numbers made the sidebar answer one question twice. Every
  // capability Sprint 12 restored (ranges, comparison, hourly rhythm, CSV export) renders there.
  // A target may carry a query; the middleware merges it over the incoming one, so a shared
  // `/dashboard/analytics?range=30d` keeps its window.
  if (pathname === "/dashboard/analytics" || pathname === "/dashboard/analytics/") {
    return "/dashboard?tab=analytics";
  }

  // The call LIST is replaced by the unified Inbox (voice is one channel among several).
  // Call DETAIL is untouched — it carries the recording and cost breakdown.
  if (pathname === "/dashboard/calls" || pathname === "/dashboard/calls/") {
    return "/dashboard/inbox";
  }

  // leads → CRM contacts. Lossless: Contacts reads `leads` and uses the lead id as the
  // contact id (1:1). The create form has no Contacts equivalent yet, so it stays reachable.
  const leads = matchListOrDetail(pathname, "leads");
  if (leads) {
    if (leads.segment === "/new") return null;
    return `/dashboard/crm/contacts${leads.segment ?? ""}`;
  }

  // agents roster → AI Team. Does NOT match /dashboard/settings/agents (the config surface,
  // deliberately untouched until R-094 folds it into the employee detail).
  const agents = matchListOrDetail(pathname, "agents");
  if (agents) {
    if (agents.segment === "/new") return null;
    return `/dashboard/team${agents.segment ?? ""}`;
  }

  // R-122: Tickets and Appointments were one concept split across two tables → one Requests
  // surface, now living inside the CRM hub.
  if (pathname === "/dashboard/tickets" || pathname === "/dashboard/tickets/") {
    return "/dashboard/crm/requests?type=ticket";
  }
  if (pathname === "/dashboard/appointments" || pathname === "/dashboard/appointments/") {
    return "/dashboard/crm/appointments";
  }

  // --- 2. First-generation platform routes renamed in Phase 2 ---------------

  const conversations = matchListOrDetail(pathname, "conversations");
  if (conversations) return `/dashboard/inbox${conversations.segment ?? ""}`;

  const employees = matchListOrDetail(pathname, "employees");
  if (employees) return `/dashboard/team${employees.segment ?? ""}`;

  const contacts = matchListOrDetail(pathname, "contacts");
  if (contacts) return `/dashboard/crm/contacts${contacts.segment ?? ""}`;

  if (pathname === "/dashboard/requests" || pathname === "/dashboard/requests/") {
    return "/dashboard/crm/requests";
  }

  return null;
}

/**
 * Split a redirect target into its path and its query pairs.
 *
 * Targets in this map may carry a query — `/dashboard/crm/requests?type=ticket` has since
 * Sprint 13, and `/dashboard?tab=analytics` does now. The middleware used to assign the whole
 * string to `url.pathname`, which percent-encodes the `?`: `/dashboard/tickets` redirected to
 * `/dashboard/crm/requests%3Ftype=ticket` and 404'd. The map's own tests passed throughout,
 * because they exercise this function and never the middleware that consumes it.
 *
 * Pure and edge-safe, so both the middleware and a test can use it.
 */
export function splitRedirectTarget(target: string): { path: string; query: Array<[string, string]> } {
  const [path, rawQuery] = target.split("?");
  const query: Array<[string, string]> = [];
  if (rawQuery) {
    for (const pair of rawQuery.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? "" : pair.slice(eq + 1);
      query.push([decodeURIComponent(k), decodeURIComponent(v)]);
    }
  }
  return { path, query };
}
