import { ListSkeleton } from "../_platform/ui/states";

/**
 * Analytics loading state (perf, 2026-08-31). KPI grid + trend table shape; the analytics queries
 * scan the calls table over a range, so the page benefits most from an instant skeleton.
 */
export default function AnalyticsLoading() {
  return <ListSkeleton rows={6} stats={4} />;
}
