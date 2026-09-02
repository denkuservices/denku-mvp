/**
 * Which brain answers the phone.
 *
 * The request was "let the customer choose the AI model". Offering raw model names would have been
 * the literal answer and the wrong one: the system prompt, the intent pass, and the never-dead-end
 * tool behaviour are all tuned around one model. A customer who picks a weaker one degrades exactly
 * the behaviours the product promises — and they do not experience that as "my choice", they
 * experience it as "Denku is bad".
 *
 * So the choice is real but bounded, and bounded in one direction only: **Standard is what runs
 * today, and Advanced is an upgrade.** There is no setting that makes a workspace worse than it was
 * before it opened the menu. Named by outcome rather than by model, because the model will change
 * and the promise should not.
 *
 * **No minute multiplier, deliberately.** The obvious next step is to charge premium tiers at
 * 1.5× minutes the way some assistants do. Measured on a real Denku call — ElevenLabs voice,
 * GPT-4o, Deepgram, Vapi, all of it — a minute costs about $0.09 against a starter plan that
 * sells minutes at $0.37. The whole spread between the cheapest and dearest configuration is a few
 * percent of revenue, not the 10-30× that makes multipliers worth their complexity elsewhere.
 * Against that, a multiplier costs the one number a customer understands ("400 minutes" becomes
 * "400, or 260, depending") and would move `billable_minutes = Σ ceil(duration/60)`, the most
 * carefully pinned invariant in the billing chain (R-075). If a genuinely expensive option ever
 * appears, sell it as a flat monthly add-on: `billing_org_addons` already does that, and it keeps
 * "minutes are minutes" true.
 */

export type ModelTier = "standard" | "advanced";

export const MODEL_TIERS: Record<
  ModelTier,
  { label: string; description: string; model: string; provenCall: boolean }
> = {
  standard: {
    label: "Standard",
    description:
      "The model every Denku line runs on today. Handles questions, bookings and support without fuss.",
    model: "gpt-4o",
    // Every production call to date.
    provenCall: true,
  },
  advanced: {
    label: "Advanced",
    description:
      "A stronger model for longer or more tangled conversations — several requests in one call, unusual questions, careful wording.",
    model: "gpt-4.1",
    // ⚠ NOT YET HEARD ON A REAL CALL. This is why `modelTiersEnabled()` gates the picker: the
    // mechanism can ship and be reviewed while the option stays off a customer's screen until
    // someone has placed a call on it and listened. Same discipline the voice registry uses.
    provenCall: false,
  },
};

export const DEFAULT_MODEL_TIER: ModelTier = "standard";

/** Anything unrecognised is Standard. A stored value is data, not a promise the model still exists. */
export function resolveModelTier(raw: string | null | undefined): ModelTier {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "advanced" ? "advanced" : DEFAULT_MODEL_TIER;
}

/** The model id to send to Vapi for a stored tier. */
export function modelForTier(raw: string | null | undefined): string {
  return MODEL_TIERS[resolveModelTier(raw)].model;
}

type Env = Record<string, string | undefined>;

/**
 * Is the tier picker shown to customers?
 *
 * Off by default: Advanced has not been heard on a real call, and a menu whose second item is
 * unverified is worse than no menu.
 */
export function modelTiersEnabled(env: Env = process.env): boolean {
  return (env.MODEL_TIERS_ENABLED ?? "").toLowerCase().trim() === "true";
}
