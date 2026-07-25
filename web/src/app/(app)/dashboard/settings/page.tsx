import { platformUxEnabled } from "@/lib/platform/flags";
import PlatformSettingsIndex from "../_platform/settings/PlatformSettingsIndex";
import LegacySettingsIndex from "./_components/LegacySettingsIndex";

export const dynamic = "force-dynamic";

/**
 * Settings index. Flagged variant (Sprint 8.5): the platform **control center** when
 * PLATFORM_UX_ENABLED, else the original index untouched — zero regression when off.
 */
export default function SettingsHomePage() {
  if (platformUxEnabled()) return <PlatformSettingsIndex />;
  return <LegacySettingsIndex />;
}
