import { StatCardsSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

/**
 * Dashboard loading state (R-048) — mirrors the real layout (stat-card row + a
 * content block) so the page loads with structure instead of a bare spinner.
 */
export default function DashboardLoading() {
  return (
    <div className="px-2 pt-5 md:px-6">
      <StatCardsSkeleton count={6} />
      <div className="mt-5">
        <TableSkeleton rows={5} cols={4} />
      </div>
    </div>
  );
}
