"use client";

import { useEffect, useRef } from "react";
import type { Channel } from "@/lib/platform/channels";
import { markConversationReadAction } from "../_actions";

/**
 * Records that the viewer has seen this conversation.
 *
 * Renders nothing. It exists as a component because opening a conversation is a page *render*,
 * and a render must not write — the write has to be an effect, which means a client boundary.
 *
 * Deliberately fire-and-forget: failing to remember a read is not worth interrupting someone who
 * is reading. The badge simply comes back on the next load, which is the honest outcome when the
 * watermark could not be stored.
 */
export default function MarkRead({
  conversationRef,
  source,
  channel,
}: {
  conversationRef: string;
  source: "calls" | "conversations";
  channel: Channel;
}) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    // Guard against React's double-invoked effects in development, and against re-marking the
    // same conversation when the pane re-renders around it.
    if (done.current === conversationRef) return;
    done.current = conversationRef;
    void markConversationReadAction(conversationRef, source, channel).catch(() => {});
  }, [conversationRef, source, channel]);

  return null;
}
