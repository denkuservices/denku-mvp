"use client";

import React from "react";
import type { TurnRendererProps } from "./types";
import { formatClock } from "../../format";

/**
 * Default turn renderer — a chat bubble that works for any channel (voice transcript turns and
 * chat messages alike). Channels register this by default; a channel wanting a richer
 * presentation registers its own instead (the seam that makes the thread plugin-based).
 *
 * **Inbox v2 restyled it to the messaging convention everyone already knows**: what the customer
 * said is white and on the left, what we said is green and on the right, each with the corner
 * nearest its own side squared off. That is not decoration — side and colour are how a reader
 * tells the two voices apart before reading either, which is the one thing a transcript has to
 * do at a glance. The values are WhatsApp's, and dark mode uses WhatsApp's dark ones, because
 * half-translating a borrowed metaphor reads as a mistake.
 *
 * Presentational only.
 */
/**
 * Make links in a message clickable, and nothing else.
 *
 * Chat channels carry URLs — a product page, a booking link — and a link a customer can see but
 * not open is a dead end in the middle of a conversation. Deliberately the *only* thing rendered
 * from message content: everything else stays plain text, because message bodies come from
 * customers and from the model, and no untrusted string gets to bring markup with it.
 *
 * `http`/`https` only (never `javascript:` or `data:`), opened in a new tab with `noopener`.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;

function linkify(text: string): React.ReactNode {
  if (!text || !text.includes("http")) return text;

  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    let safe: URL;
    try {
      safe = new URL(part);
    } catch {
      return part;
    }
    if (safe.protocol !== "http:" && safe.protocol !== "https:") return part;
    return (
      <a
        key={i}
        href={safe.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium underline underline-offset-2"
      >
        {part}
      </a>
    );
  });
}

export default function DefaultTurnRenderer({ turn, showTimestamp = true }: TurnRendererProps) {
  const isEmployee = turn.role === "assistant" || turn.direction === "outbound";
  const isSystem = turn.role === "system";
  const clock = showTimestamp ? formatClock(turn.at) : "";

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <span className="max-w-[85%] rounded-lg bg-[#FFF5D6] px-3 py-1.5 text-center text-xs text-[#5B5333] shadow-sm dark:bg-[#182229] dark:text-[#8696A0]">
          {turn.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isEmployee ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isEmployee
            ? "rounded-tr-none bg-[#E6F5EC] text-[#111B21] dark:bg-[#005C4B] dark:text-[#E9EDEF]"
            : "rounded-tl-none bg-white text-[#111B21] dark:bg-[#202C33] dark:text-[#E9EDEF]"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{linkify(turn.content)}</p>
        {clock ? (
          <p
            className={`mt-1 text-[10px] tabular-nums ${
              isEmployee ? "text-right" : ""
            } text-black/40 dark:text-white/50`}
          >
            {clock}
          </p>
        ) : null}
        {/* Who spoke stays available to a screen reader: colour and side carry it visually, and
            a repeated "AI EMPLOYEE" label above every bubble was the noisiest thing on the page. */}
        <span className="sr-only">{isEmployee ? "Sent by your AI Employee" : "Sent by the customer"}</span>
      </div>
    </div>
  );
}
