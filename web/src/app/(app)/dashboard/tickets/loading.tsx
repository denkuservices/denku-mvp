import { ListSkeleton } from "../_platform/ui/states";

/** Tickets loading state (perf, 2026-08-31) — structure-preserving skeleton for the list page. */
export default function TicketsLoading() {
  return <ListSkeleton rows={8} />;
}
