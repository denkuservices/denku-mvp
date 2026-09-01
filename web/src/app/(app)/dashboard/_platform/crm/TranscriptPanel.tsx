import React from "react";
import Link from "next/link";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { parseTranscriptTurns } from "@/lib/platform/adapters/voice";

/**
 * What was actually said, on the page that exists because of it.
 *
 * **The gap this closes.** A ticket the AI raises from a call carries a generated subject
 * ("Support Request") and, when the caller never triggered a tool, an empty description. Opening
 * one showed a title, two timestamps, a cost and a call id — a record that something happened
 * and no way to learn what. The obvious reaction was the right one: *why was this even opened?*
 *
 * The answer was one table away the whole time. `calls.transcript` holds the conversation; the
 * artifact is downstream of it. So the request shows it inline rather than making the reader
 * find the call, open it, and come back.
 *
 * Rendered as a dialogue, not a wall of text, using the SAME splitter the ingest pipeline uses
 * (`parseTranscriptTurns`) — so what a person reads here is what the platform recorded, and the
 * two cannot drift into disagreeing about who said what.
 */

export default function TranscriptPanel({
  transcript,
  conversationHref,
  /** Shown above the transcript when the artifact recorded notes of its own. */
  notes,
  emptyLabel,
}: {
  transcript: string | null;
  conversationHref?: string | null;
  notes?: string | null;
  emptyLabel: string;
}) {
  const turns = parseTranscriptTurns(transcript);
  const trimmedNotes = notes?.trim() || "";

  if (turns.length === 0 && !trimmedNotes) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4">
      {trimmedNotes ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy-700 dark:text-white">
          {trimmedNotes}
        </p>
      ) : null}

      {turns.length > 0 ? (
        <div className={trimmedNotes ? "border-t border-gray-100 pt-4 dark:border-white/10" : ""}>
          {trimmedNotes ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              From the conversation
            </p>
          ) : null}

          <ol className="space-y-2.5">
            {turns.map((turn, i) => {
              const isCustomer = turn.role === "user";
              const isSystem = turn.role === "system";
              return (
                <li key={i} className="flex flex-col gap-1">
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      isCustomer
                        ? "text-navy-500 dark:text-gray-300"
                        : isSystem
                          ? "text-gray-400"
                          : "text-brand-600 dark:text-brand-300"
                    }`}
                  >
                    {isCustomer ? "Customer" : isSystem ? "System" : "Your AI"}
                  </span>
                  {/*
                    Side and tint carry the speaker, the way every messaging surface does it.
                    Reading a transcript is scanning for the customer's half; a uniform list of
                    paragraphs makes that a word-by-word job.
                  */}
                  <p
                    className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      isCustomer
                        ? "bg-gray-100 text-navy-700 dark:bg-white/5 dark:text-white"
                        : isSystem
                          ? "bg-transparent px-0 py-0 text-xs text-gray-400"
                          : "bg-brand-50 text-navy-700 dark:bg-brand-500/10 dark:text-white"
                    }`}
                  >
                    {turn.content}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {conversationHref ? (
        <Link
          href={conversationHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
        >
          <MessageSquare className="h-4 w-4" />
          Open the full conversation
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
