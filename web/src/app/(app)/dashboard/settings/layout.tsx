import { platformUxEnabled } from "@/lib/platform/flags";
import SettingsNav from "../_platform/settings/SettingsNav";

/**
 * Settings layout (Sprint 8.5 / R-128, audit S-001).
 *
 * Gives **every** settings page a persistent navigation rail in one file. Previously Settings had no
 * navigation at all — switching from Billing to Team meant routing back through the index.
 *
 * The layout owns the page frame: padding, the gap to the rail, and a reading width. Pages used to
 * bring their own `p-6` (and Billing brought a whole second shell), which is why the rail and the
 * content it points at never quite lined up — `[&>div]:!p-0` is the seam that kept them honest and
 * stays until every page has stopped padding itself. The `max-w-5xl` cap is deliberate: settings
 * are forms, and a form field stretched across a 27-inch monitor is harder to fill in, not easier.
 *
 * Flag-gated: when `PLATFORM_UX_ENABLED` is off, children render exactly as before (zero change to
 * the legacy experience).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!platformUxEnabled()) return <>{children}</>;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:flex-row lg:gap-8">
      <SettingsNav />
      <div className="min-w-0 flex-1 lg:max-w-5xl [&>div]:!p-0">{children}</div>
    </div>
  );
}
