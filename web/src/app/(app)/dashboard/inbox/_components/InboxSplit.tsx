"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { inbox } from "./theme";

/**
 * The two-pane frame: the conversation list, and the conversation.
 *
 * **Why a client component wraps a server layout's children.** Only one thing here needs the
 * browser: on a narrow screen the two panes are one column at a time — the list until you pick
 * something, the conversation after — and that depends on the current URL. Everything else
 * (the list itself, the thread) is rendered on the server and passed through untouched.
 *
 * The height is pinned rather than flowing, because a messaging surface scrolls in its panes,
 * not in the page: 100vh minus the shell's top bar (10px padding + 12px margin + a 61px capsule
 * + 8px margin = 91px) and a 10px gutter at the bottom.
 *
 * **It is full-bleed.** The shell drops its reading-width cap and side padding for this route
 * (see `HorizonShell`), so the frame runs from the sidebar to the right edge — the surface gets
 * every pixel the sidebar and the profile capsule are not using.
 */
export default function InboxSplit({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasSelection = /^\/dashboard\/inbox\/.+/.test(pathname ?? "");

  return (
    <div>
      {/* The page's heading. Invisible on purpose: the panel below is self-evidently an inbox,
          and the reference gives that space to the conversations. Screen readers still get it. */}
      <h1 className="sr-only">Inbox</h1>

      <div
        className={`flex h-[calc(100vh-101px)] min-h-[520px] overflow-hidden rounded-2xl border shadow-sm ${inbox.frame} ${inbox.panel}`}
      >
        <aside
          className={`h-full w-full shrink-0 flex-col border-r md:w-[320px] lg:w-[368px] ${inbox.frame} ${
            hasSelection ? "hidden md:flex" : "flex"
          }`}
        >
          {list}
        </aside>

        {/* `relative` anchors the details panel, which slides in over the thread. */}
        <section
          className={`relative h-full min-w-0 flex-1 flex-col ${hasSelection ? "flex" : "hidden md:flex"}`}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
