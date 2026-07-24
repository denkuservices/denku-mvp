"use client";

import React from "react";
import type { TurnRendererProps } from "./types";

/**
 * Default turn renderer — a role/direction-aware chat bubble that works for any channel
 * (voice transcript turns and chat messages alike). Channels register this by default; a
 * channel wanting a richer presentation registers its own renderer instead (the seam that
 * makes the thread plugin-based). Presentational only.
 */
export default function DefaultTurnRenderer({ turn }: TurnRendererProps) {
  const isEmployee = turn.role === "assistant" || turn.direction === "outbound";
  const isSystem = turn.role === "system";

  if (isSystem) {
    return (
      <div className="my-2 text-center">
        <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
          {turn.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isEmployee ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isEmployee
            ? "bg-brand-500 text-white"
            : "border border-gray-200 bg-white text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-70">
          {isEmployee ? "AI Employee" : "Customer"}
        </p>
        <p className="whitespace-pre-wrap break-words">{turn.content}</p>
      </div>
    </div>
  );
}
