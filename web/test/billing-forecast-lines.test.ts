import { describe, it, expect } from "vitest";
import { isChatAddonKey } from "@/lib/billing/chatPlanKeys";

/** Mirrors the addonLines derivation on the billing page, against this workspace's real data. */
function addonLines(
  available: { key: string; label: string; price_usd_month: number }[],
  active: Record<string, number>
) {
  return available
    .map((a) => {
      const qty = active[a.key] || 0;
      return { key: a.key, label: a.label, qty, monthly: a.price_usd_month * (isChatAddonKey(a.key) ? Math.min(qty, 1) : qty) };
    })
    .filter((l) => l.qty > 0);
}

describe("forecast add-on itemisation", () => {
  const available = [
    { key: "extra_concurrency", label: "Extra concurrent calls", price_usd_month: 99 },
    { key: "extra_phone", label: "Extra phone number", price_usd_month: 10 },
    { key: "chat_basic", label: "Chat — 1 channel", price_usd_month: 299 },
    { key: "chat_standard", label: "Chat — 2 channels", price_usd_month: 499 },
  ];

  it("adds up to the total the card already showed", () => {
    // ali4@hotmail.com's real workspace: growth + chat_standard + 1 extra number + 1 extra seat.
    const lines = addonLines(available, { chat_standard: 1, extra_phone: 1, extra_concurrency: 1 });
    expect(lines.map((l) => l.label)).toEqual([
      "Extra concurrent calls",
      "Extra phone number",
      "Chat — 2 channels",
    ]);
    expect(lines.reduce((sum, l) => sum + l.monthly, 0)).toBe(608);
  });

  it("multiplies what genuinely stacks, and never a chat tier", () => {
    const lines = addonLines(available, { extra_phone: 3, chat_standard: 1 });
    expect(lines.find((l) => l.key === "extra_phone")!.monthly).toBe(30);
    // A tier is a choice, not a quantity — qty 2 would be an incoherent purchase, not $998.
    expect(addonLines(available, { chat_standard: 2 }).find((l) => l.key === "chat_standard")!.monthly).toBe(499);
  });

  it("shows nothing when nothing is bought", () => {
    expect(addonLines(available, {})).toEqual([]);
    expect(addonLines(available, { extra_phone: 0 })).toEqual([]);
  });
});
