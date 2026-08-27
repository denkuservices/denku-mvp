import { LANGUAGES, LANGUAGE_CODES } from "@/lib/language/registry";

/**
 * The employee configuration field contract (Sprint 10 / R-094).
 *
 * Pure and framework-free, so the exact payload the Setup and Knowledge editors send to
 * `updateAgentConfiguration` is unit-testable. This matters more than it looks: Sprint 10 moves
 * a 935-line form out of Settings and onto the employee, and the one unacceptable outcome is a
 * writable field silently disappearing in the move. `sprint10-one-employee.test.ts` asserts the
 * keys here against the zod schema in the server action itself.
 *
 * **Every transformation below is copied verbatim from the surface being replaced.** The
 * "English"/"UTC" -> null collapses, the preset label -> id mapping and the empty-array -> null
 * rule are behaviour, not style: the action derives the effective prompt from these values, so
 * changing one would change what a live assistant says. This module moves them; it does not
 * improve them.
 */

export interface BusinessContext {
  businessName: string;
  services: string;
  openingHours: string;
  serviceArea: string;
  faqs: string;
  bookingPolicy: string;
  cancellationPolicy: string;
  tone: string;
}

export const EMPTY_BUSINESS_CONTEXT: BusinessContext = {
  businessName: "",
  services: "",
  openingHours: "",
  serviceArea: "",
  faqs: "",
  bookingPolicy: "",
  cancellationPolicy: "",
  tone: "",
};

export const BUSINESS_CONTEXT_FIELDS: Array<{
  key: keyof BusinessContext;
  label: string;
  hint: string;
  multiline?: boolean;
}> = [
  { key: "businessName", label: "Business name", hint: "How the AI refers to the business." },
  { key: "services", label: "Services / offerings", hint: "What you do — the AI uses this to answer.", multiline: true },
  { key: "openingHours", label: "Opening hours", hint: "e.g. Mon–Fri 8–6, closed weekends." },
  { key: "serviceArea", label: "Service area", hint: "Where you operate / which locations." },
  { key: "faqs", label: "FAQs", hint: "Common caller questions and their answers.", multiline: true },
  { key: "bookingPolicy", label: "Booking policy", hint: "How appointments are booked / lead times." },
  { key: "cancellationPolicy", label: "Cancellation policy", hint: "Notice required, fees, etc." },
  { key: "tone", label: "Preferred tone / personality", hint: "e.g. Warm and local; brisk and professional." },
];

/**
 * Languages, by display name.
 *
 * Stored as the NAME ("English", "Spanish"), which is what the previous form wrote — not an ISO
 * code. That representation is kept; what changed (R-135) is that `resolveLanguage` in the Vapi
 * helper now understands it. It previously matched a leading "es", which the code "es" satisfies
 * and the name "Spanish" does not — so selecting Spanish silently produced an English voice and
 * an English transcriber.
 *
 * **French, German and Turkish were removed, not fixed.** Voice and transcriber defaults exist
 * only for English and Spanish (`DEFAULT_VOICE_BY_LANGUAGE`), so those three could never do
 * anything except deliver an English-speaking employee while the UI claimed otherwise. Offering
 * a capability the product does not have is the fabrication this codebase bans (R-018).
 *
 * To add a language: add its voice + transcriber entry to `DEFAULT_VOICE_BY_LANGUAGE`, add every
 * spelling to `LANGUAGE_ALIASES`, then add it here. The parity test fails if you skip a step.
 */
export const SETUP_LANGUAGES: readonly string[] = LANGUAGE_CODES.map((c) => LANGUAGES[c].label);

/**
 * The languages an employee can be told to ALSO understand (2026-08-28).
 *
 * Same list, same registry — the form filters out whichever one is already primary. Ticking one
 * is the entire multilingual decision: the transcriber switches itself to code-switching, because
 * asking the owner a second, more technical question could only produce two answers that disagree.
 */
export const ADDITIONAL_LANGUAGE_OPTIONS = LANGUAGE_CODES.map((code) => ({
  code,
  label: LANGUAGES[code].label,
}));

/** The value that means "unset" for each of these two fields — sent to the action as null. */
export const DEFAULT_LANGUAGE = "English";
export const DEFAULT_TIMEZONE = "UTC";

export interface PresetOption {
  id: string;
  label: string;
  short: string;
  desc: string;
}

