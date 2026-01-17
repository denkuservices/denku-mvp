import { Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-3">
      <Spinner className="h-7 w-7" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}

