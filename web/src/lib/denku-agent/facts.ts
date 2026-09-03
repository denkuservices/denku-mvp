import { CHANNELS, CHANNEL_ORDER, type Channel } from "@/lib/platform/channels";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/language/registry";

/**
 * What Denku may truthfully say about itself.
 *
 * This module exists because the landing page assistant's prompt was hand-written and went stale
 * where nobody could see it. On 2026-09-03 it was still telling callers "English and Spanish"
 * while the product shipped four languages, and it had never heard of Telegram, Email, Web Chat,
 * BYON or the commerce integration. A prospect was being told a smaller product than the one
 * they could buy — and, worse, the same mechanism could just as easily tell them a BIGGER one.
 *
 * So nothing here is typed out by hand. Availability is DERIVED from the registries that already
 * decide it: `CHANNELS[...].productionReady` and `LANGUAGES`. The day WhatsApp flips to
 * production-ready the assistant starts offering it, in the same commit, with no prompt to
 * remember to edit — and until that day it cannot promise it, however the question is phrased.
 *
 * The distinction the registry draws is the one that matters commercially:
 *
 *   productionReady  — safe to SELL. The assistant may offer it.
 *   adopted          — an adapter exists; a customer can connect it and watch messages arrive,
 *                      but the AI does not answer there yet.
 *   neither          — not built. The assistant must say so.
 *
 * Collapsing those three into "we support it" is how a demo becomes a refund.
 *
 * Everything is pure and takes its billing rows as an argument, exactly like
 * `prompt-derivation.ts`, so the copy an assistant speaks can be asserted in a unit test rather
 * than discovered on a call.
 */

/** A voice plan row as the catalogue stores it. */
export type PlanRow = {
  plan_code: string;
  display_name: string;
  monthly_fee_usd: string | number;
  included_minutes: number;
  overage_rate_usd_per_min: string | number;
  concurrency_limit: number;
  included_phone_numbers: number;
};

/** An add-on row as the catalogue stores it. */
export type AddonRow = {
  addon_key: string;
  label: string;
  price_usd_month: string | number;
  is_active?: boolean;
};

/**
 * Voice plans the assistant may quote.
 *
 * `chat_only` is filtered out by name. It is a $0/0-minute row left in the catalogue after the
 * fiction was retired on 2026-09-02 — voice and chat are two independent products now, and a
 * workspace that bought chat simply has no voice plan. An assistant reading the table naively
 * would offer a caller a free plan that grants nothing.
 */
const RETIRED_PLAN_CODES = new Set(["chat_only"]);

const money = (v: string | number): number => (typeof v === "number" ? v : Number(v));

export type PlanFact = {
  code: string;
  name: string;
  monthlyUsd: number;
  includedMinutes: number;
  overagePerMinuteUsd: number;
  concurrentCalls: number;
  includedNumbers: number;
};

export function voicePlanFacts(rows: PlanRow[]): PlanFact[] {
  return rows
    .filter((r) => !RETIRED_PLAN_CODES.has(r.plan_code))
    .map((r) => ({
      code: r.plan_code,
      name: r.display_name,
      monthlyUsd: money(r.monthly_fee_usd),
      includedMinutes: r.included_minutes,
      overagePerMinuteUsd: money(r.overage_rate_usd_per_min),
      concurrentCalls: r.concurrency_limit,
      includedNumbers: r.included_phone_numbers,
    }))
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd);
}

export type AddonFact = { key: string; label: string; monthlyUsd: number };

export function addonFacts(rows: AddonRow[]): AddonFact[] {
  return rows
    .filter((r) => r.is_active !== false)
    .map((r) => ({ key: r.addon_key, label: r.label, monthlyUsd: money(r.price_usd_month) }))
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd);
}

