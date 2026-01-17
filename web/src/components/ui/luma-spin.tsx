import * as React from "react";
import { cn } from "@/lib/utils";

interface LumaSpinProps {
  className?: string;
  label?: string;
}

export function LumaSpin({ className, label }: LumaSpinProps) {
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <div className="relative size-6">
        <span className="absolute block rounded-[50px] border-[3px] border-gray-800 dark:border-gray-100 [inset:0_35px_35px_0] animate-luma-loader" />
        <span className="absolute block rounded-[50px] border-[3px] border-gray-800 dark:border-gray-100 [inset:0_35px_35px_0] animate-luma-loader [animation-delay:-1.25s]" />
      </div>
      {label && (
        <span className="ml-3 text-sm text-slate-600 dark:text-slate-400">{label}</span>
      )}
    </div>
  );
}
