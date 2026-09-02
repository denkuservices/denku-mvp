import "server-only";

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CORPUS, type CorpusContext } from "@/lib/denku-agent/corpus";
import {
  addonFacts,
  voicePlanFacts,
  type AddonRow,
  type PlanRow,
} from "@/lib/denku-agent/facts";
import { renderSearchResult, searchDenkuKnowledge } from "@/lib/denku-agent/search";

/**
 * The one thing Denku's own assistant can DO: look something up about Denku.
 *
 * Defined once and used by both transports — the Vapi route at `app/api/tools/search-denku` and
 * the chat reply engine — for the same reason `executeCommerceTool` is: a visitor who asks the
 * same question by phone and in the website widget has to get the same answer. Two copies of this
 * would drift, and the first symptom would be a prospect quoting a price the other channel does
 * not recognise.
 *
 * **This tool is NOT in `DENKU_TOOL_IDS`, and must never be added to it.** That list is merged
 * into every customer assistant by `ensureAssistantConfig`, which would give a plumber's AI the
 * ability to talk about Denku's pricing to the plumber's callers. It is attached to Denku's own
 * assistant explicitly, and the route refuses a call that resolves to any other workspace.
 */

export const DENKU_KNOWLEDGE_TOOL_NAME = "search_denku_knowledge";

/**
 * The enum the model chooses from, rendered as `id — title` so the choice is informed.
 *
 * Roughly 250 tokens on every turn, because a tool schema travels with the request. That is the
 * price of the design and it is the right trade: the alternative is the whole corpus (~6,600)
 * riding along whether or not anybody asks a question.
 */
function topicGuide(): string {
  return CORPUS.map((c) => `${c.id} — ${c.title}`).join("; ");
}

export function denkuKnowledgeToolDefinition(): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: DENKU_KNOWLEDGE_TOOL_NAME,
      description:
        "Look up what is true about Denku — pricing, channels, languages, technical requirements, " +
        "security, how something works, or what happens after a call. Call this before answering " +
        "any specific question about Denku rather than answering from memory. Choose the `topic` " +
        `that best matches the question. Available topics: ${topicGuide()}`,
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: CORPUS.map((c) => c.id),
            description: "The topic that best matches what the visitor asked.",
          },
          question: {
            type: "string",
            description:
              "The visitor's question in their own words. Used when no topic fits well.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  };
}

/**
 * The billing rows the computed chunks need, cached in module scope.
 *
 * A plan catalogue changes when someone edits a price, which is a handful of times a year, and
 * this is read on a live phone call where a round trip is a pause the caller hears. Sixty seconds
 * is long enough that a busy assistant reads it once per conversation and short enough that a
 * price correction is live within the minute.
 */
let cache: { at: number; ctx: CorpusContext } | null = null;
const CACHE_MS = 60_000;

/** Prices are a fact about Denku, so a failed read must never become an invented number. */
const EMPTY_CONTEXT: CorpusContext = { plans: [], addons: [] };

export async function loadCorpusContext(): Promise<CorpusContext> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ctx;

  try {
    const [plans, addons] = await Promise.all([
      supabaseAdmin
        .from("billing_plan_catalog")
        .select(
          "plan_code, display_name, monthly_fee_usd, included_minutes, overage_rate_usd_per_min, concurrency_limit, included_phone_numbers",
        ),
      supabaseAdmin
        .from("billing_addon_catalog")
        .select("addon_key, label, price_usd_month, is_active"),
    ]);

    const ctx: CorpusContext = {
      plans: voicePlanFacts((plans.data ?? []) as PlanRow[]),
      addons: addonFacts((addons.data ?? []) as AddonRow[]),
    };
    cache = { at: Date.now(), ctx };
    return ctx;
  } catch {
    // Never throw into a live conversation. An empty catalogue renders a chunk without prices,
    // and the prompt already forbids inventing one — so the assistant says it will confirm the
    // number rather than guessing it.
    return cache?.ctx ?? EMPTY_CONTEXT;
  }
}

export type DenkuKnowledgeArgs = { topic?: string | null; question?: string | null };

/**
 * Run the lookup. Always resolves to a string the model can read out.
 *
 * There is no failure return. A miss is rendered as an instruction to be honest and take the
 * visitor's details — see `renderSearchResult` — because on a live call the model repeats the
 * sense of whatever comes back, and an error code invites improvisation.
 */
export async function executeDenkuKnowledge(args: DenkuKnowledgeArgs): Promise<string> {
  const ctx = await loadCorpusContext();
  return renderSearchResult(searchDenkuKnowledge(args, ctx));
}

/**
 * Is this workspace Denku itself?
 *
 * Denku runs as its own customer, so its knowledge tool has to be scoped the same way a
 * customer's commerce tools are — by workspace, not by trust in the caller. `DENKU_SELF_ORG_ID`
 * names that workspace.
 *
 * Unset means NO workspace is Denku, which fails closed: the chat side simply does not offer the
 * tool. The voice route reads it the other way round (see the route) because the landing-page
 * demo has no workspace to resolve at all in the first seconds of a call.
 */
export function isDenkuSelfOrg(orgId: string | null | undefined): boolean {
  const self = process.env.DENKU_SELF_ORG_ID?.trim();
  if (!self || !orgId) return false;
  return orgId === self;
}