export type ChannelFact = {
  id: Channel;
  label: string;
  /** The AI answers here today. Safe to sell. */
  answersToday: boolean;
  /** Messages arrive and are visible, but the AI does not reply yet. */
  receiveOnly: boolean;
  /** Not built at all. */
  notBuilt: boolean;
  canSeeImages: boolean;
  canHearVoiceNotes: boolean;
};

export function channelFacts(): ChannelFact[] {
  return CHANNEL_ORDER.map((id) => {
    const meta = CHANNELS[id];
    const answersToday = meta.productionReady && meta.capabilities.outbound;
    return {
      id,
      label: meta.label,
      answersToday,
      receiveOnly: meta.adopted && !answersToday,
      notBuilt: !meta.adopted,
      canSeeImages: meta.capabilities.imageUnderstanding,
      canHearVoiceNotes: meta.capabilities.audioUnderstanding,
    };
  });
}

/** The languages Denku can hear and speak — the registry IS the limit. */
export function languageFacts(): { code: string; label: string }[] {
  return LANGUAGE_CODES.map((code) => ({ code, label: LANGUAGES[code].label }));
}

/**
 * Render the channel facts as a sentence an assistant can read out.
 *
 * Deliberately three separate clauses. A single list would let the model flatten "answers today"
 * and "arrives but is not answered" into one claim, which is precisely the over-promise this
 * module exists to prevent.
 */
export function channelSentence(facts: ChannelFact[] = channelFacts()): string {
  const name = (f: ChannelFact) => f.label;
  const answers = facts.filter((f) => f.answersToday).map(name);
  const receive = facts.filter((f) => f.receiveOnly).map(name);
  const soon = facts.filter((f) => f.notBuilt).map(name);

  const lines: string[] = [];
  if (answers.length > 0) {
    lines.push(`The AI answers on: ${answers.join(", ")}.`);
  }
  if (receive.length > 0) {
    lines.push(
      `Connectable today, messages arrive in the Inbox, but the AI does NOT reply there yet: ${receive.join(", ")}.`,
    );
  }
  if (soon.length > 0) {
    lines.push(`Not built yet — do not promise these: ${soon.join(", ")}.`);
  }
  return lines.join("\n");
}

export function languageSentence(): string {
  return `Denku speaks and understands: ${languageFacts().map((l) => l.label).join(", ")}. No other language is supported.`;
}

/**
 * Numbers a voice model will read as quantities, not as digits.
 *
 * On the first real Turkish call the assistant read `3600` aloud as "üç altı sıfır sıfır" —
 * three, six, zero, zero. `149`, `400` and `1200` survived, which is the worst version of this
 * bug: it looks fine until the one plan nobody tested is quoted to a customer.
 *
 * A thousands separator is what fixes it, because "3,600" is unambiguously a quantity while
 * "3600" can be read as a digit string. The prompt also carries an explicit instruction, since
 * belt and braces cost nothing here and the failure is heard by a prospect.
 */
const qty = (n: number): string => n.toLocaleString("en-US");

const usd = (n: number): string =>
  Number.isInteger(n) ? `$${qty(n)}` : `$${n.toFixed(2)}`;

export function planSentence(plans: PlanFact[]): string {
  if (plans.length === 0) return "";
  const lines = plans.map(
    (p) =>
      `- ${p.name}: ${usd(p.monthlyUsd)}/month, ${qty(p.includedMinutes)} minutes included, ` +
      `${p.concurrentCalls} call${p.concurrentCalls === 1 ? "" : "s"} at once, ` +
      `${p.includedNumbers} phone number included, ` +
      `${usd(p.overagePerMinuteUsd)}/minute after the included minutes.`,
  );
  return `Voice plans (per month, cancel any time, no free trial):\n${lines.join("\n")}`;
}

export function addonSentence(addons: AddonFact[]): string {
  if (addons.length === 0) return "";
  return `Add-ons:\n${addons.map((a) => `- ${a.label}: ${usd(a.monthlyUsd)}/month.`).join("\n")}`;
}
