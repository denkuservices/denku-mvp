import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveViewer } from "@/lib/platform/serverOrg";
import { getConversationView } from "@/lib/platform/readModel/conversations";
import { getHandlingState, handlingAvailable, defaultHandling } from "@/lib/platform/handling";
import { isStarred, starsAvailable } from "@/lib/platform/stars";
import { getVoiceArtifacts } from "@/lib/platform/readModel/voiceArtifacts";
import ConversationThread from "../../_platform/conversation/ConversationThread";
import ContextRail from "../../_platform/conversation/ContextRail";
import ThreadHeader from "../_components/ThreadHeader";
import Composer from "../_components/Composer";
import MarkRead from "../_components/MarkRead";
import { inbox } from "../_components/theme";

export const dynamic = "force-dynamic";

/**
 * One conversation — the right-hand pane of the split view (Inbox v2).
 *
 * Three bands, the shape every messaging surface has: who this is, what was said, and where a
 * reply would go. The thread itself still renders through the plugin renderer registry, so a
 * voice transcript and a chat thread share this page without it knowing about either — that seam
 * is unchanged from Sprint 5, only its surroundings are new.
 *
 * The customer context (contact, outcomes, recording, takeover) is the same `ContextRail` as
 * before, but it now arrives as a panel from the header rather than as a permanent third column:
 * two panes plus a rail does not fit the messaging layout, and the rail is reference material —
 * needed on demand, not while reading.
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
  const { orgId } = await resolveViewer();
  const detail = orgId ? await getConversationView(orgId, conversationId) : null;

  if (!detail) notFound();

  // Handling and stars are additive and inert until their migrations are applied — the
  // conversation must render either way, so a failed read degrades the controls only.
  const [handling, controlsAvailable, starred, canStar] = orgId
    ? await Promise.all([
        getHandlingState(orgId, detail.id),
        handlingAvailable(orgId),
        isStarred(orgId, detail.id),
        starsAvailable(orgId),
      ])
    : [defaultHandling(detail.id), false, false, false];

  // Sprint 13: the recording and cost that used to live on the legacy call page. Voice only, and
  // fetched separately so a chat conversation never pays for the lookup.
  const voice = orgId && detail.channel === "voice" ? await getVoiceArtifacts(orgId, detail.id) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader
        conversationRef={detail.id}
        source={detail.source}
        channel={detail.channel}
        displayName={detail.contact.displayName}
        handle={detail.contact.handle}
        handling={handling.handling}
        starred={starred}
        canStar={canStar}
        details={
          <ContextRail
            detail={detail}
            handling={handling}
            handlingAvailable={controlsAvailable}
            voice={voice}
          />
        }
      />

      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 ${inbox.thread}`}>
        <ConversationThread turns={detail.turns} />
      </div>

      <Composer channel={detail.channel} />

      {/* Opening a conversation is what marks it read. */}
      <MarkRead conversationRef={detail.id} source={detail.source} channel={detail.channel} />
    </div>
  );
}
