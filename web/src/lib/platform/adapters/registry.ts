import type { Channel } from "@/lib/platform/channels";
import type { ChannelAdapter } from "@/lib/platform/adapters/types";
import { voiceAdapter } from "@/lib/platform/adapters/voice";
import { instagramAdapter } from "@/lib/platform/adapters/instagram";

/**
 * Channel adapter registry (Sprint 4.5 — Phase 3).
 *
 * The lookup that makes new channels O(1): register an adapter here and the shared ingest
 * pipeline can normalize + record that channel with no other change. Only channels with a
 * real adapter appear; unknown channels resolve to undefined (callers no-op).
 */

const ADAPTERS: Partial<Record<Channel, ChannelAdapter>> = {
  voice: voiceAdapter,
  instagram: instagramAdapter,
};

export function getChannelAdapter(channel: Channel): ChannelAdapter | undefined {
  return ADAPTERS[channel];
}

export function hasChannelAdapter(channel: Channel): boolean {
  return channel in ADAPTERS;
}
