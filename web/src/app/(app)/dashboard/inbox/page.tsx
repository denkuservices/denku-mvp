import { notFound } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { inbox } from "./_components/theme";

export const dynamic = "force-dynamic";

/**
 * The Inbox with nothing selected — the right-hand pane before you pick a conversation.
 *
 * The list itself is not here: it lives in `layout.tsx`, so it survives every selection (see the
 * note there). This page is only what fills the space beside it, and on a narrow screen it is
 * hidden entirely, because there the list *is* the page until something is chosen.
 */
export default async function InboxPage() {
  if (!platformUxEnabled()) notFound();

  return (
    <div className={`flex h-full flex-col items-center justify-center px-6 text-center ${inbox.thread}`}>
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-[#202C33]">
        <MessagesSquare className="h-7 w-7 text-[#25D366]" />
      </span>
      <p className={`text-base font-semibold ${inbox.strong}`}>Pick a conversation</p>
      <p className={`mt-1 max-w-sm text-sm ${inbox.meta}`}>
        Every call and message your AI Employees handle lands in the list beside this one — with
        the full transcript and whatever it produced.
      </p>
    </div>
  );
}
