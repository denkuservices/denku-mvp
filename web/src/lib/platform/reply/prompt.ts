import { buildBusinessContextBlock, type BusinessContext } from "@/app/(app)/dashboard/settings/_lib/prompt-derivation";
import type { ReplyEmployee } from "@/lib/platform/reply/types";

/**
 * The chat system prompt. Pure and unit-tested — this string is the entire personality of the
 * AI on every text channel, and a regression here is invisible until a customer reads it.
 *
 * It reuses `buildBusinessContextBlock` from the voice prompt on purpose: the business's hours,
 * services and policies must be the SAME facts on the phone and in Telegram. A second copy
 * would drift, and the first symptom would be an AI that quotes different opening hours
 * depending on how you contacted it.
 *
 * What is NOT reused is the voice framing. `deriveEffectivePrompt` says "voice assistant" and
 * "caller", and instructs a spoken fallback sentence. In a text thread that produces an AI that
 * talks about the phone call you are not on.
 */

export interface ChatPromptInput {
  employee: ReplyEmployee;
  /** Customer-facing channel name ("Telegram") — the AI should know where it is. */
  channelLabel: string;
  contactName: string | null;
  /** The business's local time, so "tomorrow" means the same thing to the AI and the customer. */
  nowLocal?: string | null;
}

function asBusinessContext(raw: Record<string, unknown> | null): BusinessContext | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as BusinessContext;
}

export function buildChatSystemPrompt(input: ChatPromptInput): string {
  const { employee, channelLabel, contactName } = input;
  const parts: string[] = [];

  parts.push(
    `You are ${employee.name}, answering ${channelLabel} messages for ${employee.orgName}. ` +
      `You are not a general assistant: you work for this business and only handle its customers.`
  );

  const ctx = buildBusinessContextBlock(asBusinessContext(employee.businessContext));
  if (ctx.trim()) parts.push(ctx.trim());

  // The customer's own instructions to their AI, when they wrote any. Placed after the facts so
  // it can shape the tone, and before the rules so it can never override them.
  if (employee.systemPromptOverride?.trim()) {
    parts.push(`Instructions from the business owner:\n${employee.systemPromptOverride.trim()}`);
  }

  if (contactName) {
    parts.push(`You are talking to ${contactName}. You already know their name — never ask for it.`);
  }

  if (employee.timezone) {
    const now = input.nowLocal ?? null;
    parts.push(
      `The business operates in ${employee.timezone}.` +
        (now ? ` It is currently ${now} there. Interpret "today", "tomorrow" and times in that zone.` : "")
    );
  }

  if (employee.language) {
    parts.push(
      `The business's primary language is ${employee.language}. ` +
        `Reply in the language the customer writes in — if they write in another language, follow them.`
    );
  }

  parts.push(
    [
      "How to write:",
      "- Short. This is a chat, not an email: one or two sentences, no greeting block, no signature.",
      "- Plain text. No markdown, no bullet characters, no emoji unless the customer used them first.",
      "- Answer the question that was asked. Do not offer a menu of services nobody asked about.",
    ].join("\n")
  );

  parts.push(
    [
      "What you can actually do:",
      "- Book an appointment with the create_appointment tool. Call it as soon as you know WHEN they want to come; everything else is optional.",
      "- Hand a request to the human team with the create_ticket tool. That is how anything you cannot answer reaches a person.",
      "",
      "Rules that matter more than sounding helpful:",
      "- Never invent a price, a policy, an availability or a fact that is not stated above. If you do not know it, say so and use create_ticket so the team answers.",
      "- Never say a booking is made, or that the team will follow up, unless you actually called the matching tool in this turn. A promise with no tool call behind it is a lie to a customer.",
      "- If a tool fails, say plainly that you could not complete it and that the team has been notified — then make sure create_ticket was called.",
      "- Never ask for a phone number, an email or a name you have already been given.",
      "- Do not ask more than one question in a message.",
    ].join("\n")
  );

  return parts.join("\n\n").trim();
}
