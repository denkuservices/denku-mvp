"use client";

import React from "react";
import type { ConversationTurn } from "@/lib/platform/readModel/types";
import { getRenderer } from "./renderers/registry";

/**
 * The core conversation thread (Sprint 5, P2). Channel-agnostic: it dispatches each turn to
 * its channel's registered renderer (registry.ts). Adding a channel = registering a renderer
 * — this component NEVER changes. That is owner requirement #2 (plugin-based from day one).
 */
export default function ConversationThread({ turns }: { turns: ConversationTurn[] }) {
  if (!turns || turns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-white/10">
        No message history for this conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.map((turn) => {
        const Renderer = getRenderer(turn.channel);
        return <Renderer key={turn.id} turn={turn} />;
      })}
    </div>
  );
}
