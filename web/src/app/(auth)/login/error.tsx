"use client";

import { useTranslations } from "next-intl";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("auth.login");

  return (
    <div className="rounded-2xl border p-6 bg-[var(--s-panel)]">
      <h2 className="text-lg font-semibold">{t("errorTitle")}</h2>
      <p className="mt-2 text-sm text-red-600">{error.message}</p>
      <button
        className="mt-4 rounded-md border px-3 py-2 text-sm"
        onClick={() => reset()}
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
