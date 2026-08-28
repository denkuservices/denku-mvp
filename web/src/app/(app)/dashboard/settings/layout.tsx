import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * Settings layout (Sprint 8.5 / R-128, audit S-001; the rail moved into the sidebar afterwards).
 *
 * Settings once had no navigation at all — switching from Billing to Team meant routing back
 * through the index — so this layout gave every settings page a persistent rail. The rail worked,
 * but it lived *inside the page*: a second navigation column beside the product's own sidebar,
 * carrying a paragraph of description per item, pushing the forms it pointed at into a narrow
 * strip. Settings became the only surface whose navigation sat somewhere different from every
 * other surface's.
 *
 * The sections are now **sub-items of Settings in the sidebar** (`components/horizon-shell/nav`),
 * where the rest of the product's navigation already is, and this layout is only the page frame:
 * padding and a reading width. `[&>div]:!p-0` is the seam that keeps pages which still bring their
 * own `p-6` from doubling it, and stays until they all stop. The `max-w-5xl` cap is deliberate:
 * settings are forms, and a form field stretched across a 27-inch monitor is harder to fill in,
 * not easier.
 *
 * Flag-gated: when `PLATFORM_UX_ENABLED` is off, children render exactly as before (zero change to
 * the legacy experience).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!platformUxEnabled()) return <>{children}</>;

  return (
    <div className="p-4 md:p-6">
      <div className="min-w-0 max-w-5xl [&>div]:!p-0">{children}</div>
    </div>
  );
}
