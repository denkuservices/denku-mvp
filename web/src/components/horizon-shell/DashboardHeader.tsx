'use client';

interface DashboardHeaderProps {
  breadcrumb?: string;
  title: string;
}

/**
 * Horizon Free Dashboard Header
 * Left: breadcrumb + big title
 * Right side profile widget is rendered by HorizonShell (shared across all pages)
 */
export default function DashboardHeader({ breadcrumb = 'Pages / Main Dashboard', title }: DashboardHeaderProps) {
  return (
    <div className="relative z-50 mb-5 mt-3">
      {/* Left: Breadcrumb + Title */}
      <div className="min-w-0 flex-1">
        {/* Breadcrumb */}
        <p className="text-sm font-medium text-gray-600 dark:text-white/60 mb-1">
          {breadcrumb}
        </p>
        {/* Big Title */}
        <h4 className="text-3xl font-bold text-navy-700 dark:text-white whitespace-nowrap">
          {title}
        </h4>
      </div>
    </div>
  );
}
