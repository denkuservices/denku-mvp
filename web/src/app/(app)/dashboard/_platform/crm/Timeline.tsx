import React from "react";
import Link from "next/link";
import { MessagesSquare, Ticket, StickyNote, ArrowUpRight } from "lucide-react";
import type { TimelineEntry, TimelineKind } from "@/lib/platform/readModel/timeline";
import { formatWhen, titleCase } from "../format";
import ChannelBadge from "../ChannelBadge";

/**
 * Contact timeline (Phase 4) — one reverse-chronological stream across every channel and record
 * type. The visual spine (rail + node per entry) is what makes a scattered history read as a
 * single customer journey.
 *
 * Presentational only: it renders exactly the entries `buildTimeline` produced, and that function
 * never invents one. If something is not on the timeline, it is because we did not observe it.
 */

const ICONS: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
  conversation: MessagesSquare,
  request: Ticket,
  note: StickyNote,
};

function EntryBody({ entry }: { entry: TimelineEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-navy-700 dark:text-white">{entry.title}</span>
        {entry.channel ? <ChannelBadge channel={entry.channel} /> : null}
        {entry.badge ? (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            {titleCase(entry.badge)}
          </span>
        ) : null}
        {entry.href ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : null}
      </div>
      {entry.detail ? (
        <p
          className={`mt-1 text-sm text-gray-600 dark:text-gray-300 ${
            entry.kind === "note" ? "whitespace-pre-wrap" : "line-clamp-2"
          }`}
        >
          {entry.detail}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-gray-400">{formatWhen(entry.at)}</p>
    </>
  );
}

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nothing has happened with this contact yet. Conversations, requests and notes will appear
        here as one history.
      </p>
    );
  }

  return (
    <ol className="relative">
      {/* The spine. Decorative, so hidden from assistive tech — the list itself carries order. */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-[15px] top-2 w-px bg-gray-200 dark:bg-white/10"
      />
      {entries.map((entry) => {
        const Icon = ICONS[entry.kind];
        return (
          <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
            <span className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-white/10 dark:bg-navy-800 dark:text-gray-400">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              {entry.href ? (
                <Link href={entry.href} className="block rounded-lg transition hover:opacity-80">
                  <EntryBody entry={entry} />
                </Link>
              ) : (
                <EntryBody entry={entry} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
