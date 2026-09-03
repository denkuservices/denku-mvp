import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function SegmentedControl({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("inline-flex items-center rounded-xl bg-gray-100 p-1 dark:bg-white/5", className)}
    >
      {children}
    </nav>
  );
}

export function SegmentedLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-white text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white"
          : "text-gray-500 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white"
      )}
    >
      {children}
    </Link>
  );
}

