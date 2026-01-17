'use client';

import { usePathname } from 'next/navigation';
import ProfileWidget from './ProfileWidget';

/**
 * Route metadata map for breadcrumb and title generation.
 * Maps /dashboard/* paths to their display labels.
 */
const routeMeta: Record<string, { breadcrumb: string; title: string }> = {
  '/dashboard': { breadcrumb: 'Pages / Main Dashboard', title: 'Main Dashboard' },
  '/dashboard/agents': { breadcrumb: 'Pages / Agents', title: 'Agents' },
  '/dashboard/calls': { breadcrumb: 'Pages / Calls', title: 'Calls' },
  '/dashboard/leads': { breadcrumb: 'Pages / Leads', title: 'Leads' },
  '/dashboard/tickets': { breadcrumb: 'Pages / Tickets', title: 'Tickets' },
  '/dashboard/analytics': { breadcrumb: 'Pages / Analytics', title: 'Analytics' },
  '/dashboard/settings': { breadcrumb: 'Pages / Settings', title: 'Settings' },
};

/**
 * Horizon Free Topbar Component
 * Matches Horizon UI Free demo exactly:
 * - Left: breadcrumb ("Pages / <label>") + big title
 * - Right: rounded capsule with search + icons + avatar dropdown
 */
export default function HorizonTopbar() {
  const pathname = usePathname();
  
  // Get route metadata, fallback to Dashboard if route not found
  const meta = routeMeta[pathname] || { breadcrumb: 'Pages / Main Dashboard', title: 'Main Dashboard' };

  return (
    <div className="relative z-50 mb-5 mt-3 flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-6">
      {/* Left: Breadcrumb + Title */}
      <div className="min-w-0 flex-1">
        {/* Breadcrumb */}
        <p className="text-sm font-medium text-gray-600 dark:text-white/60 mb-1">
          {meta.breadcrumb}
        </p>
        {/* Big Title */}
        <h4 className="text-3xl font-bold text-navy-700 dark:text-white whitespace-nowrap">
          {meta.title}
        </h4>
      </div>

      {/* Right: Rounded Capsule with Search + Icons + Avatar */}
      <div className="mt-4 flex items-center justify-end min-w-[420px] md:mt-0">
        <ProfileWidget />
      </div>
    </div>
  );
}
