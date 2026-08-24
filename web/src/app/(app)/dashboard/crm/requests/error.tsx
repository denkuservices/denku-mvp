"use client";

import { useEffect } from "react";
import { ErrorState } from "../../_platform/ui/states";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[DASHBOARD][requests][ERROR]", error);
  }, [error]);
  return <ErrorState reset={reset} />;
}
