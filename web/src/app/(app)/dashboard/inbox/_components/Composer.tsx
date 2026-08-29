"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, Smile } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import { sendInboxReplyAction, approveDraftAction, discardDraftAction } from "../_actions";
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
 *
 * **A pending draft is the exception.** On a channel in draft mode (email, by default) the AI
 * writes and a person releases it. That is an approval, not a takeover, so sending a draft does
 * NOT pause the AI — and the box says which of the two it is about to do, because "send" meaning
 * two different things to the conversation is exactly the kind of surprise this note exists to
 * prevent. The draft is loaded as ordinary editable text: what gets sent is always what is on
 * screen, never the stored copy.
 */
export default function Composer({
  channel,
  conversationRef,
  source,
  canSend,
  handledByHuman,
  draft,
}: {
  channel: Channel;
  conversationRef: string;
  source: string;
  /** Server-resolved: this channel has a transport AND this conversation has a reply address. */
  canSend: boolean;
  /** Already taken over — so the note stops promising a takeover that has happened. */
  handledByHuman: boolean;
  /** What the AI wrote and is waiting to have released, if anything. */
  draft?: string | null;
}) {
  const meta = channelMeta(channel);
  const router = useRouter();
  const [text, setText] = useState(draft ?? "");
  const [draftPending, setDraftPending] = useState(Boolean(draft));
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
      // Approving keeps the AI on the conversation; a plain reply takes it over. Which one this
      // is depends on whether the AI is the one who wrote the words being sent.
      const res = draftPending
        ? await approveDraftAction(conversationRef, source, channel, body)
        : await sendInboxReplyAction(conversationRef, source, channel, body);
      if (!res.ok) {
        setError(res.error ?? "The message could not be delivered.");
        return;
      }
      // Only clear on a confirmed send: losing what you wrote to a failed send is worse than
      // having to clear the box yourself.
      setText("");
      setDraftPending(false);
      router.refresh();
    });
  }

  function discard() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await discardDraftAction(conversationRef, source, channel);
      if (!res.ok) {
        setError(res.error ?? "Could not discard the draft.");
        return;
      }
      setText("");
      setDraftPending(false);
      router.refresh();
    });
  }

  return (
    <div className={`shrink-0 border-t px-3 py-3 ${inbox.frame} ${inbox.panel}`}>
      {/* The draft is announced, not slipped into the box. Someone glancing at a pre-filled
          composer would otherwise assume a colleague typed it and send it unread. */}
      {draftPending ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-[#25D366]/10 px-3 py-2">
          <p className={`text-[11px] ${inbox.meta}`}>
            Your AI wrote this reply. Edit it if you like, then send.
          </p>
          <button
            type="button"
            onClick={discard}
            disabled={pending}
            className={`shrink-0 text-[11px] font-medium underline underline-offset-2 disabled:opacity-40 ${inbox.meta}`}
          >
            Discard
          </button>
        </div>
      ) : null}

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
              : draftPending
                ? "Sending your AI's draft doesn't take the conversation over — it keeps answering."
                : handledByHuman
                  ? "You're handling this conversation — the AI is paused until you hand it back."
                  : "Replying takes this conversation over; the AI stops answering until you hand it back."}
        </p>
      )}
    </div>
  );
}
