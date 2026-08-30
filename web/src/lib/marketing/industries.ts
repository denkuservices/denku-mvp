/**
 * Vertical pages behind `/industries/*` — STRUCTURE ONLY.
 *
 * Every visible word lives in `src/messages/*.json` under `industries.items.<slug>`:
 * the sector name, the headline, the three pain lines, and the vertical FAQ.
 *
 * What stays here is the slug and which employee template we recommend — a product
 * decision, not a sentence.
 *
 * Four handcrafted at launch (doc 15 §4). The template is the same shape for all of
 * them so it can become the SEO engine later without a rewrite. Note that the pain
 * lines describe the situation rather than quoting a statistic: a sourced number can
 * be added later, but inventing one to fill the slot is exactly what this site is
 * built not to do.
 */

export type Industry = {
  slug: string;
  /** Employee template we recommend for this vertical, by slug. */
  recommend: string;
};

export const INDUSTRIES: Industry[] = [
  { slug: "hvac-plumbing", recommend: "missed-call-rescuer" },
  { slug: "dental", recommend: "booking-assistant" },
  { slug: "med-spa-salon", recommend: "support-agent" },
  { slug: "law", recommend: "after-hours" },
];

export function getIndustry(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
