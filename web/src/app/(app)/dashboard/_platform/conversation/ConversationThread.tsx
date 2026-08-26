"use client";

import React from "react";
import type { ConversationTurn } from "@/lib/platform/readModel/types";
import { getRenderer } from "./renderers/registry";
import { formatClock } from "../format";

/**
 * The core conversation thread (Sprint 5, P2). Channel-agnostic: it dispatches each turn to
 * its channel's registered renderer (registry.ts). Adding a channel = registering a renderer
 * — this component NEVER changes shape. That is owner requirement #2 (plugin-based from day one).
 *
 * Two things it owns, because they are about the thread rather than about a turn (Inbox v2):
 * the **day divider** that keeps a long history navigable, and **which turns print a clock**.
 * A voice transcript stamps every turn with the call's start time, so left to itself each bubble
 * would repeat the same minute down the whole page; the time is printed only where it changes.
 */
export default function ConversationThread({ turns }: { turns: ConversationTurn[] }) {
  if (!turns || turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="rounded-lg bg-[#FFF5D6] px-3 py-1.5 text-center text-xs text-[#5B5333] shadow-sm dark:bg-[#182229] dark:text-[#8696A0]">
          No message history for this conversation.
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
      {turns.map((turn, i) => {
        const Renderer = getRenderer(turn.channel);
        const prev = turns[i - 1];
        const next = turns[i + 1];
        const showDay = dayKey(turn.at) !== dayKey(prev?.at ?? null);
        // Print the clock only on the last turn of a run sharing the same minute.
        const showTimestamp = !next || formatClock(next.at) !== formatClock(turn.at);

        return (
          <React.Fragment key={turn.id}>
            {showDay && turn.at ? <DayDivider at={turn.at} /> : null}
            {/* Consecutive bubbles from the same speaker sit closer than a change of speaker. */}
            <div className={prev && sameSide(prev, turn) ? "" : "mt-1.5"}>
              <Renderer turn={turn} showTimestamp={showTimestamp} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function sameSide(a: ConversationTurn, b: ConversationTurn): boolean {
  const side = (t: ConversationTurn) => t.role === "assistant" || t.direction === "outbound";
  return side(a) === side(b);
}

function dayKey(at: string | null | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

/** "Today" / "Yesterday" / a date — the anchor that makes a long history scannable. */
function DayDivider({ at }: { at: string }) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const label =
    d.toDateString() === today.toDateString()
      ? "Today"
      : d.toDateString() === yesterday.toDateString()
        ? "Yesterday"
        : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-lg bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 shadow-sm dark:bg-[#182229] dark:text-[#8696A0]">
        {label}
      </span>
    </div>
  );
}
