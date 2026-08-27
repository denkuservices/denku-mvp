import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLlmProvider } from "@/lib/llm/provider";
import { channelMeta } from "@/lib/platform/channels";
import { buildChatSystemPrompt } from "@/lib/platform/reply/prompt";
import { CHAT_TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/platform/reply/tools";
import type { ReplyArtifact, ReplyRequest, ReplyResult } from "@/lib/platform/reply/types";

/**
 * Generate one reply.
 *
 * Provider-agnostic through `lib/llm/provider` — the same door the intent classifier uses, so a
 * model change is an env var in both places rather than two refactors.
 *
 * The loop is deliberately shallow: the model may call tools once, we execute them, and it gets
 * exactly one more turn to write the sentence the customer reads. A longer loop buys very little
 * on a two-tool surface and costs the one thing a chat cannot spare — the seconds before a reply
 * appears — while making a runaway tool loop possible on someone else's bill.
 *
 * Never throws. Every failure returns `text: null` with a reason, and the caller stays silent
 * rather than sending an apology written by an error handler.
 */

const LLM_TIMEOUT_MS = 12000;
const MAX_REPLY_CHARS = 1200;

/**
 * Spend guard. `lib/rateLimit.ts` is an in-memory Map and a no-op on Vercel (landmine #8), so the
 * only honest limiter is the database. One conversation may not extract more than this many
 * replies per hour — enough that no real customer notices, low enough that a script pointed at a
 * customer's bot cannot run up a model bill overnight.
 */
const MAX_REPLIES_PER_CONVERSATION_PER_HOUR = 30;

export async function replyBudgetRemaining(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .gte("created_at", since);
    if (error) return true; // A broken count must not silence a real customer.
    return (count ?? 0) < MAX_REPLIES_PER_CONVERSATION_PER_HOUR;
  } catch {
    return true;
  }
}

/** The business's local time as a sentence, so "tomorrow" resolves the same for AI and customer. */
export function localNow(timeZone: string | null, at: Date = new Date()): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(at);
  } catch {
    return null;
  }
}

/** Strip what a chat should not carry: markdown emphasis the model adds despite instructions. */
export function tidyReply(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}

export async function generateReply(req: ReplyRequest, db: SupabaseClient = supabaseAdmin): Promise<ReplyResult> {
  const artifacts: ReplyArtifact[] = [];

  /**
   * Stage timings, logged on every reply.
   *
   * The 14–16s tool path was found by reading message timestamps out of the database after the
   * fact, which said *that* it was slow and nothing about *where*. Two model calls, several
   * database writes and a Telegram round trip all sit inside that number. One log line ends the
   * guessing for every future reply, at the cost of four `Date.now()` calls.
   */
  const t0 = Date.now();
  const mark: Record<string, number> = {};
  const since = (from: number) => Date.now() - from;

  const provider = resolveLlmProvider();
  if (!provider) {
    // No key, no reply. Silence is the honest outcome: a canned "we'll get back to you" from a
    // channel the owner believes is answered by AI is worse than an obviously unanswered message.
    console.warn("[REPLY][NO_PROVIDER]", { org_id: req.orgId, channel: req.channel });
    return { ok: false, text: null, artifacts, reason: "no_llm_provider" };
  }

  if (!(await replyBudgetRemaining(req.orgId, req.conversationId, db))) {
    console.warn("[REPLY][BUDGET][EXHAUSTED]", { org_id: req.orgId, conversation_id: req.conversationId });
    return { ok: false, text: null, artifacts, reason: "rate_limited" };
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
    timeout: LLM_TIMEOUT_MS,
  });

  const system = buildChatSystemPrompt({
    employee: req.employee,
    channelLabel: channelMeta(req.channel).label,
    contactName: req.contactName,
    nowLocal: localNow(req.employee.timezone),
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...req.history.map((t) => ({ role: t.role, content: t.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  const toolCtx: ToolContext = {
    orgId: req.orgId,
    conversationId: req.conversationId,
    contactId: req.contactId,
    employee: req.employee,
    db,
  };

  try {
    const tLlm1 = Date.now();
    const first = await client.chat.completions.create({
      model: provider.model,
      temperature: 0.3,
      max_tokens: 400,
      messages,
      tools: CHAT_TOOL_DEFINITIONS,
    });
    mark.llm1 = since(tLlm1);

    const choice = first.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const text = tidyReply(choice?.content ?? "");
      console.info("[REPLY][TIMING]", { conversation_id: req.conversationId, tools: 0, ...mark, total: since(t0) });
      if (!text) return { ok: false, text: null, artifacts, reason: "empty_completion" };
      return { ok: true, text, artifacts };
    }

    const tTools = Date.now();

    // Execute what it asked for, then let it write the sentence the customer reads.
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      choice as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    ];

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }

      console.info("[TOOL_CALLED]", {
        tool: call.function.name,
        org_id: req.orgId,
        conversation_id: req.conversationId,
        channel: req.channel,
      });

      const outcome = await executeTool(call.function.name, args, toolCtx);
      if (outcome.artifact) artifacts.push(outcome.artifact);

      toolMessages.push({ role: "tool", tool_call_id: call.id, content: outcome.message });
    }
    mark.tools = since(tTools);

    /**
     * The second pass gets a SHORT context, not the whole thread again.
     *
     * Measured on production: a plain reply lands in ~3.5s, a reply that calls a tool in 14–16s.
     * The difference is a second model call that was being handed the entire 20-turn history for
     * a job that needs almost none of it — its only task is to say what just happened, in the
     * customer's own language.
     *
     * So it gets the system prompt (the persona and the honesty rules), the last few turns (which
     * is what tells the model which language the customer is writing in — a Turkish conversation
     * must not get an English confirmation), and the tool result. `max_tokens` drops to match a
     * job that is one or two sentences.
     */
    const RECENT_TURNS_FOR_CONFIRMATION = 4;
    const secondPass: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      messages[0],
      ...messages.slice(1).slice(-RECENT_TURNS_FOR_CONFIRMATION),
      ...toolMessages,
    ];

    const tLlm2 = Date.now();
    const second = await client.chat.completions.create({
      model: provider.model,
      temperature: 0.3,
      max_tokens: 160,
      messages: secondPass,
      // No tools on the second pass: its job is to speak, and offering the tools again is what
      // turns "book it" into a loop that books it four times.
    });

    mark.llm2 = since(tLlm2);
    console.info("[REPLY][TIMING]", {
      conversation_id: req.conversationId,
      tools: toolCalls.length,
      ...mark,
      total: since(t0),
    });

    const text = tidyReply(second.choices?.[0]?.message?.content ?? "");
    if (!text) {
      // The work happened even though the words did not — say the true thing about it.
      const fallback = artifacts.some((a) => a.type === "appointment")
        ? "That's booked. We'll see you then."
        : artifacts.length > 0
          ? "Thanks — I've passed this to the team and someone will follow up."
          : null;
      return { ok: Boolean(fallback), text: fallback, artifacts, reason: fallback ? undefined : "empty_completion" };
    }

    return { ok: true, text, artifacts };
  } catch (err) {
    console.error("[REPLY][LLM][ERROR]", {
      org_id: req.orgId,
      channel: req.channel,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, text: null, artifacts, reason: "llm_error" };
  }
}
