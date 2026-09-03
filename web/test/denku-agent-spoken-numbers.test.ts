import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  addonFacts,
  addonSentence,
  chatPlanSentence,
  numberToWords,
  planSentence,
  voicePlanFacts,
  type AddonRow,
  type PlanRow,
} from "@/lib/denku-agent/facts";
import { buildDenkuCorePrompt } from "@/lib/denku-agent/corePrompt";

/**
 * Numbers, on a phone call, in Turkish.
 *
 * Two rounds of real calls decided the design these tests pin. The assistant read `3600` as
 * "üç altı sıfır sıfır" — digit by digit. A thousands separator looked like the obvious fix and
 * it did NOT work: the next call still said "üç altı sıfır sıfır", and added "sekiz yüz otuz
 * dokuz" for `$899` — eight hundred THIRTY-nine, a wrong price invented mid-conversion — and
 * "sıfır point on üç" for `$0.13`, half in English.
 *
 * Every number already SPELLED in the prompt came out perfectly in Turkish in every call. What
 * broke was always a numeral the model had to convert. So the spoken prompt carries no numerals
 * at all: the model only translates words into words.
 */

const PLANS: PlanRow[] = [
  { plan_code: "starter", display_name: "Starter", monthly_fee_usd: 149, included_minutes: 400, overage_rate_usd_per_min: 0.22, concurrency_limit: 1, included_phone_numbers: 1 },
  { plan_code: "growth", display_name: "Growth", monthly_fee_usd: 399, included_minutes: 1200, overage_rate_usd_per_min: 0.18, concurrency_limit: 4, included_phone_numbers: 1 },
  { plan_code: "scale", display_name: "Scale", monthly_fee_usd: 899, included_minutes: 3600, overage_rate_usd_per_min: 0.13, concurrency_limit: 10, included_phone_numbers: 1 },
];

const ADDONS: AddonRow[] = [
  { addon_key: "extra_phone", label: "Extra phone number", price_usd_month: 10 },
  { addon_key: "extra_concurrency", label: "Extra concurrent calls", price_usd_month: 99 },
  { addon_key: "chat_basic", label: "Chat — 1 channel", price_usd_month: 299 },
  { addon_key: "chat_standard", label: "Chat — 2 channels", price_usd_month: 499 },
];

const CTX = { plans: voicePlanFacts(PLANS), addons: addonFacts(ADDONS) };
const spoken = buildDenkuCorePrompt({ ...CTX, surface: "a phone call", spoken: true });
const written = buildDenkuCorePrompt({ ...CTX, surface: "the website chat", spoken: false });

describe("numberToWords", () => {
  it("spells the whole range this catalogue uses", () => {
    expect(numberToWords(1)).toBe("one");
    expect(numberToWords(10)).toBe("ten");
    expect(numberToWords(13)).toBe("thirteen");
    expect(numberToWords(22)).toBe("twenty-two");
    expect(numberToWords(99)).toBe("ninety-nine");
    expect(numberToWords(149)).toBe("one hundred forty-nine");
    expect(numberToWords(400)).toBe("four hundred");
    expect(numberToWords(899)).toBe("eight hundred ninety-nine");
    expect(numberToWords(1200)).toBe("one thousand two hundred");
    expect(numberToWords(3600)).toBe("three thousand six hundred");
  });
});

describe("the spoken prompt contains no numerals for the model to convert", () => {
  it("spells every price and count", () => {
    expect(spoken).toMatch(/Scale: eight hundred ninety-nine dollars a month/);
    expect(spoken).toMatch(/three thousand six hundred minutes/);
    expect(spoken).toMatch(/one hundred forty-nine dollars a month/);
  });

  it("says a per-minute rate in CENTS, where 'point' leaked in from English", () => {
    expect(spoken).toMatch(/thirteen cents a minute/);
    expect(spoken).toMatch(/twenty-two cents a minute/);
    expect(spoken).not.toMatch(/\$0\.\d/);
  });

  it("leaves no PRICE numeral anywhere in the price blocks", () => {
    // The exact strings the model mangled: 899, 3600/3,600, 0.13. The catalogue's own labels
    // ("Chat — 1 channel") still carry a digit and that is fine — a bare 1 is not what broke.
    const priceArea = spoken.split("Voice plans")[1]?.split("The AI answers on")[0] ?? "";
    expect(priceArea).not.toMatch(/\$\s*\d/);
    expect(priceArea).not.toMatch(/\d{3}/);
    expect(priceArea).not.toMatch(/\d[.,]\d/);
  });

  it("keeps digits in the WRITTEN prompt, where they read correctly", () => {
    // A chat reader wants $899, not "eight hundred ninety-nine dollars".
    expect(written).toMatch(/\$899\/month/);
    expect(written).toMatch(/3,600 minutes/);
  });
});

describe("how much of the price list to say", () => {
  it("tells the spoken assistant not to read the table", () => {
    // Asked for "packages and prices" it recited all three plans with every attribute — about
    // forty numbers unbroken — and the visitor interrupted to make it stop.
    expect(spoken).toMatch(/never read the whole table/);
    expect(spoken).toMatch(/plan NAME and the monthly price only/);
  });

  it("tells the written assistant not to soften a price into an estimate", () => {
    // In the web chat it said chat plans are "$299, $499 civarında" — around/about. They are
    // catalogue prices; softening one invites a negotiation Denku is not having.
    expect(written).toMatch(/quote the exact figure, never 'around' or 'about'/);
    expect(written).toMatch(/never say a chat plan costs "around" or "about"/);
  });
});

describe("two things the web chat got wrong", () => {
  it("refuses to answer a bare greeting with a bare greeting", () => {
    // "Merhaba" was answered with "Merhaba". A dead end on the first turn of a sales chat.
    expect(written).toMatch(/A bare greeting deserves a real opening/);
  });

  it("says the channels belong to the BUSINESS, not to Denku", () => {
    // It offered "web sitemiz" — our website — as one of the channels the customer could use.
    // The widget goes on THEIR site; the Telegram bot is THEIR bot.
    expect(written).toMatch(/These are the business's OWN channels, not Denku's/);
    expect(written).toMatch(/Never offer 'our website'/);
  });
});
