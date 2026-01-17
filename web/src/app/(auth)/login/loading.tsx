import { Spinner } from "@/components/ui/spinner";

export default function LoginLoading() {
  return (
    <div className="flex min-h-[100vh] items-center justify-center gap-3">
      <Spinner className="h-7 w-7" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}
