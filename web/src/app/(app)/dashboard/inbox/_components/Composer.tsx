"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, Smile } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import { sendInboxReplyAction } from "../_actions";
import { inbox } from "./theme";

/**
 * The message box.
 *
 * It spent its whole life disabled, and honestly so: Denku could not send on any channel. Voice
 * is a call that already ended and Instagram is receive-only until Meta grants the permission. A
 * composer that looked live would have invited someone to type a reply that never arrived.
 *
 * Telegram changed the fact, not the principle. It is live **only where a reply can actually be
 * delivered** — the server decides that from the channel registry plus a real transport, and this
 * component is told, rather than guessing from the channel name. Everywhere else it keeps saying,
 * specifically, why not.
 *
 * **Sending here takes the conversation over.** The person and their AI must not both be
 * answering the same customer, so the first human message flips handling to human and the AI
 * stops until it is handed back from the context rail. The note under the box says so before the
 * first send, not after — a takeover the sender did not expect is a surprise about who is talking
 * to their customer.
 */
export default function Composer({
  channel,
  conversationRef,
  source,
  canSend,
  handledByHuman,
}: {
  channel: Channel;
  conversationRef: string;
  source: string;
  /** Server-resolved: this channel has a transport AND this conversation has a reply address. */
  canSend: boolean;
  /** Already taken over — so the note stops promising a takeover that has happened. */
  handledByHuman: boolean;
}) {
  const meta = channelMeta(channel);
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reason =
    channel === "voice"
      ? "This was a phone call — there's nothing to reply to here."
      : `Replying on ${meta.label} isn't switched on yet.`;

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendInboxReplyAction(conversationRef, source, channel, body);
      if (!res.ok) {
        setError(res.error ?? "The message could not be delivered.");
        return;
      }
      // Only clear on a confirmed send: losing what you wrote to a failed send is worse than
      // having to clear the box yourself.
      setText("");
      router.refresh();
    });
  }

  return (
    <div className={`shrink-0 border-t px-3 py-3 ${inbox.frame} ${inbox.panel}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-hidden="true"
          tabIndex={-1}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-40 ${inbox.meta}`}
        >
          <Smile className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled
          aria-hidden="true"
          tabIndex={-1}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-40 ${inbox.meta}`}
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <input
          type="text"
          disabled={!canSend || pending}
          value={canSend ? text : ""}
          readOnly={!canSend}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter does not — the messaging convention, and this is a
            // messaging surface.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Write a message"
          aria-describedby="composer-note"
          placeholder={canSend ? "Write a message…" : "Write a message…"}
          className={`h-10 min-w-0 flex-1 rounded-full px-4 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed ${inbox.field} ${inbox.strong}`}
        />

        <button
          type="button"
          onClick={send}
          disabled={!canSend || pending || text.trim().length === 0}
          aria-label="Send"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition disabled:cursor-not-allowed ${
            !canSend || pending || text.trim().length === 0 ? "opacity-40" : "hover:brightness-95"
          }`}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="mt-2 px-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p id="composer-note" className={`mt-2 px-1 text-[11px] ${inbox.metaFaint}`}>
          {!canSend
            ? reason
            : pending
              ? "Sending…"
              : handledByHuman
                ? "You're handling this conversation — the AI is paused until you hand it back."
                : "Replying takes this conversation over; the AI stops answering until you hand it back."}
        </p>
      )}
    </div>
  );
}
