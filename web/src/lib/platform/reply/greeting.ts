import type { ReplyEmployee } from "@/lib/platform/reply/types";

/**
 * The opening line — answered without a model.
 *
 * On Telegram, `/start` is not something a customer types; it is the button every new user
 * presses to open the bot at all. In the first live test it produced **silence**: the model was
 * asked what to say to the literal string "/start", returned nothing useful, and the person saw
 * an empty chat until they typed again. A greeting is the one reply that never needs a model —
 * it is the same sentence every time — so it is answered deterministically, which is also one
 * fewer billed call per new customer.
 *
 * Pure and unit-tested: this is the first thing anyone ever sees from the product on this channel.
 */

/** Commands that mean "I just opened this bot", not "answer my question". */
export function isOpeningCommand(text: string): boolean {
  // Telegram may append a payload (`/start ref_123`) or a bot mention (`/start@shop_bot`).
  return /^\/start(@\w+)?(\s|$)/i.test(text.trim());
}

/**
 * A voice greeting is not a chat greeting.
 *
 * `agents.first_message` is what the AI says when it picks up the phone, and shop owners write it
 * that way — "Thanks for calling Bright Dental". Printing that into a Telegram thread tells the
 * customer they are on a call they are not on. So the configured line is used only when it does
 * not describe a phone call; otherwise the business's own name carries the greeting instead.
 */
const VOICE_SHAPED = /\b(call(ing|ed)?|phone|on the line|dial(ed|ling)?|voicemail|hold)\b/i;

export function greetingFor(employee: ReplyEmployee, contactName: string | null): string {
  const configured = (employee.firstMessage ?? "").trim();
  if (configured && !VOICE_SHAPED.test(configured)) return configured;

  const who = contactName ? `Hi ${contactName}` : "Hi";
  return `${who} — this is ${employee.name} at ${employee.orgName}. How can I help?`;
}
