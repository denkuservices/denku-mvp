/**
 * AI Studio packages — STRUCTURE ONLY.
 *
 * Every visible word lives in `src/messages/*.json` under `studio.*`, keyed by the ids
 * below. Same split as `services.ts`: what is not language stays here, so adding a
 * language is a message file rather than a code change.
 *
 * WHY THESE ARE NOT PURCHASABLE. Every other price on this site buys a thing that
 * provisions itself — a plan, a number, a channel slot. A studio package buys people's
 * time: a brief, a production pass, named revisions, a delivery date. None of that can
 * be scoped before the conversation, so a checkout button would take money for work
 * nobody has agreed on yet. The benchmark this was priced against reaches the same
 * conclusion from the other direction — every one of its tiers says "contact sales".
 *
 * So `cta` points at `/request?service=ai-studio` on all six, and there are no Stripe
 * products behind them. The prices are printed because a printed price is what makes
 * the enquiry worth sending; they are a starting point, not a charge.
 */

export type StudioTier = {
  /** Message key under `studio.groups.<group>.tiers.<id>`. */
  id: string;
  /** Printed price in USD. A starting point for the quote, not a charge. */
  priceUsd: number;
  /** Marks the middle tier, the one most people land on. */
  featured: boolean;
};

export type StudioGroup = {
  /** Message key under `studio.groups.<id>`. */
  id: "visuals" | "video";
  glyph: string;
  tiers: StudioTier[];
};

export const STUDIO_GROUPS: StudioGroup[] = [
  {
    id: "visuals",
    glyph: "◈",
    tiers: [
      { id: "basic", priceUsd: 349, featured: false },
      { id: "standard", priceUsd: 499, featured: true },
      { id: "advanced", priceUsd: 649, featured: false },
    ],
  },
  {
    id: "video",
    glyph: "◐",
    tiers: [
      { id: "basic", priceUsd: 399, featured: false },
      { id: "standard", priceUsd: 599, featured: true },
      { id: "advanced", priceUsd: 899, featured: false },
    ],
  },
];

/** The kinds of work the studio takes on. Ids key into `studio.makes.items.<id>`. */
export const STUDIO_MAKES = [
  "product",
  "campaign",
  "social",
  "ads",
  "tryon",
  "variants",
  "ecommerce",
  "lifestyle",
  "banners",
  "shorts",
  "mockups",
  "concept",
] as const;

/** The four steps between a brief and a delivery. Ids key into `studio.process.steps.<id>`. */
export const STUDIO_PROCESS = ["brief", "concept", "produce", "deliver"] as const;
