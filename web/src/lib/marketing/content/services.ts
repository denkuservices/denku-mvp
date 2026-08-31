/**
 * The four things Denku sells (owner decision 2026-08-29) — STRUCTURE ONLY.
 *
 * Every visible word lives in `src/messages/*.json` under `services.items.<slug>`.
 * This module keeps what is not language: the slug, the glyph, whether the offering
 * is the platform or done-for-you work, whether a price is printed, and where the
 * CTA points.
 *
 * The split is deliberate. When the copy lived here, the pages rendered English
 * inside a Turkish site because there was nowhere for a translation to go. Keeping
 * structure and text apart means adding a language is a message file, not a code
 * change — and it makes it impossible for the two to drift.
 *
 * Why this list and not the benchmark's: Creato sells AI Chat Agent and AI Call
 * Agent as separately priced products. Denku's billing meters voice minutes and
 * nothing else, so a chat/voice split would advertise two prices we cannot charge.
 * AI Studio takes the fourth slot instead of Creato's training offering, which has
 * no counterpart in the product.
 */

export type ServiceKind = "product" | "service";

export type Service = {
  slug: string;
  kind: ServiceKind;
  /** Glyph used on the card and in the page hero. */
  glyph: string;
  /** Whether a price is printed anywhere. Drives the card badge and the CTA tone. */
  pricePrinted: boolean;
  cta: { href: string };
};

export const SERVICES: Service[] = [
  {
    slug: "ai-employees",
    kind: "product",
    glyph: "◍",
    pricePrinted: true,
    cta: { href: "/pricing" },
  },
  {
    slug: "ai-audit",
    kind: "service",
    glyph: "◎",
    pricePrinted: true,
    cta: { href: "/request?service=ai-audit" },
  },
  {
    // Prices ARE printed (see `content/studio.ts`) but nothing is purchasable: a studio
    // package buys production time, which cannot be scoped before the conversation. The
    // printed number is where the quote starts, which is what makes the enquiry worth sending.
    slug: "ai-studio",
    kind: "service",
    glyph: "◈",
    pricePrinted: true,
    cta: { href: "/request?service=ai-studio" },
  },
  {
    slug: "custom-ai",
    kind: "service",
    glyph: "◇",
    pricePrinted: false,
    cta: { href: "/request?service=custom-ai" },
  },
];

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
