"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function SuccessBanner() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-green-900 dark:text-green-100">
          Your new phone line is live.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/phone-lines"
            className="text-sm font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
          >
            Back to Phone Lines
          </Link>
          <button
            onClick={() => {
              // Placeholder for test call
              alert("Test call coming soon");
            }}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition duration-200 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
          >
            Test call
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
