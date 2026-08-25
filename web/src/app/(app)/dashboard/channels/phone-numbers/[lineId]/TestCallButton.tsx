"use client";

import { useRouter, usePathname } from "next/navigation";

interface TestCallButtonProps {
  isPreviewMode?: boolean;
}

export function TestCallButton({ isPreviewMode = false }: TestCallButtonProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleTestCall = () => {
    // Prevent action in preview mode
    if (isPreviewMode) {
      return;
    }
    // Navigate to same page with ?test=1 query param
    router.push(`${pathname}?test=1`);
  };

  return (
    <button
      type="button"
      onClick={handleTestCall}
      disabled={isPreviewMode}
      title={isPreviewMode ? "Upgrade to activate this feature" : undefined}
      className={`linear flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition duration-200 dark:border-white/20 dark:bg-navy-700 dark:text-white ${
        isPreviewMode
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-navy-600 dark:active:bg-navy-500"
      }`}
    >
      Test call
    </button>
  );
}
