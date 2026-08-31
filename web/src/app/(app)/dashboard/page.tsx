import { getDashboardOverview } from '@/lib/dashboard/getDashboardOverview';
import DashboardClient from './DashboardClient';
import { platformUxEnabled } from '@/lib/platform/flags';
import PlatformDashboard from './_platform/home/PlatformDashboard';
import PlatformAnalytics from './_platform/analytics/PlatformAnalytics';
import HomeTabs, { resolveHomeTab } from './_platform/home/HomeTabs';
import SetupNudges from './_components/SetupNudges';
import { resolveRange } from '@/lib/platform/readModel/aggregate';

// Explicitly cache dashboard page to prevent automatic revalidation loops
// Revalidate every 60 seconds (or on-demand via router.refresh after mutations)
export const revalidate = 60;

/**
 * Server component for dashboard page.
 * Fetches data server-side and passes it to the client component wrapper.
 * This ensures proper App Router architecture: Server Component → Client Component.
 * 
 * Note: Plan gating is handled by middleware (web/src/middleware.ts).
 * Middleware uses canonical rule: if org_plan_limits.plan_code exists, allow /dashboard.
 * No duplicate hard guard needed here to avoid redirect loops.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Middleware already gates /dashboard based on plan_code
  // No need for duplicate check here to prevent redirect loops

  // Sprint 5.5: flagged variant — the channel/employee-aware platform home when the AI
  // Employees experience is enabled; the legacy call-metric home otherwise. Zero
  // regression: the legacy path below is unchanged and served when the flag is OFF.
  if (platformUxEnabled()) {
    // Analytics is a view of Home, not a sixth nav item (see HomeTabs). Both tabs read their
    // state from the URL so a view stays shareable — the same rule every platform filter follows.
    const sp = await searchParams;
    const tab = resolveHomeTab(sp?.tab);
    return (
      <div className="p-4 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">Home</h1>
        {/* Above both home variants, so what a customer is told does not depend on a flag. */}
        <SetupNudges />
        <HomeTabs active={tab} />
        {tab === 'analytics' ? (
          <PlatformAnalytics range={resolveRange(Array.isArray(sp?.range) ? sp.range[0] : sp?.range)} bare />
        ) : (
          <PlatformDashboard bare />
        )}
      </div>
    );
  }

  const data = await getDashboardOverview();

  return (
    <>
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <SetupNudges />
      </div>
      <DashboardClient data={data} />
    </>
  );
}
