import { ListSkeleton } from "../_platform/ui/states";

/**
 * Calls loading state (perf, 2026-08-31). This route is `force-dynamic` and its query is heavy
 * (calls + artifact matching), so without a skeleton a menu click looked like a frozen app. Stat
 * row + table shape matches the real page so nothing jumps when the data arrives.
 */
export default function CallsLoading() {
  return <ListSkeleton rows={8} stats={4} />;
}
