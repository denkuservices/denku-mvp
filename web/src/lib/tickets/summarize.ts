import OpenAI from "openai";
import { resolveLlmProvider } from "@/lib/llm/provider";

/**
 * What a finished call should become.
 *
 * Two questions, deliberately answered together by one model pass, because they are the same
 * judgement seen from two sides: is there something for a person to do, and if so, what is it?
 *
 * The old answer to the first question was "always", and to the second a list of ENGLISH keywords
 * (`refund`, `order`, `shipping`…). On a Turkish call the list could never match, so every ticket
 * a Turkish business ever received was titled "Support Request". A hundred identical rows are the
 * same as no rows: nobody triages a list where everything looks alike.
 */

export type TicketPriority = "low" | "normal" | "high";

export interface CallTicketSummary {
  /** Does a human have to do something? Only then is a ticket the right artifact. */
  actionable: boolean;
  /** Short title, written in the language the CALLER used. */
  subject: string;
  /** One to three sentences a colleague could act on without opening the transcript. */
  summary: string;
  priority: TicketPriority;
  /** The caller's name if they said it. Never invented. */
  requesterName: string | null;
  source: "llm" | "fallback";
}

const LLM_TIMEOUT_MS = 8000;
const VALID_PRIORITIES: TicketPriority[] = ["low", "normal", "high"];

const SYSTEM_PROMPT = `You read a finished phone conversation between a business's AI receptionist and a caller, and decide what record it should leave behind.

Return JSON only:
{
  "actionable": boolean,
  "subject": string,
  "summary": string,
  "priority": "low" | "normal" | "high",
  "requester_name": string | null
}

actionable = true when a person at the business still has to DO something: an unanswered question, a request for a quote or product information, a complaint, a callback request, a problem left unresolved, anything the AI promised someone would follow up on.

actionable = false when nothing is owed: the AI fully answered a simple question, a wrong number, a silent or abandoned call, a test call, or a conversation where the caller never asked for anything.

subject: a short, specific title — what this call was ABOUT, never a category name like "Support Request". Aim for 3-8 words.

summary: one to three sentences. What the caller wanted, what was said, what is still open. Enough that a colleague can act without reading the transcript.

priority: "high" only for an angry customer, a failure affecting them now, or an explicit urgency. "low" for idle curiosity. Otherwise "normal".

requester_name: only if the caller actually stated their name. Never guess it from anything else.

CRITICAL: write "subject" and "summary" in the SAME LANGUAGE the caller spoke. A Turkish call gets a Turkish subject and a Turkish summary. Never translate to English.`;

/**
 * The answer when there is no model, or it failed.
 *
 * `actionable: true` on purpose. The platform's first rule is that a call is never dead-ended, and
 * an unread ticket is a smaller failure than a customer request nobody ever sees. When we cannot
 * judge, we keep.
 */
export function fallbackSummary(transcript: string | null | undefined): CallTicketSummary {
  const firstCallerLine = (transcript ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^user:/i.test(l))
    ?.replace(/^user:\s*/i, "")
    .trim();

  const subject =
    firstCallerLine && firstCallerLine.length > 0
      ? firstCallerLine.slice(0, 70)
      : "Call — needs review";

  return {
    actionable: true,
    subject,
    summary: "This call could not be summarised automatically. The full transcript is below.",
    priority: "normal",
    requesterName: null,
    source: "fallback",
  };
}

/**
 * Turn the model's JSON into something the ticket table can hold. Exported for tests: this is
 * where a malformed or half-formed answer has to be caught, and that is worth asserting directly.
 */
export function coerceSummary(raw: string, transcript: string | null | undefined): CallTicketSummary {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const str = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };

  const subject = str(parsed.subject, 120);
  const summary = str(parsed.summary, 1200);
  // A summary with no subject is not a usable ticket — treat a half-answer as no answer.
  if (!subject) return fallbackSummary(transcript);

  const priority = VALID_PRIORITIES.includes(parsed.priority as TicketPriority)
    ? (parsed.priority as TicketPriority)
    : "normal";

  return {
    actionable: parsed.actionable !== false,
    subject,
    summary: summary ?? "",
    priority,
    requesterName: str(parsed.requester_name, 120),
    source: "llm",
  };
}

/**
 * Summarise a finished call. Never throws; falls back to keeping the call rather than losing it.
 */
export async function summarizeCallForTicket(
  transcript: string | null | undefined
): Promise<CallTicketSummary> {
  const text = (transcript ?? "").trim();
  if (!text) {
    // Nothing was said. There is nothing for a person to do, and nothing to title.
    return {
      actionable: false,
      subject: "Call with no conversation",
      summary: "",
      priority: "low",
      requesterName: null,
      source: "fallback",
    };
  }

  const provider = resolveLlmProvider();
  if (!provider) return fallbackSummary(text);

  try {
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      maxRetries: 0,
      timeout: LLM_TIMEOUT_MS,
    });

    const call = client.chat.completions.create({
      model: provider.model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Transcript:\n${text.slice(0, 6000)}` },
      ],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ticket_summary_timeout")), LLM_TIMEOUT_MS + 500)
    );

    const completion = await Promise.race([call, timeout]);
    const raw = completion.choices?.[0]?.message?.content ?? "";
    return coerceSummary(raw, text);
  } catch {
    return fallbackSummary(text);
  }
}
