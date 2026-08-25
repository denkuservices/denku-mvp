import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * The employee roster lives at AI Team (Sprint 10 · R-094).
 *
 * This route listed employees inside Settings while AI Team listed the same employees one nav
 * item away — two rosters for one set of people. The URL is kept so shipped links and bookmarks
 * still land somewhere true.
 *
 * Flag-aware on purpose: `/dashboard/team` 404s when the platform experience is off, so with the
 * flag down this forwards to the legacy roster instead of into a dead end. The rollback path has
 * to keep working.
 */
export default function SettingsAgentsPage() {
  redirect(platformUxEnabled() ? "/dashboard/team" : "/dashboard/agents");
}
