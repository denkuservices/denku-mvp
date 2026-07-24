import React from "react";
import { Phone, Instagram, MessageCircle, Mail, Smartphone, Globe } from "lucide-react";
import type { Channel } from "@/lib/platform/channels";

/**
 * Channel pill (icon + label) — the single visual vocabulary for a channel across every
 * platform surface. Driven by the channel registry vocabulary so a new channel gets a
 * consistent badge by adding one icon mapping (no per-surface change).
 */
const ICONS: Record<Channel, React.ComponentType<{ className?: string }>> = {
  voice: Phone,
  instagram: Instagram,
  whatsapp: MessageCircle,
  email: Mail,
  sms: Smartphone,
  web: Globe,
};

const LABELS: Record<Channel, string> = {
  voice: "Voice",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  web: "Web Chat",
};

export default function ChannelBadge({ channel, className = "" }: { channel: Channel; className?: string }) {
  const Icon = ICONS[channel] ?? Globe;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {LABELS[channel] ?? channel}
    </span>
  );
}
