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
  timezone: string | null;
  firstMessage: string | null;
  businessContext?: BusinessContext | null;
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
  const { orgName, agentName, behaviorPreset, emphasisPoints, language, timezone, businessContext } = input;

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
  prompt += buildBusinessContextBlock(businessContext);

  // Add emphasis points
  if (emphasisPoints && emphasisPoints.length > 0) {
    prompt += "Key points to emphasize:\n";
    emphasisPoints.forEach((point, idx) => {
      prompt += `${idx + 1}. ${point}\n`;
    });
    prompt += "\n";
  }

  // Add language context
  if (language) {
    prompt += `Primary language: ${language}. Respond naturally in this language.\n\n`;
  }

  // Add timezone context
  if (timezone) {
    prompt += `Timezone: ${timezone}. When discussing times or dates, use this timezone context.\n\n`;
  }

  // Closing instruction
  prompt +=
    "Be helpful, accurate, and maintain the appropriate tone for your role. If you don't know something, say so honestly.\n\n";

  // Mandatory fallback rule: Never leave caller without a clear next step
  prompt +=
    "CRITICAL: If you are uncertain, if the intent is unclear, or if any tool call fails, you must say exactly: \"I'll notify our team and make sure someone follows up shortly.\" Do not apologize or provide extra explanation.";

  return prompt.trim();
}

