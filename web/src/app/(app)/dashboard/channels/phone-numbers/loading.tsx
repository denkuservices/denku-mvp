import { TableSkeleton } from "@/components/ui/Skeleton";
import SlowLoadNotice from "../../_platform/ui/SlowLoadNotice";

/**
 * Phone Lines loading state (R-048) — replaces the previous sterile debug
 * "Loading…" div with a structure-preserving skeleton.
 */
export default function PhoneLinesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <TableSkeleton rows={5} cols={4} />
      <SlowLoadNotice />
    </div>
  );
}
