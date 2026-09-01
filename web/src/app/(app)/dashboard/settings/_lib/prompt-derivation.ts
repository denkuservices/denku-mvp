import { LANGUAGES, toLanguageCode } from "@/lib/language/registry";

/**
 * Derive effective system prompt from agent configuration
 */

/**
 * Business context (R-013) the AI needs to sound like it works for this business.
 * All fields optional; only present ones are injected, so the prompt stays concise.
 */
export type BusinessContext = {
  businessName?: string | null;
  services?: string | null;
  openingHours?: string | null;
  serviceArea?: string | null;
  faqs?: string | null;
  bookingPolicy?: string | null;
  cancellationPolicy?: string | null;
  tone?: string | null;
};

type DerivePromptInput = {
  orgName: string;
  agentName: string;
  agentType: string | null;
  behaviorPreset: string | null;
  emphasisPoints: string[] | null;
  language: string | null;
  /** Languages the employee should ALSO understand, beyond `language`. (2026-08-28) */
  additionalLanguages?: readonly string[] | null;
  timezone: string | null;
  firstMessage: string | null;
  businessContext?: BusinessContext | null;
  /**
   * The workspace's STRUCTURED opening hours, already rendered ("Mon–Fri 09:00–17:00, Sat–Sun
   * closed"), plus the owner's after-hours rule.
   *
   * Passed in rather than read here because this module is pure and unit-tested. When present it
   * replaces the free-text `businessContext.openingHours` line: one of the two is a schedule the
   * product can evaluate, the other is a sentence somebody typed once, and an assistant quoting
   * both would contradict itself.
   */
  businessHoursSummary?: string | null;
  afterHoursInstruction?: string | null;
};

/** Build the concise "About the business" block — only non-empty fields (R-013). */
export function buildBusinessContextBlock(ctx?: BusinessContext | null): string {
  if (!ctx) return "";
  const clean = (v?: string | null) => (typeof v === "string" ? v.trim() : "");
  const lines: string[] = [];
  const name = clean(ctx.businessName);
  if (clean(ctx.services)) lines.push(`- Services: ${clean(ctx.services)}`);
  if (clean(ctx.openingHours)) lines.push(`- Hours: ${clean(ctx.openingHours)}`);
  if (clean(ctx.serviceArea)) lines.push(`- Service area: ${clean(ctx.serviceArea)}`);
  if (clean(ctx.bookingPolicy)) lines.push(`- Booking policy: ${clean(ctx.bookingPolicy)}`);
  if (clean(ctx.cancellationPolicy)) lines.push(`- Cancellation policy: ${clean(ctx.cancellationPolicy)}`);

  let block = "";
  if (name || lines.length > 0) {
    block += name ? `About ${name}:\n` : "About the business:\n";
    if (lines.length > 0) block += lines.join("\n") + "\n";
    block += "\n";
  }
  if (clean(ctx.faqs)) {
    block += `Common caller questions (answer from these):\n${clean(ctx.faqs)}\n\n`;
  }
  if (clean(ctx.tone)) {
    block += `Tone: ${clean(ctx.tone)}.\n\n`;
  }
  return block;
}

const BEHAVIOR_PROMPTS: Record<string, string> = {
  professional:
    "You are a professional and courteous assistant. Maintain a polite, concise, and consistent tone. Focus on clarity and efficiency while being respectful.",
  support:
    "You are a calm and empathetic support specialist. Be patient, understanding, and provide clear troubleshooting steps. Help users feel heard and supported.",
  concierge:
    "You are a warm and welcoming concierge. Be friendly, personable, and helpful. Great for booking, customer care, and making people feel valued.",
  sales:
    "You are a confident sales closer. Lead with value, handle objections proactively, and use conversion-focused language. Be persuasive but not pushy.",
  direct:
    "You are direct and efficient. Minimize small talk, focus on speed and accuracy. Get to the point quickly while remaining professional.",
  custom: "You are a helpful assistant. Follow the custom instructions provided.",
};

