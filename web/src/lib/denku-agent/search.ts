import "server-only";

import {
  CORPUS,
  renderChunk,
  type CorpusChunk,
  type CorpusContext,
} from "@/lib/denku-agent/corpus";

/**
 * Finding the right thing to say about Denku.
 *
 * **The model does the retrieval.** The tool takes a `topic` from an enum of chunk ids, and the
 * model — which has already read the question in whatever language it was asked — picks one. That
 * is deliberate, and it is the whole reason there is no embedding index here:
 *
 *   - The corpus is small enough to enumerate (a few dozen chunks), so an index would be
 *     infrastructure protecting nothing.
 *   - It is multilingual for free. "Kendi numaramı bağlayabilir miyim" reaches
 *     `bring-your-own-number` because the MODEL maps it, not because a Turkish keyword happened to
 *     be in an English tag list. A keyword index across four languages is exactly the thing that
 *     silently returns nothing.
 *   - Nothing has to be rebuilt on deploy, so the corpus and the answers cannot drift apart.
 *   - Every possible answer is enumerable, so the tests can assert what a customer might hear.
 *
 * `question` is the fallback for when the model passes free text anyway — models do — and it is
 * scored over titles and tags rather than refused, because returning the second-best chunk beats
 * returning nothing to someone who is mid-sentence on a phone call.
 */

export type SearchHit = { id: string; title: string; body: string };

export type SearchOutcome =
  | { found: true; hits: SearchHit[] }
  | { found: false; reason: "no_match" | "no_query" };

/** Words too common to distinguish one chunk from another. */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "can", "i", "we", "you", "my", "your", "it",
  "to", "of", "and", "or", "for", "on", "in", "with", "what", "how", "have", "has", "be",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Score a chunk against a free-text question.
 *
 * Scored per TAG rather than per word, so a fully-matched two-word tag ("own number") outranks a
 * generic one-word tag that happened to hit ("number"). A longer fully-matched tag is stronger
 * evidence, because it is more specific.
 *
 * The body is not scored at all. A chunk mentioning "phone number" in passing should not outrank
 * the chunk whose whole subject is the phone number, and long chunks would otherwise win every
 * comparison by being long.
 *
 * **This is approximate, and it is meant to be.** Keyword matching genuinely cannot separate
 * "can I use my own phone number" from the chunk about the number Denku provides — the words are
 * nearly identical and the intent lives entirely in "own". That is why this is the FALLBACK and
 * why it returns several candidates: the model reads them and picks. The primary path is the
 * model choosing a topic id, where there is nothing to get wrong.
 */
function scoreChunk(chunk: CorpusChunk, words: string[]): number {
  const query = new Set(words);
  let score = 0;

  for (const tag of chunk.tags) {
    const tagWords = tokenize(tag);
    if (tagWords.length === 0) continue;
    const matched = tagWords.filter((w) => query.has(w)).length;
    if (matched === tagWords.length) score += 4 + 2 * tagWords.length;
    else score += matched;
  }

  const title = chunk.title.toLowerCase();
  for (const w of words) if (title.includes(w)) score += 2;

  return score;
}

export type SearchInput = {
  /** A chunk id from the tool enum. Preferred — this is the model choosing. */
  topic?: string | null;
  /** Free text, when the model passes a question instead of an id. */
  question?: string | null;
  /** How many chunks to return at most. */
  limit?: number;
};

export function searchDenkuKnowledge(input: SearchInput, ctx: CorpusContext): SearchOutcome {
  const limit = Math.max(1, Math.min(input.limit ?? 2, 4));
  const toHit = (c: CorpusChunk): SearchHit => ({
    id: c.id,
    title: c.title,
    body: renderChunk(c, ctx),
  });

  // 1. An exact topic id — the model chose, so honour it.
  const topic = (input.topic ?? "").trim().toLowerCase();
  if (topic) {
    const exact = CORPUS.find((c) => c.id === topic);
    if (exact) return { found: true, hits: [toHit(exact)] };
  }

  // 2. Free text. A topic that did not match an id is still words worth scoring — a model that
  //    invents "pricing" instead of "pricing-voice" should not be answered with silence.
  const query = [topic, (input.question ?? "").trim()].filter(Boolean).join(" ");
  if (!query) return { found: false, reason: "no_query" };

  const words = tokenize(query);
  if (words.length === 0) return { found: false, reason: "no_query" };

  const ranked = CORPUS.map((c) => ({ chunk: c, score: scoreChunk(c, words) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) return { found: false, reason: "no_match" };
  return { found: true, hits: ranked.map((r) => toHit(r.chunk)) };
}

/**
 * The string the model actually receives.
 *
 * A miss is phrased as an instruction rather than an error code, because the model reads this
 * mid-conversation and repeats its sense to a customer. "Not found" invites improvisation; being
 * told what to say instead is what keeps an unanswerable question from becoming an invented
 * answer — the same rule the reply engine applies to a failed booking.
 */
export function renderSearchResult(outcome: SearchOutcome): string {
  if (!outcome.found) {
    return (
      "No Denku documentation matched that question. Do NOT guess or infer an answer. Tell the " +
      "customer honestly that you do not want to give them a wrong answer on this one, offer to " +
      "have someone from the team follow up, and take their name and contact details."
    );
  }
  return outcome.hits.map((h) => `## ${h.title}\n${h.body}`).join("\n\n");
}
