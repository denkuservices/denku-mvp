import type { Channel } from "@/lib/platform/channels";
import { channelMeta } from "@/lib/platform/channels";
import type { ReplyTransport } from "@/lib/platform/reply/types";
import { telegramTransport } from "@/lib/platform/transports/telegram";
import { emailTransport } from "@/lib/platform/transports/email";

/**
 * Outbound transport registry — the mirror image of the adapter registry.
 *
 * An adapter says how a channel's messages come IN; a transport says how they go OUT. Keeping
 * them as two registries rather than one interface is what lets Instagram exist as it does:
 * adopted for receiving, with no transport at all, because Meta has not granted the permission
 * to reply. `canReplyOn` reads that honestly instead of assuming an adapter implies a voice.
 *
 * Voice has no entry and never will: replying on a call is Vapi speaking inside the call, not
 * Denku sending a message afterwards.
 */
const TRANSPORTS: Partial<Record<Channel, ReplyTransport>> = {
  telegram: telegramTransport,
  /**
   * Email is registered here even though an individual org may not be able to send yet.
   * `canReplyOn` answers "does this CHANNEL have a voice", which it now does; whether a
   * particular business has verified its domain is a per-connection question the transport
   * answers by refusing. Keeping those two separate is what lets the Inbox enable the composer
   * for email while a specific unverified org still gets a clear reason instead of silence.
   */
  email: emailTransport,
};

export function getTransport(channel: Channel): ReplyTransport | undefined {
  return TRANSPORTS[channel];
}

/**
 * Whether the AI can answer on this channel at all — the registry's declared capability AND a
 * transport that actually exists. Both halves are required: a `capabilities.outbound: true` with
 * no transport would be a promise the code cannot keep.
 */
export function canReplyOn(channel: Channel): boolean {
  return channelMeta(channel).capabilities.outbound && channel in TRANSPORTS;
}
