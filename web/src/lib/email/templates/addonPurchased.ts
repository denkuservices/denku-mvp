/**
 * Add-on change confirmation — extra phone numbers, extra simultaneous calls, or a chat
 * capacity tier.
 *
 * Add-ons change the bill and the capability at the same time, and until now they
 * changed both silently. This states the new effective limit (not just what was bought)
 * because "you now have 2 numbers" is the fact the customer actually needs; the delta on
 * its own tells them nothing about where they stand.
 */

import { renderEmail, detailList, notice } from "../layout";

export type AddonKey = "extra_phone" | "extra_concurrency" | "chat_basic" | "chat_standard";

const ADDON_LABEL: Record<AddonKey, string> = {
  extra_phone: "Additional phone number",
  extra_concurrency: "Additional simultaneous call",
  chat_basic: "Chat capacity — Basic",
  chat_standard: "Chat capacity — Standard",
};

const ADDON_UNIT: Record<AddonKey, string> = {
  extra_phone: "phone numbers",
  extra_concurrency: "simultaneous calls",
  chat_basic: "chat channels",
  chat_standard: "chat channels",
};

export interface AddonPurchasedParams {
  addonKey: AddonKey;
  /** Quantity after the change. */
  qty: number;
  /** Quantity before the change, so the mail can say what moved. */
  previousQty?: number | null;
  /** Effective total capability after the change (base plan + add-ons), when known. */
  effectiveTotal?: number | null;
  orgName?: string | null;
  billingUrl: string;
}

export function addonPurchasedTemplate(params: AddonPurchasedParams): {
  subject: string;
  html: string;
} {
  const { addonKey, qty, previousQty, effectiveTotal, orgName, billingUrl } = params;

  const label = ADDON_LABEL[addonKey];
  const unit = ADDON_UNIT[addonKey];
  const removed = typeof previousQty === "number" && qty < previousQty;

  const subject = removed
    ? `Your Denku add-ons were updated`
    : `Your workspace just got more capacity`;

  const html = renderEmail({
    title: subject,
    preheader: removed
      ? `${label} — now ${qty}. Your next invoice reflects the change.`
      : `${label} — now ${qty}. It's active immediately.`,
    eyebrow: "Plan change",
    heading: removed ? "Your add-ons were updated" : "More capacity, effective now",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: removed ? "neutral" : "positive",
    intro: removed
      ? "We've updated your add-ons. The change is already in effect and your next invoice will reflect it."
      : "Your add-on is active immediately — there's nothing to switch on.",
    blocks: [
      detailList([
        { label: "Add-on", value: label, strong: true },
        ...(typeof previousQty === "number" && previousQty !== qty
          ? [{ label: "Changed", value: `${previousQty} → ${qty}` }]
          : [{ label: "Quantity", value: String(qty) }]),
        ...(typeof effectiveTotal === "number"
          ? [{ label: "You now have", value: `${effectiveTotal} ${unit}`, strong: true }]
          : []),
      ]),
      notice(
        "Add-ons are billed with your subscription and are prorated by Stripe for the current period.",
        "neutral"
      ),
    ],
    cta: { label: "View billing", url: billingUrl },
    reason:
      "You're receiving this because your Denku add-ons changed. It's a billing confirmation, not marketing.",
  });

  return { subject, html };
}
