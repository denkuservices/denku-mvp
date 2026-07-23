import { TableSkeleton } from "@/components/ui/Skeleton";

/**
 * Appointments loading state (R-048) — structure-preserving skeleton instead of a
 * bare centered spinner.
 */
export default function AppointmentsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
