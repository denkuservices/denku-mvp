import { Spinner } from "@/components/ui/spinner";

export default function LoginLoading() {
  // Paints its own opaque ground: a Suspense fallback with a transparent background
  // lets whatever is still mounted show through during the navigation.
  return (
    <div className="landing-surface flex min-h-[100vh] items-center justify-center gap-3 bg-[var(--s-bg)] text-[var(--s-ink)]">
      <Spinner className="h-7 w-7" />
      <span className="text-sm text-[var(--s-ink-faint)]">Loading...</span>
    </div>
  );
}
