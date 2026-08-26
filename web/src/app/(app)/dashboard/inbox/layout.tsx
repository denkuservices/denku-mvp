import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveViewer } from "@/lib/platform/serverOrg";
import { listInboxPage, INBOX_PAGE_SIZE } from "@/lib/platform/readModel/inbox";
import InboxSplit from "./_components/InboxSplit";
import ConversationList from "./_components/ConversationList";

export const dynamic = "force-dynamic";

/**
 * The Inbox shell (Inbox v2) — one list beside one conversation.
 *
 * **The list lives in the layout, and that is the whole design.** A layout is not re-rendered
 * when you navigate between its children, so the list stays mounted: the scroll position, the
 * search and the filter survive moving from one conversation to the next. Putting the list in
 * each page instead would rebuild it on every click, which is the difference between a messaging
 * surface and a list of links.
 *
 * The first page of rows is fetched here, on the server, so the panel arrives populated rather
 * than flashing a skeleton. The list refetches from a server action after that (see
 * `ConversationList`), because a layout cannot see `searchParams`, and filtering is its job
 * rather than the URL's.
 */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  if (!platformUxEnabled()) notFound();

  const { orgId, userId } = await resolveViewer();
  const initialPage = orgId
    ? await listInboxPage(orgId, userId ?? "", { limit: INBOX_PAGE_SIZE })
    : {
        rows: [],
        total: 0,
        bounded: false,
        hasMore: false,
        starredCount: 0,
        needsPersonCount: 0,
        canStar: false,
      };

  return <InboxSplit list={<ConversationList initialPage={initialPage} />}>{children}</InboxSplit>;
}
