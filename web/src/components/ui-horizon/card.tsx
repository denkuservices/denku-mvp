

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Horizon Card component - birebir Horizon'dan kopyalandı
 * Props signature: variant?: string; extra?: string; children?: JSX.Element | any[]; [x: string]: any;
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated";
  extra?: string;
  /** Kept for compatibility with the purchased Horizon template API. */
  default?: boolean;
}

function Card({
  variant = "default",
  extra,
  className,
  children,
  default: legacyElevated,
  ...rest
}: CardProps) {
  const elevated = legacyElevated || variant === "elevated";

  return (
    <div
      className={cn(
        "relative z-[5] flex min-w-0 flex-col rounded-[20px] border border-gray-200/70 bg-white bg-clip-border dark:border-white/10 dark:bg-navy-800 dark:text-white",
        elevated ? "shadow-shadow-500" : "shadow-shadow-100",
        "dark:shadow-none",
        extra,
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
export default Card;
export { Card };

