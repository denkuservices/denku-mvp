/**
 * The four things Denku sells (owner decision 2026-08-29).
 *
 * Creato presents the same shape at creato.digital/en — AI Audit, AI Software
 * Services, Chat & Call Agents, In-House Training. Denku's list overlaps on three
 * and deliberately differs on two:
 *
 *  - No training/workshop offering. It is a headcount business and nothing in the
 *    product supports it. Creato's fourth service is the one Denku should not copy.
 *  - AI Studio is Denku's fourth instead: delivered individually rather than as a
 *    self-serve product, which is exactly how Creato delivers theirs too.
 *
 * Pricing motion per service is honest about which are printed and which are
 * quoted. Nothing here invents a number: the platform prices come from
 * `pricing-data.ts` (the billing system's real plans) and the service offerings
 * are quote-based because no price list exists for them yet.
 */

export type ServiceKind = "product" | "service";

export type Service = {
  slug: string;
  /** Nav + card label. */
  name: string;
  /** One line, used on the card. */
  line: string;
  /** Detail-page headline. Short — these pages are visual, not verbal. */
  headline: string;
  sub: string;
  kind: ServiceKind;
  /** Glyph used in the card and the page hero. */
  glyph: string;
  /** Three to four beats of what you actually get. */
  includes: string[];
  /** How it is delivered — sets expectations before the first call. */
  delivery: string;
  /** How it is priced, stated plainly. */
  pricing: string;
  /** Whether a price is printed anywhere. Drives the CTA. */
  pricePrinted: boolean;
  cta: { label: string; href: string };
};

export const SERVICES: Service[] = [
  {
    slug: "ai-employees",
    name: "AI Employees",
    line: "An employee for your phone line.",
    headline: "Hire an employee that never misses a call.",
    sub: "Voice, Telegram and email — answered, written up, remembered.",
    kind: "product",
    glyph: "◍",
    includes: [
      "Answers every call, 24/7, in 20+ languages",
      "Turns each conversation into a ticket or an appointment request",
      "Remembers the customer across every call they ever make",
      "One Inbox for voice, Telegram and email",
    ],
    delivery: "Self-serve. You set it up in an afternoon and it starts on the next ring.",
    pricing: "Printed plans from $149/month. No contract, cancel any time.",
    pricePrinted: true,
    cta: { label: "See pricing", href: "/#pricing" },
  },
  {
    slug: "ai-audit",
    name: "AI Audit",
    line: "Find out what your phone is costing you.",
    headline: "What is your phone line losing?",
    sub: "We call it, listen to how it answers, and send you the gaps.",
    kind: "service",
    glyph: "◎",
    includes: [
      "We call your line the way a customer would",
      "Where calls drop, stall, or go to voicemail",
      "What each missed call is plausibly worth to you",
      "Which AI employee we'd start you with, and why",
    ],
    delivery: "You give us a number. We send back a short written report.",
    pricing: "Free. It is how we'd rather introduce ourselves than with a sales call.",
    pricePrinted: true,
    cta: { label: "Request an audit", href: "/request?service=ai-audit" },
  },
  {
    slug: "ai-studio",
    name: "AI Studio",
    line: "Images and video, made to order.",
    headline: "Creative work, produced with AI.",
    sub: "Not a self-serve tool — a small team using AI to make your assets.",
    kind: "service",
    glyph: "◈",
    includes: [
      "Product and campaign imagery",
      "Short-form video for social and ads",
      "Ad creative variants for testing",
      "Revisions until it is right",
    ],
    delivery:
      "Delivered individually, not from a dashboard. You brief us, we produce, you review.",
    pricing: "Quoted per project — scope and volume decide it. Ask and we'll price it.",
    pricePrinted: false,
    cta: { label: "Ask for a quote", href: "/request?service=ai-studio" },
  },
  {
    slug: "custom-ai",
    name: "Custom AI",
    line: "The automation your business actually needs.",
    headline: "When the off-the-shelf employee isn't the whole answer.",
    sub: "Integrations, automations and internal tools, built around how you work.",
    kind: "service",
    glyph: "◇",
    includes: [
      "Connecting Denku to the systems you already run",
      "Workflow automation across tools that don't talk",
      "Reporting and dashboards on your own data",
      "Custom conversation flows beyond the templates",
    ],
    delivery: "Scoped in a call, then built. We tell you if it isn't worth doing.",
    pricing: "Quoted per project after a scoping call.",
    pricePrinted: false,
    cta: { label: "Talk about a project", href: "/request?service=custom-ai" },
  },
];

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
