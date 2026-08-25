import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getConversationView } from "@/lib/platform/readModel/conversations";
import { getHandlingState, handlingAvailable, defaultHandling } from "@/lib/platform/handling";
import { getVoiceArtifacts } from "@/lib/platform/readModel/voiceArtifacts";
import PageHeader from "../../_platform/PageHeader";
import ChannelBadge from "../../_platform/ChannelBadge";
import { formatWhen, statusPillClass, titleCase } from "../../_platform/format";
import ConversationThread from "../../_platform/conversation/ConversationThread";
import ContextRail from "../../_platform/conversation/ContextRail";

export const dynamic = "force-dynamic";

/**
 * Conversation detail — the unified thread for any channel (Sprint 5, P2 · rail added Phase 3).
 *
 * Layout is thread + customer context rail: the rail is what makes the Inbox and CRM read as two
 * views of one relationship. The thread itself renders through the plugin renderer registry, so
 * voice transcripts and chat bubbles share this page without the page knowing about either.
 *
 * Deep-linkable; legacy /dashboard/calls/:id redirects here (the call id IS the conversation id).
 * Reachable only under PLATFORM_UX_ENABLED.
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

  // Handling state is additive and inert until its migration is applied — the conversation must
  // render either way, so a failed read degrades the controls only.
  const [handling, controlsAvailable] = orgId
    ? await Promise.all([getHandlingState(orgId, detail.id), handlingAvailable(orgId)])
    : [defaultHandling(detail.id), false];

  // Sprint 13: the recording and cost that used to live on the legacy call page. Voice only, and
  // fetched separately so a chat conversation never pays for the lookup.
  const voice = orgId && detail.channel === "voice" ? await getVoiceArtifacts(orgId, detail.id) : null;

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/inbox"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Inbox
      </Link>

      <PageHeader
        title={detail.contact.displayName || detail.contact.handle || "Conversation"}
        subtitle={detail.employeeName ? `Handled by ${detail.employeeName}` : undefined}
        action={<ChannelBadge channel={detail.channel} />}
      />

      {/* Meta strip */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {handling.handling === "human" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            Needs a person
          </span>
        ) : null}
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
        <div className="lg:col-span-2">
          <ConversationThread turns={detail.turns} />
        </div>

        <ContextRail detail={detail} handling={handling} handlingAvailable={controlsAvailable} voice={voice} />
      </div>
    </div>
  );
}
