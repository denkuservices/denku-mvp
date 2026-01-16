import { getDashboardOverview } from '@/lib/dashboard/getDashboardOverview';
import DashboardClient from './DashboardClient';
import { checkOnboardingAndRedirect } from '@/lib/auth/checkOnboarding';

/**
 * Server component for dashboard page.
 * Fetches data server-side and passes it to the client component wrapper.
 * This ensures proper App Router architecture: Server Component → Client Component.
 * 
 * Hard guard: Redirects to /onboarding if onboarding not completed.
 */
export default async function DashboardPage() {
  // Check onboarding completion - will redirect if not completed
  await checkOnboardingAndRedirect();
  
  const data = await getDashboardOverview();

  return <DashboardClient data={data} />;
}
