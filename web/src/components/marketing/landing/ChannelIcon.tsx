import type { IconType } from "react-icons";
import {
  SiGmail,
  SiInstagram,
  SiMessenger,
  SiTelegram,
  SiWhatsapp,
} from "react-icons/si";
import {
  MessageCircleMore,
  MessageSquareText,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

type ChannelIconDefinition = {
  icon: IconType | LucideIcon;
  color: string;
  background: string;
  border: string;
};

const CHANNEL_ICONS: Record<string, ChannelIconDefinition> = {
  voice: {
    icon: PhoneCall,
    color: "#D9A87C",
    background: "rgba(200,148,104,.12)",
    border: "rgba(200,148,104,.22)",
  },
  telegram: {
    icon: SiTelegram,
    color: "#2AABEE",
    background: "rgba(42,171,238,.11)",
    border: "rgba(42,171,238,.22)",
  },
  email: {
    icon: SiGmail,
    color: "#EA4335",
    background: "rgba(234,67,53,.10)",
    border: "rgba(234,67,53,.20)",
  },
  instagram: {
    icon: SiInstagram,
    color: "#E45A8D",
    background: "rgba(228,90,141,.10)",
    border: "rgba(228,90,141,.20)",
  },
  messenger: {
    icon: SiMessenger,
    color: "#7A8CFF",
    background: "rgba(122,140,255,.10)",
    border: "rgba(122,140,255,.20)",
  },
  whatsapp: {
    icon: SiWhatsapp,
    color: "#25D366",
    background: "rgba(37,211,102,.09)",
    border: "rgba(37,211,102,.18)",
  },
  sms: {
    icon: MessageSquareText,
    color: "#9EC9C4",
    background: "rgba(158,201,196,.09)",
    border: "rgba(158,201,196,.18)",
  },
  webchat: {
    icon: MessageCircleMore,
    color: "#7FD9CE",
    background: "rgba(47,163,154,.13)",
    border: "rgba(47,163,154,.24)",
  },
};

export function ChannelIcon({
  channel,
  size = "md",
  muted = false,
  className = "",
}: {
  channel: string;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
  className?: string;
}) {
  const definition = CHANNEL_ICONS[channel] ?? CHANNEL_ICONS.webchat;
  const Icon = definition.icon;
  const sizes = {
    sm: "h-8 w-8 rounded-[10px] [&_svg]:h-3.5 [&_svg]:w-3.5",
    md: "h-11 w-11 rounded-[13px] [&_svg]:h-5 [&_svg]:w-5",
    lg: "h-14 w-14 rounded-[17px] [&_svg]:h-6 [&_svg]:w-6",
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border ${sizes[size]} ${className}`}
      style={{
        color: muted ? "var(--d-ink-faint)" : definition.color,
        background: muted ? "rgba(247,245,241,.035)" : definition.background,
        borderColor: muted ? "var(--d-border)" : definition.border,
      }}
    >
      <Icon />
    </span>
  );
}

export default ChannelIcon;
