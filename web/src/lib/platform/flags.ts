/**
 * Platform-model feature flags (Sprint 4.5).
 *
 * The shared conversation model is adopted behind a flag so it can land dark: when OFF,
 * the platform write-paths (voice/IG dual-write into conversations/messages) no-op and
 * legacy behavior is byte-for-byte unchanged. When ON, channels dual-write into the
 * shared model WITHOUT changing what customers read (reads stay on the legacy stores
 * until a later, explicit cutover). This preserves backward compatibility at every step.
 *
 * Matches the project's staged-rollout convention (BILLING_NOTIFICATIONS_ENABLED,
 * ARTIFACT_NOTIFICATIONS_ENABLED, VAPI_WEBHOOK_AUTH_MODE): env-injectable, default OFF.
 */

type FlagEnv = Record<string, string | undefined>;

/**
 * Master switch for the shared platform model dual-writes. Default OFF.
 * Enable only after the four platform migrations are applied (see docs/SPRINT_4.5_MIGRATION.md).
 */
export function platformModelEnabled(env: FlagEnv = process.env): boolean {
  return (env.PLATFORM_MODEL_ENABLED ?? "").toLowerCase().trim() === "true";
}

/**
 * Sprint 5 — switch for the platform *experience* (the AI Employees IA: Employees,
 * Conversations, Contacts, Channels nav + surfaces). Default OFF → the current voice-first
 * dashboard/nav is served unchanged. Independent of `platformModelEnabled`: the new
 * surfaces read via the Platform Read Model (lib/platform/readModel/*), which presents
 * existing legacy data in platform shape, so they show real data whether or not dual-writes
 * are on. Enable per-env to dark-launch the new experience.
 */
export function platformUxEnabled(env: FlagEnv = process.env): boolean {
  return (env.PLATFORM_UX_ENABLED ?? "").toLowerCase().trim() === "true";
}

/**
 * BYO phone numbers — a tenant connects a number they already own over their own SIP trunk,
 * instead of renting a US number from Vapi. Default OFF.
 *
 * Gated because the connect path talks to a third party's telephony on the customer's behalf:
 * a half-configured trunk means their published business number rings into nothing. Turn it on
 * per environment only after a real carrier trunk has been proven end to end
 * (docs/BYO_PHONE_NUMBERS_PLAN.md, Phase 0).
 */
export function byoNumbersEnabled(env: FlagEnv = process.env): boolean {
  return (env.BYO_NUMBERS_ENABLED ?? "").toLowerCase().trim() === "true";
}
