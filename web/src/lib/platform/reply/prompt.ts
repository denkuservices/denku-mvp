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
  /**
   * What the business already knows about this customer (R-139), pre-rendered by
   * `recallPromptBlock`. Empty on a first contact, and empty on any channel where identity is too
   * weak to trust — this file never decides that, it only places the text.
   */
  recall?: string | null;
  /** Customer-facing channel name ("Telegram") — the AI should know where it is. */
  channelLabel: string;
  contactName: string | null;
  /** The business's local time, so "tomorrow" means the same thing to the AI and the customer. */
  nowLocal?: string | null;
  /**
   * Whether this channel can carry a photo or a voice note at all.
   *
   * Read from the channel registry rather than assumed, because the instruction below is only
   * true where perception actually runs — telling the AI on SMS that it can see photos would make
   * it offer something the customer cannot do.
   */
  canPerceiveMedia?: boolean;
  /**
   * The business's opening hours, whether this message arrived inside them, and what the owner
   * said to do when it did not — pre-rendered by `buildHoursPromptBlock`.
   *
   * Passed in rather than read here for the same reason `recall` is: this file places text, it
   * does not decide policy. Empty when the workspace has not set hours, which is every workspace
   * that existed before the setting did.
   */
  hoursBlock?: string | null;
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

  // Structured hours sit with the business's other facts, and override the free-text "Hours:"
  // line above when both exist: one of them is a schedule the product evaluated, the other is a
  // sentence somebody typed once.
  if (input.hoursBlock?.trim()) parts.push(input.hoursBlock.trim());

  // The customer's own instructions to their AI, when they wrote any. Placed after the facts so
  // it can shape the tone, and before the rules so it can never override them.
  if (employee.systemPromptOverride?.trim()) {
    parts.push(`Instructions from the business owner:\n${employee.systemPromptOverride.trim()}`);
  }

  if (contactName) {
    parts.push(`You are talking to ${contactName}. You already know their name — never ask for it.`);
  }

  /**
   * Recall sits AFTER the business's facts and BEFORE the rules, in the same place the owner's
   * own instructions sit: it may shape what the AI says, and it may never override the honesty
   * rules below. It arrives already filtered — this file is not where the decision to disclose is
   * made (see `lib/platform/recall.ts`).
   */
  if (input.recall?.trim()) {
    parts.push(input.recall.trim());
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

  /**
   * What the bracketed lines in a customer's message ARE.
   *
   * Without this, the model reads `[image] a cracked screen…` as the customer having typed a
   * strange piece of markup, and either quotes it back or ignores it. With it, the description is
   * treated as sight — and, more importantly, the model is told not to pretend to see when the
   * line says we could not read the file. That second half is the honesty rule applied to a new
   * sense: an AI that invents what is in an unreadable photo is exactly as harmful as one that
   * invents a price.
   */
  if (input.canPerceiveMedia) {
    parts.push(
      [
        "About photos and voice notes:",
        "- When a customer sends a photo, a line starting with [image] appears in their message. That is what the photo shows, described for you. Treat it as if you had seen it.",
        "- A line starting with [voice message] is what they said out loud, transcribed. Answer it as their own words — never mention that it was transcribed.",
        "- If such a line says the file could not be read, say plainly that you could not open it and ask them to describe it or send it again. Never guess what it showed.",
        "- Do not repeat these bracketed lines back to the customer. They describe what you perceived, not what they wrote.",
      ].join("\n")
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
