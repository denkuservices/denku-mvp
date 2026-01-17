'use client';

import { usePathname } from 'next/navigation';
import ProfileWidget from './ProfileWidget';
import { useMobileNavOptional } from './MobileNavContext';

const routeMeta: Record<string, { breadcrumb: string; title: string }> = {
  '/dashboard': { breadcrumb: 'Pages / Main Dashboard', title: 'Main Dashboard' },
  '/dashboard/agents': { breadcrumb: 'Pages / Agents', title: 'Agents' },
  '/dashboard/calls': { breadcrumb: 'Pages / Calls', title: 'Calls' },
  '/dashboard/leads': { breadcrumb: 'Pages / Leads', title: 'Leads' },
  '/dashboard/tickets': { breadcrumb: 'Pages / Tickets', title: 'Tickets' },
  '/dashboard/analytics': { breadcrumb: 'Pages / Analytics', title: 'Analytics' },
  '/dashboard/settings': { breadcrumb: 'Pages / Settings', title: 'Settings' },
};

export default function HorizonTopbar() {
  const pathname = usePathname();
  const mobileNav = useMobileNavOptional();
  const toggleMobileNav = mobileNav?.toggleMobileNav;
  
  // Best-prefix match: find the longest route key that matches the pathname
  // Sort keys by length (longest first) to match most specific routes first
  const keys = Object.keys(routeMeta).sort((a, b) => b.length - a.length);
  const key = keys.find(k => pathname === k || pathname.startsWith(k + "/")) ?? "/dashboard";
  const meta = routeMeta[key];

  return (
    <div className="sticky top-0 z-50 mb-5 mt-3 flex flex-col gap-4 lg:static lg:z-auto lg:grid lg:grid-cols-[1fr_auto] lg:grid-rows-[auto_auto] lg:items-start">
      {/* Left */}
      <div className="min-w-0 lg:row-span-2">
        <p className="mb-1 text-sm font-medium text-gray-600 dark:text-white/60">
          {meta.breadcrumb}
        </p>
        <h4 className="text-3xl font-bold leading-tight text-navy-700 dark:text-white">
          {meta.title}
        </h4>
      </div>

      {/* Right */}
      <div className="flex w-full justify-end lg:col-start-2 lg:row-start-1 lg:self-start">
        <ProfileWidget onToggleMobileNav={toggleMobileNav} />
      </div>
    </div>
  );
}
