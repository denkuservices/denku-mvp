/**
 * Placeholder examples for the Knowledge fields.
 *
 * **Every one begins with "e.g." and that is not decoration.** The previous version shipped
 * fully-formed sentences in Turkish — a district and city for the service area, a cancellation
 * fee stated to the half-price — and an owner who pressed "Draft with AI"
 * read them as the draft. The AI had correctly left those fields EMPTY because the website
 * said nothing about hours or cancellation; the placeholder filled the silence with a Turkish
 * dental clinic, on the profile of a company that sells medical uniforms.
 *
 * That is the exact failure this feature exists to prevent, arriving through the one part of it
 * nobody thought could lie. A placeholder that reads like an answer IS an answer as far as the
 * person looking at it is concerned. So they are prefixed, kept short, and written to be
 * obviously generic.
 *
 * **One language: the product's.** They used to be picked from the reader's timezone, which put
 * Turkish text in front of an English interface — the placeholder was speaking a different
 * language from every label around it. The interface is English, so these are English.
 */

export type KnowledgeExamples = {
  businessName: string;
  services: string;
  openingHours: string;
  serviceArea: string;
  faqs: string;
  bookingPolicy: string;
  cancellationPolicy: string;
  tone: string;
};

/**
 * Deliberately a plain, unremarkable business rather than a specific one.
 *
 * A vivid example teaches the shape of a good answer but invites the reader to picture someone
 * else's company. These say what belongs in the box and nothing more.
 */
export const KNOWLEDGE_EXAMPLES: KnowledgeExamples = {
  businessName: "e.g. Northside Supply",
  services: "e.g. what you sell or do, and anything a customer often asks whether you offer",
  openingHours: "e.g. Mon–Fri 9:00–18:00, Sat 10:00–14:00, closed Sunday",
  serviceArea: "e.g. the cities, districts or regions you serve",
  faqs: "e.g. Do you deliver outside the city? — Yes, within 3 working days.",
  bookingPolicy: "e.g. how far ahead customers should book, and whether same-day is possible",
  cancellationPolicy: "e.g. how much notice you need, and any fee",
  tone: "e.g. warm and patient; or brisk and to the point",
};

/**
 * The examples to show.
 *
 * Kept as a function because the caller merges the business's own website facts over the top,
 * field by field — a real detail from their site always beats a generic prompt.
 */
export function knowledgeExamples(): KnowledgeExamples {
  return { ...KNOWLEDGE_EXAMPLES };
}
