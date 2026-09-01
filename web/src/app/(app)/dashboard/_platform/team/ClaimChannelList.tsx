"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import ChannelBadge from "../ChannelBadge";
import type { Channel } from "@/lib/platform/channels";

export interface ClaimableChannel {
  channel: Channel;
  connectionId: string;
  identifier: string | null;
  /** Present when someone else already answers here — shown, never silently overwritten. */
  ownedByName: string | null;
}

/**
 * Channels this employee could answer, and the button that makes it so.
 *
 * The Channels tab used to say "No channels connected. Connect one." and link to the channels
 * inventory. For a workspace that had just finished setup that sentence was wrong twice over:
 * a channel WAS connected — the phone line bought minutes earlier — and following the link led
 * to a card whose button led to a page with no assignment control. Three screens to discover
 * there was nowhere to go.
 *
 * So the tab now answers the question it raises. Anything already plumbed and unclaimed is
 * listed here with an Assign button; the link out to connect something new stays for the case
 * where there genuinely is nothing yet.
 */
export default function ClaimChannelList({
  employeeId,
  employeeName,
  claimable,
}: {
  employeeId: string;
  employeeName: string;
  claimable: ClaimableChannel[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function assign(item: ClaimableChannel) {
    if (busy) return;
    setError(null);
    setBusy(item.connectionId);
    try {
      const res = await fetch("/api/channels/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: item.channel,
          connectionId: item.connectionId,
          employeeId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        router.refresh();
      } else {
        setError(data?.error || "Couldn't assign that channel. Please try again.");
      }
    } catch {
      setError("Couldn't assign that channel. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (claimable.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No channels connected yet — this employee has no way to reach your customers.{" "}
        <Link href="/dashboard/channels" className="text-brand-600 hover:underline dark:text-brand-300">
          Connect one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {employeeName} isn&apos;t answering anywhere yet. These channels are already connected to
        your workspace — put {employeeName} on one:
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <ul className="divide-y divide-gray-100 dark:divide-white/10">
        {claimable.map((item) => (
          <li key={item.connectionId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
            <ChannelBadge channel={item.channel} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-600 dark:text-gray-300">
              {item.identifier || "—"}
              {item.ownedByName ? (
                // Reassignment is allowed but never accidental: whose it is now is on the row.
                <span className="ml-2 text-xs text-gray-400">Currently {item.ownedByName}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => void assign(item)}
              disabled={Boolean(busy)}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {busy === item.connectionId ? "Assigning…" : item.ownedByName ? "Move here" : "Assign"}
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/channels"
        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline dark:text-brand-300"
      >
        <Plug className="h-3.5 w-3.5" />
        Connect another channel
      </Link>
    </div>
  );
}