export const PRESETS: PresetOption[] = [
  {
    id: "professional",
    label: "Professional & Courteous",
    short: "Professional",
    desc: "Polite, concise, and consistent. Ideal default for most teams.",
  },
  {
    id: "support",
    label: "Calm Support Specialist",
    short: "Support",
    desc: "Patient, empathetic troubleshooting with clear next steps.",
  },
  {
    id: "concierge",
    label: "Warm Concierge",
    short: "Concierge",
    desc: "Friendly and welcoming. Great for booking and customer care.",
  },
  {
    id: "sales",
    label: "Confident Sales Closer",
    short: "Sales",
    desc: "Value-led, objection handling, and proactive conversion language.",
  },
  {
    id: "direct",
    label: "Direct & Efficient",
    short: "Direct",
    desc: "Fast, minimal small talk. Optimized for speed and accuracy.",
  },
  {
    id: "custom",
    label: "Custom",
    short: "Custom",
    desc: "Use Advanced to fully control the system prompt and rules.",
  },
];

export const AGENT_TYPES = [
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "concierge", label: "Concierge" },
  { value: "general", label: "General" },
];

export function presetMeta(presetId: string | null): PresetOption {
  if (!presetId) return PRESETS[0];
  return PRESETS.find((p) => p.id === presetId) || PRESETS[0];
}

/**
 * Normalize `emphasis_points` to a string[].
 * Handles null, a real array, and the legacy JSON-string form found in older rows.
 */
export function normalizeEmphasisPoints(input: unknown): string[] {
  if (input === null || input === undefined) return [];

  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : String(item || "")))
      .filter((item) => item.length > 0);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            typeof item === "string" ? item.trim() : typeof item === "number" ? String(item) : String(item || "")
          )
          .filter((item) => item.length > 0);
      }
      return [String(parsed).trim()].filter((item) => item.length > 0);
    } catch {
      return [trimmed];
    }
  }

  return [];
}

/** Coerce a stored `business_context` blob into the editor's shape. */
export function toBusinessContext(raw: unknown): BusinessContext {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_BUSINESS_CONTEXT };
  (Object.keys(EMPTY_BUSINESS_CONTEXT) as Array<keyof BusinessContext>).forEach((k) => {
    if (typeof src[k] === "string") out[k] = src[k] as string;
  });
  return out;
}

/** Editor state, before it is turned into an action payload. */
export interface SetupFormState {
  language: string;
  timezone: string;
  /** Preset **id** (the previous form held the label and mapped on save). */
  behaviorPresetId: string | null;
  agentType: string;
  firstMessage: string;
  emphasisPoints: string[];
  businessContext: BusinessContext;
}

/**
 * The exact payload shape `updateAgentConfiguration` accepts.
 * Mirrors `UpdateAgentConfigSchema`; the parity test keeps the two in step.
 */
export interface UpdateAgentConfigPayload {
  agentId: string;
  language: string | null;
  timezone: string | null;
  behavior_preset: string | null;
  agent_type: string | null;
  first_message: string | null;
  emphasis_points: string[] | null;
  business_context: BusinessContext | null;
}

/** Every field this editor can write. The parity test compares this to the action's schema. */
export const EDITABLE_CONFIG_FIELDS = [
  "language",
  "timezone",
  "behavior_preset",
  "agent_type",
  "first_message",
  "emphasis_points",
  "business_context",
] as const;

/**
 * Build the action payload from editor state — the single place the collapse rules live.
 * Verbatim from the replaced form: "English" and "UTC" mean unset, an empty emphasis list is
 * null rather than `[]`, and empty strings are null.
 */
export function toUpdateAgentConfigPayload(agentId: string, state: SetupFormState): UpdateAgentConfigPayload {
  return {
    agentId,
    language: state.language === DEFAULT_LANGUAGE ? null : state.language,
    timezone: state.timezone === DEFAULT_TIMEZONE ? null : state.timezone,
    behavior_preset: state.behaviorPresetId || null,
    agent_type: state.agentType || null,
    first_message: state.firstMessage || null,
    emphasis_points: state.emphasisPoints.length > 0 ? state.emphasisPoints : null,
    business_context: state.businessContext,
  };
}

/** The default greeting the previous form pre-filled when a row had no `first_message`. */
export function defaultFirstMessage(employeeName: string): string {
  return `Hello, thanks for calling ${employeeName}. How can I help you today?`;
}

/** Editor state from a stored employee row. Inverse of `toUpdateAgentConfigPayload`. */
export function toSetupFormState(row: {
  name: string;
  language: string | null;
  timezone: string | null;
  behaviorPreset: string | null;
  agentType: string | null;
  firstMessage: string | null;
  emphasisPoints: unknown;
  businessContext: unknown;
}): SetupFormState {
  return {
    language: row.language || DEFAULT_LANGUAGE,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    behaviorPresetId: row.behaviorPreset || null,
    agentType: row.agentType || "",
    firstMessage: row.firstMessage || defaultFirstMessage(row.name),
    emphasisPoints: normalizeEmphasisPoints(row.emphasisPoints),
    businessContext: toBusinessContext(row.businessContext),
  };
}
