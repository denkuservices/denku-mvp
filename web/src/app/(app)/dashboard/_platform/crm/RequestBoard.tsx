"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { RequestView } from "@/lib/platform/readModel/requests";
import { BOARD_COLUMNS, groupIntoBoard } from "@/lib/platform/crm/board";
import { moveRequestToStatus } from "./_actions/board";
import { formatWhen, titleCase } from "../format";
import { Pill } from "../ui";

/**
 * Requests as a board.
 *
 * Two ways to move a card, deliberately. Dragging is what a board is for, and it is the fast path
 * on a desktop. But HTML5 drag-and-drop does not exist on a touch screen, and this product is
 * opened on a phone between jobs — so every card also carries a plain status select, which works
 * everywhere, is reachable by keyboard, and is what a screen reader can use. The select is not a
 * fallback bolted on afterwards; it is the one that always works, with dragging layered on top.
 *
 * Both go through the same server action, which goes through the same `updateTicket` the detail
 * page uses — so a card dragged across a board leaves the same activity-log trail as a status
 * changed by hand. A board that wrote the column itself would be a second path with none of that.
 */
export default function RequestBoard({ items }: { items: RequestView[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Optimistic: the card lands in the new column while the write is in flight, and snaps back if
  // it fails. Waiting a round trip to see a card move makes a board feel broken.
  const [moved, setMoved] = React.useState<Record<string, string>>({});

  const shown = React.useMemo(
    () => items.map((item) => (moved[item.id] ? { ...item, status: moved[item.id] } : item)),
    [items, moved]
  );
  const groups = React.useMemo(() => groupIntoBoard(shown), [shown]);

  const move = async (id: string, status: string, from: string | null) => {
    if (from === status) return;
    setError(null);
    setPending(id);
    setMoved((m) => ({ ...m, [id]: status }));

    const result = await moveRequestToStatus(id, status);
    setPending(null);

    if (!result.ok) {
      setMoved((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Columns scroll sideways in their own container rather than stretching the page — the
          shell must never be the thing that has to scroll. */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[720px] grid-cols-3 gap-4">
          {groups.map((group) => (
            <section
              key={group.status}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(group.status);
              }}
              onDragLeave={() => setOver((s) => (s === group.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging;
                const current = shown.find((i) => i.id === id);
                setDragging(null);
                if (id) void move(id, group.status, current?.status ?? null);
              }}
              className={`rounded-2xl border p-3 transition ${
                over === group.status
                  ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-400/10"
                  : "border-gray-200/80 bg-gray-50/60 dark:border-white/10 dark:bg-white/[0.025]"
              }`}
            >
              <header className="mb-3 flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold text-navy-700 dark:text-white">{group.label}</h3>
                <span className="text-xs font-medium text-gray-400">{group.items.length}</span>
              </header>

              {group.items.length === 0 ? (
                <p className="px-1 pb-2 text-xs text-gray-400">{group.emptyHint}</p>
              ) : (
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(item.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition dark:border-white/10 dark:bg-navy-800 ${
                        dragging === item.id ? "opacity-50" : "hover:shadow-md"
                      }`}
                    >
                      <Link href={item.href} className="block">
                        <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">
                          {item.who || item.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {item.body?.trim() || item.title}
                        </p>
                      </Link>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {item.priority && item.priority !== "normal" ? (
                          <Pill tone="warn">{titleCase(item.priority)}</Pill>
                        ) : null}
                        <span className="text-[11px] text-gray-400">{formatWhen(item.createdAt)}</span>
                        {pending === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-500" />
                        ) : null}
                      </div>

                      <label className="mt-2 block">
                        <span className="sr-only">Move {item.who || item.title} to another status</span>
                        <select
                          value={group.status}
                          disabled={pending === item.id}
                          onChange={(e) => void move(item.id, e.target.value, group.status)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-gray-300"
                        >
                          {BOARD_COLUMNS.map((column) => (
                            <option key={column.status} value={column.status}>
                              {column.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
