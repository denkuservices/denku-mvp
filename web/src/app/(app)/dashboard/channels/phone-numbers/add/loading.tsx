import { TableSkeleton } from "@/components/ui/Skeleton";
import SlowLoadNotice from "../../../_platform/ui/SlowLoadNotice";

/** Phone-line loading state — a structured skeleton rather than the word "Loading". */
export default function AddPhoneLineLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <TableSkeleton rows={4} cols={3} />
      <SlowLoadNotice />
    </div>
  );
}
