import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { SETTINGS_LANDING } from "../_platform/settings/nav";
import LegacySettingsIndex from "./_components/LegacySettingsIndex";

export const dynamic = "force-dynamic";

/**
 * Settings has no index page — it lands on its first section.
 *
 * Sprint 8.5 gave Settings a persistent nav rail, which was the right fix for having no
 * navigation at all. But the index kept listing every destination too, so arriving at
 * `/dashboard/settings` showed the same nine items **twice** — once in the rail, once as cards
 * with a paragraph of explanation each. A page whose only job is to route you somewhere, sitting
 * next to a rail that already does that.
 *
 * Stripe, Linear and Vercel all resolve settings to a real section with the rail visible; none
 * has a menu-of-menus. The status the index carried (employees, channels needing attention) is
 * not lost — it is on Home's "Needs attention", where a customer sees it without going looking.
 *
 * The legacy index is untouched: with the flag off, nothing about this changes.
 */
export default function SettingsHomePage() {
  if (platformUxEnabled()) redirect(SETTINGS_LANDING);
  return <LegacySettingsIndex />;
}
