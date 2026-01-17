import { getDashboardOverview } from '@/lib/dashboard/getDashboardOverview';
import DashboardClient from './DashboardClient';

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
export default async function DashboardPage() {
  // Middleware already gates /dashboard based on plan_code
  // No need for duplicate check here to prevent redirect loops
  
  const data = await getDashboardOverview();

  return <DashboardClient data={data} />;
}
