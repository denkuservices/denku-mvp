import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ticket, Calendar } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getConversationView } from "@/lib/platform/readModel/conversations";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../../_platform/format";
import ConversationThread from "../../_platform/conversation/ConversationThread";

export const dynamic = "force-dynamic";

/**
 * Conversation detail (Sprint 5, P2) — the unified thread for any channel, rendered via the
 * plugin renderer registry. Deep-linkable; legacy /dashboard/calls/:id redirects here (the
 * call id IS the conversation id). Reachable only under PLATFORM_UX_ENABLED.
 */
export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  if (!platformUxEnabled()) notFound();

  const { conversationId } = await params;
  const orgId = await resolveActiveOrgId();
  const detail = orgId ? await getConversationView(orgId, conversationId) : null;

  if (!detail) notFound();

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/conversations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Conversations
      </Link>

      <PageHeader
        title={detail.contact.displayName || detail.contact.handle || "Conversation"}
        subtitle={detail.employeeName ? `Handled by ${detail.employeeName}` : undefined}
        action={<ChannelBadge channel={detail.channel} />}
      />

      {/* Meta strip */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {detail.status ? (
          <span className={`rounded-full px-2 py-0.5 font-medium ${statusPillClass(detail.status)}`}>
            {titleCase(detail.status)}
          </span>
        ) : null}
        {detail.intent ? (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            {titleCase(detail.intent)}
          </span>
        ) : null}
        <span className="text-gray-400">Started {formatWhen(detail.startedAt)}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Thread */}
        <div className="lg:col-span-2">
          <ConversationThread turns={detail.turns} />
        </div>

        {/* Artifacts + contact */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Outcomes</p>
            {detail.artifacts.length === 0 ? (
              <p className="text-sm text-gray-500">No artifacts created.</p>
            ) : (
              <ul className="space-y-2">
                {detail.artifacts.map((a) => (
                  <li key={`${a.type}:${a.id}`}>
                    <Link
                      href={a.type === "ticket" ? `/dashboard/tickets/${a.id}` : `/dashboard/appointments`}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 text-sm transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                    >
                      {a.type === "ticket" ? (
                        <Ticket className="h-4 w-4 text-gray-500" />
                      ) : (
                        <Calendar className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-navy-700 dark:text-white">
                        {a.title || titleCase(a.type)}
                      </span>
                      {a.status ? <span className="text-xs text-gray-400">{titleCase(a.status)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</p>
            {detail.contact.id ? (
              <Link
                href={`/dashboard/contacts/${detail.contact.id}`}
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                {detail.contact.displayName || detail.contact.handle || "View contact"}
              </Link>
            ) : (
              <p className="text-sm font-medium text-navy-700 dark:text-white">
                {detail.contact.displayName || "Unknown"}
              </p>
            )}
            {detail.contact.handle ? (
              <p className="mt-0.5 text-sm text-gray-500">{detail.contact.handle}</p>
            ) : null}
          </div>

          {/* Voice conversations link through to the full call detail (recording, cost) —
              capability preserved rather than duplicated. */}
          {detail.channel === "voice" ? (
            <Link
              href={`/dashboard/calls/${detail.id}`}
              className="block rounded-2xl border border-gray-200 bg-white p-4 text-sm font-medium text-brand-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:hover:bg-white/5"
            >
              Full call details (recording, cost) →
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
