/**
 * Which Vapi assistant answers the landing page.
 *
 * One definition, because there are now two readers: the route that starts a demo call, and the
 * platform analytics page that has to separate "what Denku spends showing the product to
 * strangers" from "what customers spent". Two copies of a hardcoded Vapi id is exactly the shape
 * landmine #5 is about — the marketing spend figure would quietly measure the wrong assistant the
 * first time one copy was updated.
 *
 * The env var wins so an environment can point at its own copy without a deploy; the literal is the
 * id `scripts/register-denku-agent.mts` created, kept so the demo works with nothing configured.
 *
 * Pure and import-free: the analytics page is a server component and the demo route is an edge-ish
 * handler, and neither should pull `server-only` machinery in to read a string.
 */
export function denkuMarketingAssistantId(): string {
  return process.env.VAPI_DENKU_ASSISTANT_ID || "a7846579-78b9-451a-8821-2c5764a3fc6f";
}
