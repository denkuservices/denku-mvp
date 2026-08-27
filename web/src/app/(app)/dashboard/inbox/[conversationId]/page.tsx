import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveViewer } from "@/lib/platform/serverOrg";
import { getConversationView } from "@/lib/platform/readModel/conversations";
import { getHandlingStateWithAvailability, defaultHandling } from "@/lib/platform/handling";
import { getStarWithAvailability } from "@/lib/platform/stars";
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
  if (!orgId) notFound();

  /**
   * One stage, not a ladder.
   *
   * These four reads have no dependency on each other — they are all keyed by the conversation id,
   * which the URL already gave us — but they used to run one after another, so opening a
   * conversation cost the SUM of their latencies rather than the longest of them. That is what
   * made moving between conversations feel slow.
   *
   * The voice lookup is included unconditionally rather than gated on `detail.channel`, because
   * checking the channel first would mean waiting for the conversation to come back — reinstating
   * the ladder to save one small query. It answers null for anything that is not a voice call.
   *
   * Handling and stars are additive and inert until their migrations are applied; a failed read
   * degrades those controls only, never the conversation.
   */
  const [detail, handlingState, starState, voice] = await Promise.all([
    getConversationView(orgId, conversationId),
    getHandlingStateWithAvailability(orgId, conversationId),
    getStarWithAvailability(orgId, conversationId),
    getVoiceArtifacts(orgId, conversationId),
  ]);

  if (!detail) notFound();

  const handling = handlingState?.state ?? defaultHandling(conversationId);
  const controlsAvailable = handlingState?.available ?? false;
  const starred = starState?.starred ?? false;
  const canStar = starState?.available ?? false;

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
            voice={detail.channel === "voice" ? voice : null}
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
