import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { readCompletedCheckout } from "@/lib/billing/completedCheckout";
import path from "node:path";

// The transport registry imports the Telegram transport, which reaches the service-role client,
// which fail-fasts without env. Nothing here touches the database — this only keeps that
// fail-fast from firing on an import.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
import {
  STUDIO_GROUPS,
  STUDIO_MAKES,
  STUDIO_PROCESS,
} from "@/lib/marketing/content/studio";
import {
  CHAT_ADDON_SLOTS,
  isChatAddonKey,
  otherChatAddonKey,
  refuseChatPurchase,
  isOfferablePlanCode,
  isVoicePlanCode,
  isActivatablePlanCode,
  VOICE_PLAN_CODES,
  RETIRED_CHAT_ONLY_PLAN_CODE,
} from "@/lib/billing/chatPlanKeys";

/**
 * The studio pages are built from a structure module and four message files, and the whole
 * point of that split is that a price cannot differ between languages while a word can be
 * missing from one. Both halves need guarding:
 *
 *   - a tier with no translation renders next-intl's raw key inside a pricing card, which
 *     looks like a bug to a customer and reads as a missing product to a search engine;
 *   - a `features` array typed as a string but written as one long sentence renders as a
 *     single bullet, silently losing the package contents.
 *
 * These tests read the shipped JSON rather than a fixture, so they fail when a translator
 * (or I) drop a key, not when someone remembers to update a mock.
 */

const LOCALES = ["en", "tr", "es", "de"] as const;

const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "src", "messages", `${l}.json`), "utf-8")
    ) as Record<string, unknown>,
  ])
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

