/**
 * Derive effective system prompt from agent configuration
 */

type DerivePromptInput = {
  orgName: string;
  agentName: string;
  agentType: string | null;
  behaviorPreset: string | null;
  emphasisPoints: string[] | null;
  language: string | null;
  timezone: string | null;
  firstMessage: string | null;
};

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
  const { orgName, agentName, behaviorPreset, emphasisPoints, language, timezone } = input;

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
    "Be helpful, accurate, and maintain the appropriate tone for your role. If you don't know something, say so honestly.";

  return prompt.trim();
}

