import { GridSkeleton } from "../_platform/ui/states";

/** Agents loading state (perf, 2026-08-31) — card-grid skeleton matching the employees layout. */
export default function AgentsLoading() {
  return <GridSkeleton cards={3} />;
}