export function deriveEffectivePrompt(input: DerivePromptInput): string {
  const {
    orgName,
    agentName,
    behaviorPreset,
    emphasisPoints,
    language,
    additionalLanguages,
    timezone,
    businessContext,
  } = input;

  // Structured hours win over the free-text line, so the AI never quotes two different schedules.
  const effectiveContext: BusinessContext | null = input.businessHoursSummary
    ? { ...(businessContext ?? {}), openingHours: input.businessHoursSummary }
    : businessContext ?? null;

  // Base prompt
  let prompt = `You are ${agentName}, a voice assistant for ${orgName}.\n\n`;

  // Add behavior preset prompt
  if (behaviorPreset) {
    // behaviorPreset is stored as ID (e.g., "professional", "support")
    const presetKey = behaviorPreset.toLowerCase();
    const presetPrompt = BEHAVIOR_PROMPTS[presetKey] || BEHAVIOR_PROMPTS.professional;
    prompt += `${presetPrompt}\n\n`;
  } else {
    prompt += `${BEHAVIOR_PROMPTS.professional}\n\n`;
  }

  // Business context (R-013) — inject early so the AI answers as this specific business.
  prompt += buildBusinessContextBlock(effectiveContext);

  /*
   * How to talk about those hours.
   *
   * A standing rule rather than a fact about this call, because a Vapi assistant's prompt is
   * written once and reused — it cannot be told "it is 11pm now". That costs nothing here: the
   * hours never decide WHETHER the assistant helps, only what it is honest about. The line is
   * always answered.
   */
  if (input.businessHoursSummary && input.afterHoursInstruction) {
    prompt += `${input.afterHoursInstruction}

`;
  }

  // Add emphasis points
  if (emphasisPoints && emphasisPoints.length > 0) {
    prompt += "Key points to emphasize:\n";
    emphasisPoints.forEach((point, idx) => {
      prompt += `${idx + 1}. ${point}\n`;
    });
    prompt += "\n";
  }

  /*
   * Language (2026-08-28).
   *
   * Vapi's own guidance is explicit that this cannot be left implicit: an assistant does not work
   * out that it is allowed to speak more than one language unless the prompt names them. The
   * transcriber can be listening for Spanish and the model will still answer in English.
   *
   * The first language is where the call starts — someone has to say hello in one language — and
   * the rest are followed if the caller uses them.
   */
  /*
   * Say the language's NAME, not whichever spelling happens to be stored.
   *
   * Onboarding writes the ISO code ("en") and the Setup editor writes the label ("English") — the
   * same R-135 split that once produced an English-speaking "Spanish" employee. Left alone, a
   * prompt would read "You speak en and Spanish", which is both ugly and a worse instruction.
   */
  const languageName = (raw: string) => {
    const code = toLanguageCode(raw);
    return code ? LANGUAGES[code].label : raw.trim();
  };

  const primaryName = language ? languageName(language) : null;
  const extraLanguages = Array.from(
    new Set(
      (additionalLanguages ?? [])
        .filter((l) => l && l.trim())
        .map(languageName)
        .filter((l) => l !== primaryName)
    )
  );

  if (primaryName && extraLanguages.length > 0) {
    prompt +=
      `You speak ${[primaryName, ...extraLanguages].join(" and ")}. ` +
      `Start the call in ${primaryName}. If the caller speaks one of the others, switch to it ` +
      "and stay in it for the rest of the call. Never tell a caller you cannot speak their " +
      "language when it is one of these.\n\n";
  } else if (primaryName) {
    prompt += `Primary language: ${primaryName}. Respond naturally in this language.\n\n`;
  }

  // Add timezone context
  if (timezone) {
    prompt += `Timezone: ${timezone}. When discussing times or dates, use this timezone context.\n\n`;
  }

  // Closing instruction
  prompt +=
    "Be helpful, accurate, and maintain the appropriate tone for your role. If you don't know something, say so honestly.\n\n";

  /*
   * Brevity (2026-08-27) — added after listening to a real call.
   *
   * Asked "what are your plans?", the AI recited three plans with prices and minute
   * allowances in one unbroken turn, then did it again on the next call. On a phone line that is
   * unusable: the caller cannot skim, cannot go back, and has stopped listening by the second
   * price. Nothing in the prompt asked for brevity, so the model defaulted to completeness — the
   * right instinct in a chat window and the wrong one out loud.
   *
   * This is a prompt problem, not a latency setting. Speech pace lives in the voice config.
   */
  prompt +=
    "SPEAK LIKE A PERSON ON A PHONE, NOT A BROCHURE:\n" +
    "- Keep answers to one or two sentences. The caller cannot skim; they can only wait.\n" +
    "- Never recite a list of options, prices, or features unprompted. If the caller asks " +
    "about something with several parts, give the shortest useful answer first, then ask " +
    'whether they want the detail (e.g. "Want me to run through the options?").\n' +
    "- Answer the question that was asked. Do not add information they did not ask for.\n" +
    "- Do not repeat back what you just did more than once.\n\n";

  // Mandatory fallback rule: Never leave caller without a clear next step
  prompt +=
    "CRITICAL: If you are uncertain, if the intent is unclear, or if any tool call fails, you must say exactly: \"I'll notify our team and make sure someone follows up shortly.\" Do not apologize or provide extra explanation.";

  return prompt.trim();
}

