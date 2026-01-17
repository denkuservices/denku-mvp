import { getDashboardOverview } from '@/lib/dashboard/getDashboardOverview';
import DashboardClient from './DashboardClient';
import { checkPlanActiveAndRedirect } from '@/lib/auth/checkOnboarding';

// Explicitly cache dashboard page to prevent automatic revalidation loops
// Revalidate every 60 seconds (or on-demand via router.refresh after mutations)
export const revalidate = 60;

/**
 * Server component for dashboard page.
 * Fetches data server-side and passes it to the client component wrapper.
 * This ensures proper App Router architecture: Server Component → Client Component.
 * 
 * Hard guard: Redirects to /onboarding if plan not active.
 */
export default async function DashboardPage() {
  // Check plan active status - will redirect to /onboarding if plan not active
  await checkPlanActiveAndRedirect();
  
  const data = await getDashboardOverview();

  return <DashboardClient data={data} />;
}
