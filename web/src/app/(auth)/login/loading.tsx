"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";

export default function LoginLoading() {
  /*
   * A client component, not a server one: a Suspense fallback has to render immediately, and an
   * async server component reading the locale cookie would suspend in the one place that must
   * not. The provider in the auth layout sits above this slot, so the hook has what it needs.
   */
  const t = useTranslations("auth.login");

  // Paints its own opaque ground: a Suspense fallback with a transparent background
  // lets whatever is still mounted show through during the navigation.
  return (
    <div className="landing-surface flex min-h-[100vh] items-center justify-center gap-3 bg-[var(--s-bg)] text-[var(--s-ink)]">
      <Spinner className="h-7 w-7" />
      <span className="text-sm text-[var(--s-ink-faint)]">{t("loading")}</span>
    </div>
  );
}
