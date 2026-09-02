import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLlmProvider } from "@/lib/llm/provider";
import { channelMeta } from "@/lib/platform/channels";
import { buildChatSystemPrompt } from "@/lib/platform/reply/prompt";
import { buildDenkuCorePrompt } from "@/lib/denku-agent/corePrompt";
import { isDenkuSelfOrg, loadCorpusContext } from "@/lib/denku-agent/tools";
import { executeTool, toolDefinitionsFor, type ToolContext } from "@/lib/platform/reply/tools";
import { COMMERCE_TOOL_NAMES } from "@/lib/commerce/tools";
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

/**
 * One attempt's budget, and one retry.
 *
 * Measured on production, a model call answers in 0.7–1.7s — so a call still running at eight
 * seconds is not slow, it is stuck, and waiting longer only makes the customer wait longer. The
 * retry exists because a real timeout happened on a real conversation and the customer got
 * silence: transient failures are common enough that not retrying once is a choice to fail.
 *
 * Worst case is two windows, which is still less than the single 12s budget this replaced plus
 * the re-ask it forced out of the customer.
 */
const LLM_TIMEOUT_MS = 8000;
const MAX_REPLY_CHARS = 1200;

/**
 * Spend guard. `lib/rateLimit.ts` is an in-memory Map and a no-op on Vercel (landmine #8), so the
 * only honest limiter is the database. One conversation may not extract more than this many
 * replies per hour — enough that no real customer notices, low enough that a script pointed at a
 * customer's bot cannot run up a model bill overnight.
 */
const MAX_REPLIES_PER_CONVERSATION_PER_HOUR = 30;

/**
 * The same guard, one level up.
 *
 * The per-conversation cap stops one thread running away; it does nothing about a thousand
 * threads opened at once, which is what an abusive integration or a leaked bot token actually
 * looks like. This is the workspace ceiling for that case.
 *
 * Sized so no real customer meets it: an SMB answering 500 messages in a single hour is having
 * an extraordinary day, and would still be answered for the first 500. It is a safety valve
 * against a runaway model bill, NOT a billing meter — chat is sold by channel capacity, not by
 * message count (docs/LANDING_V3_DESIGN_PLAN.md §9.7), and nothing here is metered for money.
 */
const MAX_REPLIES_PER_ORG_PER_HOUR = 500;

export async function replyBudgetRemaining(
  orgId: string,
  conversationId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const base = () =>
      db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("direction", "outbound")
        .gte("created_at", since);

    // Both windows are asked at once — neither answer depends on the other, and waiting for the
    // first before starting the second would be a round trip spent on nothing.
    const [thread, workspace] = await Promise.all([
      base().eq("conversation_id", conversationId),
      base(),
    ]);

    // A broken count must not silence a real customer.
    if (thread.error || workspace.error) return true;
    return (
      (thread.count ?? 0) < MAX_REPLIES_PER_CONVERSATION_PER_HOUR &&
      (workspace.count ?? 0) < MAX_REPLIES_PER_ORG_PER_HOUR
    );
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
    // The SDK's own retry is disabled so the retry policy is ours: it applies only to failures
    // worth retrying, and only once, rather than silently multiplying every call's latency.
    maxRetries: 0,
    timeout: LLM_TIMEOUT_MS,
  });

  /**
   * Retry once, and only what is worth retrying.
   *
   * A timeout or a network blip is transient — the same request usually succeeds immediately
   * after. A 4xx is us: a bad key, a malformed request, a model that no longer exists. Retrying
   * that just doubles the wait before the same failure.
   */
  async function withOneRetry<T>(
    label: string,
    run: () => Promise<T>
  ): Promise<T> {
    try {
      return await run();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const transient = status === undefined || status === 408 || status === 429 || status >= 500;
      if (!transient) throw err;
      console.warn("[REPLY][LLM][RETRY]", {
        org_id: req.orgId,
        stage: label,
        reason: err instanceof Error ? err.message : String(err),
      });
      return await run();
    }
  }

  const channel = channelMeta(req.channel);

  /**
   * Denku's own workspace is a customer in every way except one: its prompt.
   *
   * It has a real employee, a real Inbox, real contacts and real artifacts, because the fastest
   * way to find out what the product is like is to be its customer. But its system prompt is not
   * built from Knowledge fields somebody typed. Denku's product facts ARE the product, and typed
   * fields are precisely what went stale on the landing page assistant for months — four
   * languages reported as two, half the channels missing. `buildDenkuCorePrompt` renders them
   * from the registries and the billing catalogue instead, so they cannot.
   *
   * Everything else on this path is unchanged: same engine, same tools, same handover, same
   * artifacts. If the reply engine breaks for Denku, it has broken for every customer, which is
   * the point of dogfooding it here rather than building a second one.
   */
  const system = isDenkuSelfOrg(req.employee.orgId)
    ? buildDenkuCorePrompt({
        ...(await loadCorpusContext()),
        surface: `the ${channel.label} channel on Denku's own site`,
        spoken: false,
      })
    : buildChatSystemPrompt({
        employee: req.employee,
        channelLabel: channel.label,
        contactName: req.contactName,
        recall: req.recall,
        nowLocal: localNow(req.employee.timezone),
        // Straight from the registry: the AI is told it can see and hear exactly where that is true.
        canPerceiveMedia: channel.capabilities.imageUnderstanding || channel.capabilities.audioUnderstanding,
        hoursBlock: req.hoursBlock ?? null,
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
    // Which tools exist is a per-workspace fact now: a store connection adds catalogue lookups.
    // Resolved before the call rather than inside it so the timing log shows what it cost.
    const tTooldefs = Date.now();
    const toolDefinitions = await toolDefinitionsFor(req.orgId);
    mark.tooldefs = since(tTooldefs);

    const tLlm1 = Date.now();
    const first = await withOneRetry("first", () =>
      client.chat.completions.create({
        model: provider.model,
        temperature: 0.3,
        max_tokens: 400,
        messages,
        tools: toolDefinitions,
      })
    );
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

    /**
     * A confirmation is one sentence; a catalogue answer is a short list.
     *
     * 160 tokens is right for "that's booked for Thursday" and wrong for "we have it in red (3
     * left), blue (12) and black (out of stock)" — which arrives truncated mid-variant, i.e. as a
     * stock answer the customer would act on and we cut in half.
     */
    const answeringFromCatalog = toolCalls.some(
      (c) => c.type === "function" && COMMERCE_TOOL_NAMES.has(c.function.name)
    );

    const tLlm2 = Date.now();
    const second = await withOneRetry("second", () =>
      client.chat.completions.create({
        model: provider.model,
        temperature: 0.3,
        max_tokens: answeringFromCatalog ? 500 : 160,
        messages: secondPass,
        // No tools on the second pass: its job is to speak, and offering the tools again is what
        // turns "book it" into a loop that books it four times.
      })
    );

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