/** Reads a dotted path, returning undefined rather than throwing on a missing branch. */
function at(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

describe("studio package structure", () => {
  it("prices every tier with a positive whole number of dollars", () => {
    for (const group of STUDIO_GROUPS) {
      for (const tier of group.tiers) {
        expect(Number.isInteger(tier.priceUsd)).toBe(true);
        expect(tier.priceUsd).toBeGreaterThan(0);
      }
    }
  });

  it("orders each group's tiers cheapest to dearest, so the cards read left to right", () => {
    for (const group of STUDIO_GROUPS) {
      const prices = group.tiers.map((t) => t.priceUsd);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
  });

  it("marks exactly one tier per group as the featured one", () => {
    for (const group of STUDIO_GROUPS) {
      expect(group.tiers.filter((t) => t.featured)).toHaveLength(1);
    }
  });

  it("keeps tier ids unique inside a group", () => {
    for (const group of STUDIO_GROUPS) {
      const ids = group.tiers.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("studio copy is complete in every language", () => {
  it.each(LOCALES)("%s has every tier's name, volume, who and features", (locale) => {
    for (const group of STUDIO_GROUPS) {
      expect(at(messages[locale], `studio.groups.${group.id}.name`)).toBeTruthy();

      for (const tier of group.tiers) {
        const base = `studio.groups.${group.id}.tiers.${tier.id}`;
        for (const field of ["name", "volume", "who"]) {
          const value = at(messages[locale], `${base}.${field}`);
          expect(typeof value, `${locale} ${base}.${field}`).toBe("string");
          expect((value as string).length).toBeGreaterThan(0);
        }

        const features = at(messages[locale], `${base}.features`);
        expect(Array.isArray(features), `${locale} ${base}.features`).toBe(true);
        // One bullet is almost certainly a sentence that was meant to be several.
        expect((features as string[]).length).toBeGreaterThan(1);
        for (const f of features as string[]) {
          expect(typeof f).toBe("string");
          expect(f.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it.each(LOCALES)("%s names every kind of work and every production step", (locale) => {
    for (const id of STUDIO_MAKES) {
      expect(at(messages[locale], `studio.makes.items.${id}`), `${locale} makes.${id}`).toBeTruthy();
    }
    for (const id of STUDIO_PROCESS) {
      expect(at(messages[locale], `studio.process.steps.${id}.name`)).toBeTruthy();
      expect(at(messages[locale], `studio.process.steps.${id}.body`)).toBeTruthy();
    }
  });

  it.each(LOCALES)("%s carries the section headings the pages render", (locale) => {
    for (const key of [
      "studio.makes.eyebrow",
      "studio.makes.headline",
      "studio.plans.eyebrow",
      "studio.plans.headline",
      "studio.plans.sub",
      "studio.plans.from",
      "studio.plans.cta",
      "studio.plans.noteTitle",
      "studio.plans.note",
      "studio.process.eyebrow",
      "studio.process.headline",
    ]) {
      expect(at(messages[locale], key), `${locale} ${key}`).toBeTruthy();
    }
  });

  it("prints no price inside the copy, so a number can never differ by language", () => {
    // Prices come from `STUDIO_GROUPS`. A dollar figure inside a message file is exactly the
    // drift this split exists to prevent.
    for (const locale of LOCALES) {
      const studio = JSON.stringify(at(messages[locale], "studio"));
      expect(studio, `${locale} studio copy`).not.toMatch(/\$\s?\d/);
    }
  });
});

describe("chat plan keys", () => {
  it("recognises the chat tiers and nothing else", () => {
    expect(isChatAddonKey("chat_basic")).toBe(true);
    expect(isChatAddonKey("chat_standard")).toBe(true);
    expect(isChatAddonKey("extra_phone")).toBe(false);
    expect(isChatAddonKey("extra_concurrency")).toBe(false);
  });

  it("grants more channels on the dearer tier", () => {
    expect(CHAT_ADDON_SLOTS.chat_standard).toBeGreaterThan(CHAT_ADDON_SLOTS.chat_basic);
  });

  it("never grants more slots than there are chat channels the AI can answer on", async () => {
    // A slot buys ANSWERING, so the measure is `canReplyOn` — the channel declares outbound
    // capability and a transport exists for it. Selling three slots against two answerable
    // channels would be selling a number, not a product.
    //
    // Deliberately NOT measured against `productionReady`. That flag currently reads false for
    // email while the transport is registered and the marketing site lists it as live — a known
    // divergence recorded in `lib/marketing/content/channels.ts`, awaiting an owner decision.
    // Tying this test to that flag would make an unresolved label look like a code defect.
    const { CHANNELS, CHANNEL_ORDER } = await import("@/lib/platform/channels");
    const { canReplyOn } = await import("@/lib/platform/transports/registry");

    const answerable = CHANNEL_ORDER.filter(
      (c) => CHANNELS[c].kind === "chat" && canReplyOn(c)
    ).length;

    for (const [key, slots] of Object.entries(CHAT_ADDON_SLOTS)) {
      expect(slots, `${key} grants ${slots} slots`).toBeLessThanOrEqual(answerable);
    }
  });

  it("pairs each tier with the other one", () => {
    expect(otherChatAddonKey("chat_basic")).toBe("chat_standard");
    expect(otherChatAddonKey("chat_standard")).toBe("chat_basic");
  });

  it("knows which plans come with a phone line", () => {
    expect([...VOICE_PLAN_CODES]).toEqual(["starter", "growth", "scale"]);
    for (const code of VOICE_PLAN_CODES) expect(isVoicePlanCode(code)).toBe(true);
    expect(isVoicePlanCode(RETIRED_CHAT_ONLY_PLAN_CODE)).toBe(false);
    expect(isVoicePlanCode("enterprise")).toBe(false);
  });

  it("still accepts the retired chat-only code on the way in, but never offers or switches to it", () => {
    // The webhook and the redirect fallback must accept `chat_only` — that is how a chat
    // purchase lands. The plan-change route must not: moving an existing workspace onto it
    // would strand the phone number it is already paying for.
    expect(isActivatablePlanCode(RETIRED_CHAT_ONLY_PLAN_CODE)).toBe(true);
    expect(isVoicePlanCode(RETIRED_CHAT_ONLY_PLAN_CODE)).toBe(false);
    for (const code of VOICE_PLAN_CODES) expect(isActivatablePlanCode(code)).toBe(true);
    expect(isActivatablePlanCode("nonsense")).toBe(false);
  });

  it("never offers the chat-only base plan in the plan grid", () => {
    // It carries zero minutes, zero concurrency and zero numbers. Offered beside the voice
    // plans it is a $0 card a paying customer could click to downgrade themselves out of
    // their phone service.
    expect(isOfferablePlanCode(RETIRED_CHAT_ONLY_PLAN_CODE)).toBe(false);
    for (const code of ["starter", "growth", "scale"]) {
      expect(isOfferablePlanCode(code), code).toBe(true);
    }
  });
});

describe("refuseChatPurchase", () => {
  const ok = { addonKey: "chat_basic", qty: 1, isIncreasing: true, otherChatQty: 0 };

  it("allows buying a tier the workspace does not have", () => {
    expect(refuseChatPurchase(ok)).toBeNull();
  });

  it("never touches the per-piece add-ons", () => {
    expect(
      refuseChatPurchase({ ...ok, addonKey: "extra_phone", qty: 12 })
    ).toBeNull();
  });

  it("refuses buying more than one of a tier", () => {
    // $998 for four slots against two answerable channels is not a bigger plan, it is a mistake.
    const r = refuseChatPurchase({ ...ok, qty: 2 });
    expect(r?.status).toBe(400);
    expect(r?.error).toMatch(/single choice/i);
  });

  it("refuses adding a second tier while one is held", () => {
    const r = refuseChatPurchase({ ...ok, otherChatQty: 1 });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/remove/i);
  });

  it("allows the second half of a tier switch, once the first is gone", () => {
    expect(refuseChatPurchase({ ...ok, otherChatQty: 0 })).toBeNull();
  });

  it("never blocks removing a plan, even holding both tiers", () => {
    // Cancelling must not depend on any of this — the same reason the route allows
    // decreases while billing is paused.
    expect(
      refuseChatPurchase({ addonKey: "chat_basic", qty: 0, isIncreasing: false, otherChatQty: 1 })
    ).toBeNull();
  });
});

describe("what a completed checkout bought", () => {
  /**
   * The four activation paths — webhook, onboarding success page, /checkout/complete and
   * /stripe/sync-checkout — must agree completely. A purchase that activates on one and is
   * refused on another is a customer charged for something they did not receive, which is why
   * this decision is one function rather than four copies of a plan-code check.
   */
  it("activates a voice purchase", () => {
    const out = readCompletedCheckout({ org_id: "o1", plan_code: "growth" });
    expect(out.ok).toBe(true);
    expect(out.voicePlanCode).toBe("growth");
    expect(out.chatAddonKey).toBeNull();
  });

  it("activates a chat purchase that carries no plan code at all", () => {
    // The point of the change: chat no longer needs a fictional voice plan to be activatable.
    const out = readCompletedCheckout({ org_id: "o1", chat_addon_key: "chat_basic" });
    expect(out.ok).toBe(true);
    expect(out.voicePlanCode).toBeNull();
    expect(out.chatAddonKey).toBe("chat_basic");
  });

  it("still accepts a session created before the change", () => {
    // A checkout created with `chat_only` may be sitting in a customer's browser right now.
    // Refusing it would take the money and give nothing back.
    const out = readCompletedCheckout({ org_id: "o1", plan_code: "chat_only", chat_addon_key: "chat_basic" });
    expect(out.ok).toBe(true);
    expect(out.voicePlanCode).toBeNull();
    expect(out.chatAddonKey).toBe("chat_basic");
  });

  it("activates both products from one session", () => {
    const out = readCompletedCheckout({ org_id: "o1", plan_code: "scale", chat_addon_key: "chat_standard" });
    expect(out.voicePlanCode).toBe("scale");
    expect(out.chatAddonKey).toBe("chat_standard");
  });

  it("refuses what it cannot name", () => {
    expect(readCompletedCheckout({ plan_code: "growth" }).reason).toBe("missing_org");
    expect(readCompletedCheckout({ org_id: "o1" }).reason).toBe("nothing_bought");
    expect(readCompletedCheckout({ org_id: "o1", plan_code: "enterprise" }).reason).toBe("invalid_plan");
    // An unknown addon key is not a purchase either — it would grant capacity nobody priced.
    expect(readCompletedCheckout({ org_id: "o1", chat_addon_key: "chat_unlimited" }).reason).toBe("nothing_bought");
    expect(readCompletedCheckout(null).reason).toBe("missing_org");
  });
});
