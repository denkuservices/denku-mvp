import { platformUxEnabled } from "@/lib/platform/flags";
import SettingsNav from "../_platform/settings/SettingsNav";

/**
 * Settings layout (Sprint 8.5 / R-128, audit S-001).
 *
 * Gives **every** settings page a persistent navigation rail in one file. Previously Settings had no
 * navigation at all — switching from Billing to Team meant routing back through the index.
 *
 * Flag-gated: when `PLATFORM_UX_ENABLED` is off, children render exactly as before (zero change to
 * the legacy experience).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!platformUxEnabled()) return <>{children}</>;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:flex-row lg:gap-8">
      <SettingsNav />
      {/* Pages bring their own padding; strip the duplicate here so the rail aligns. */}
      <div className="min-w-0 flex-1 [&>div]:!p-0">{children}</div>
    </div>
  );
}
