"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, BellOff, Bot, Star, Tag, UserCheck, X } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import type { ReplyReadiness } from "@/lib/platform/replyReadiness";
import Avatar from "../../_platform/Avatar";
import { channelIcon, channelIconClass } from "../../_platform/ChannelBadge";
import { setConversationStarAction } from "../_actions";
import { inbox } from "./theme";

/**
 * The conversation's header bar — who this is, on which channel, and who is answering.
 *
 * The reference puts exactly two controls here, and so do we: a **star**, and a way to see
 * everything else. The "everything else" is the customer context rail (contact, outcomes,
 * recording, takeover) — real, and too heavy to sit permanently beside a two-pane messaging
 * layout, so it arrives as a panel over the thread and leaves again. It is passed in as
 * `details` rather than built here: the rail is a server component that reads the conversation,
 * and this bar only decides when it is visible.
 */
export default function ThreadHeader({
  conversationRef,
  source,
  channel,
  displayName,
  handle,
  handling,
  readiness,
  starred,
  canStar,
  details,
}: {
  conversationRef: string;
  source: "calls" | "conversations";
  channel: Channel;
  displayName: string | null;
  handle: string | null;
  handling: "ai" | "human";
  /**
   * Whether a reply is actually coming, and why not when it isn't.
   *
   * Separate from `handling` on purpose: `handling` only records whether a person took over, and
   * reading it as "the AI is on it" is exactly the claim that turned out to be false — a real
   * message sat unanswered under a header saying otherwise, because the workspace had not bought
   * the channel. The header states what it knows, not what it hopes.
   */
  readiness: ReplyReadiness;
  starred: boolean;
  /** False when the stars migration is not applied — the control shows, disabled and honest. */
  canStar: boolean;
  details: React.ReactNode;
}) {
  const [isStarred, setIsStarred] = useState(starred);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const meta = channelMeta(channel);
  const ChannelIcon = channelIcon(channel);
  const name = displayName || handle || "Unknown contact";

  const toggleStar = () => {
    if (!canStar || pending) return;
    const next = !isStarred;
    setIsStarred(next); // optimistic — a star that lags reads as a broken button
    startTransition(async () => {
      const res = await setConversationStarAction(conversationRef, source, channel, next);
      if (!res.ok) setIsStarred(!next);
    });
  };

  return (
    <>
      <div className={`flex shrink-0 items-center gap-3 border-b px-3 py-2.5 ${inbox.frame} ${inbox.panel}`}>
        {/* On a phone the list and the thread are one column at a time, so the thread needs a
            way back to the list. Hidden on desktop, where the list never left. */}
        <Link
          href="/dashboard/inbox"
          aria-label="Back to conversations"
          className={`-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 dark:hover:bg-white/10 md:hidden ${inbox.meta}`}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <Avatar name={displayName} seed={handle || conversationRef} size="md" />

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${inbox.strong}`}>{name}</p>
          <p className={`mt-0.5 flex items-center gap-1.5 truncate text-xs ${inbox.meta}`}>
            <ChannelIcon className={`h-3.5 w-3.5 shrink-0 ${channelIconClass(channel)}`} />
            {/* The channel never truncates — it is two words at most, and "Voi…" beside a
                truncated status line told the reader nothing about either. */}
            <span className="shrink-0">{meta.label}</span>
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            {handling === "human" ? (
              <>
                <UserCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{readiness.label}</span>
              </>
            ) : readiness.willAnswer ? (
              <>
                <Bot className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{readiness.label}</span>
              </>
            ) : (
              /* Amber, not grey: this is something the owner has to act on, and it is the reason
                 a customer of theirs is waiting. The link goes straight to the remedy. */
              <span className="flex min-w-0 items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <BellOff className="h-3.5 w-3.5 shrink-0" />
                {readiness.href ? (
                  <Link href={readiness.href} className="truncate underline underline-offset-2">
                    {readiness.label}
                  </Link>
                ) : (
                  <span className="truncate">{readiness.label}</span>
                )}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={toggleStar}
          disabled={!canStar}
          aria-pressed={isStarred}
          title={canStar ? (isStarred ? "Remove star" : "Star this conversation") : "Starring isn't available yet"}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 ${inbox.meta}`}
        >
          <Star className={`h-5 w-5 ${isStarred ? "fill-[#F5B301] text-[#F5B301]" : ""}`} />
          <span className="sr-only">{isStarred ? "Starred" : "Not starred"}</span>
        </button>

        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          title="Customer, outcomes and recording"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 dark:hover:bg-white/10 ${inbox.meta}`}
        >
          <Tag className="h-5 w-5" />
          <span className="sr-only">Open conversation details</span>
        </button>
      </div>

      {/* Details panel. Over the thread rather than beside it, so the two-pane rhythm holds. */}
      {detailsOpen ? (
        <div className="absolute inset-0 z-30 flex justify-end">
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setDetailsOpen(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
          />
          <aside
            className={`relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l p-4 shadow-xl ${inbox.frame} ${inbox.panel}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className={`text-xs font-semibold uppercase tracking-wide ${inbox.metaFaint}`}>
                Conversation details
              </p>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-gray-100 dark:hover:bg-white/10 ${inbox.meta}`}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close details</span>
              </button>
            </div>
            {details}
          </aside>
        </div>
      ) : null}
    </>
  );
}
