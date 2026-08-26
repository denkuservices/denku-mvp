import React from "react";
import { Paperclip, Send, Smile } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import { inbox } from "./theme";

/**
 * The message box — present, and deliberately inert.
 *
 * **Denku cannot send on any channel today.** Voice is a phone call that already ended;
 * Instagram is receive-only by design (Sprint 1.5) and stays that way until the reply epic and
 * Meta's Advanced Access land. A composer that looked live would be the single most dishonest
 * control in the product: it would invite someone to type a reply to a customer that never
 * arrives.
 *
 * So it is drawn exactly where replying will happen, disabled, and it *says why* — the channel's
 * own name in the sentence, so the answer is specific rather than a generic "coming soon". When
 * a channel gains `capabilities.outbound`, this is the one component that changes.
 */
export default function Composer({ channel }: { channel: Channel }) {
  const meta = channelMeta(channel);
  const reason =
    channel === "voice"
      ? "This was a phone call — there's nothing to reply to here."
      : `Replying on ${meta.label} isn't switched on yet. It arrives with the reply release.`;

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
          disabled
          value=""
          readOnly
          aria-label="Write a message"
          aria-describedby="composer-note"
          placeholder="Write a message…"
          className={`h-10 min-w-0 flex-1 rounded-full px-4 text-sm outline-none placeholder:text-gray-400 disabled:cursor-not-allowed ${inbox.field} ${inbox.strong}`}
        />

        <button
          type="button"
          disabled
          aria-label="Send"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <p id="composer-note" className={`mt-2 px-1 text-[11px] ${inbox.metaFaint}`}>
        {reason}
      </p>
    </div>
  );
}
