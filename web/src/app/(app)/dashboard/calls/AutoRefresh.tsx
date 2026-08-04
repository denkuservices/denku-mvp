"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = {
  intervalMs?: number; // default 5000
  enabled?: boolean;   // default true
};

export default function AutoRefresh({ intervalMs = 5000, enabled = true }: Props) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      // Avoid refreshing when tab is hidden (saves bandwidth & avoids flicker)
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    };

    // Initial soft refresh shortly after mount
    const initial = window.setTimeout(tick, 800);

    timerRef.current = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      // When user comes back to the tab, refresh immediately
      if (!document.hidden) tick();
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(initial);
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs, enabled]);

  return null;
}
