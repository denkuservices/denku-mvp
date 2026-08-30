import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CHAT_ADDON_SLOTS } from "@/lib/billing/chatEntitlement";
import { LIVE_CHANNELS } from "@/lib/marketing/content/channels";
import { Reveal } from "./primitives";

/**
 * Chat pricing — sold by channel capacity, not by message volume.
 *
 * The tiers read "1 channel" and "2 channels" because that is what the product can actually
 * enforce today: a channel count is a COUNT this schema answers, while a message quota would
 * need metering that does not exist. Selling "3,000 messages" would be selling a number nobody
 * could count, enforce or cap.
 *
 * The slot counts are imported from `CHAT_ADDON_SLOTS` rather than typed in, so the page can
 * never advertise a number the entitlement code does not grant. When a third chat channel
 * ships and `chat_standard` becomes three slots, this page changes with it.
 *
 * `NEXT_PUBLIC_CHAT_PLANS_PURCHASABLE` gates the CTA. Until the operator creates the Stripe
 * products and fills `billing_addon_catalog.stripe_price_id`, checkout would fail closed
 * anyway — so the button says "talk to us" instead of pretending to sell.
 */

const PURCHASABLE = process.env.NEXT_PUBLIC_CHAT_PLANS_PURCHASABLE === "true";

const TIERS = [
  { key: "basic" as const, addon: "chat_basic", price: "$299", featured: false },
  { key: "standard" as const, addon: "chat_standard", price: "$499", featured: true },
];

export async function ChatPlans() {
  const t = await getTranslations("chatPlans");
  const tp = await getTranslations("pricingPage");
  const chatChannels = LIVE_CHANNELS.filter((c) => c.id !== "voice");

  return (
    <section id="chat-plans" className="relative w-full px-6 py-20 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(28px,3.8vw,46px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">{t("sub")}</p>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TIERS.map((tier, i) => {
            const slots = CHAT_ADDON_SLOTS[tier.addon] ?? 1;
            const features = t.raw(`features.${tier.key}`) as string[];
            return (
              <Reveal key={tier.key} delay={i * 90}>
                <div
                  className={`landing-glass flex h-full flex-col p-8 ${tier.featured ? "landing-sweep" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[22px] font-semibold text-[var(--d-ink)]">
                      {slots === 1 ? t("slotOne") : t("slotTwo")}
                    </h3>
                    {tier.featured && (
                      <span className="shrink-0 rounded-full border border-[rgba(200,148,104,.34)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-copper)]">
                        {tp("mostPicked")}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[44px] font-semibold leading-none text-[var(--d-ink)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {tier.price}
                    </span>
                    <span className="text-[14px] text-[var(--d-ink-faint)]">{tp("perMonth")}</span>
                  </div>

                  <ul className="mt-7 flex flex-1 flex-col gap-2.5">
                    {features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-[14.5px] leading-snug text-[var(--d-ink-soft)]"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-copper)]"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={PURCHASABLE ? "/signup" : "/request?service=ai-employees"}
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium transition-colors ${
                      tier.featured
                        ? "bg-[var(--d-copper)] text-[#0A1414] hover:bg-[#D9A87C]"
                        : "border border-[var(--d-border)] text-[var(--d-ink-soft)] hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                    }`}
                  >
                    {PURCHASABLE ? t("cta") : t("ctaContact")}
                  </Link>
                </div>
              </Reveal>
            );
          })}

          {/* The third tier is a conversation, not a price — the same shape the benchmark uses,
              and honest here because the features it would unlock are not all built. */}
          <Reveal delay={180}>
            <div className="flex h-full flex-col rounded-[20px] border border-dashed border-[var(--d-border)] p-8">
              <h3 className="font-display text-[22px] font-semibold text-[var(--d-ink)]">
                {t("custom")}
              </h3>
              <div className="mt-6 font-display text-[28px] font-semibold leading-none text-[var(--d-ink-soft)]">
                {t("customPrice")}
              </div>
              <p className="mt-6 flex-1 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("customNote")}
              </p>
              <Link
                href="/request?service=custom-ai"
                className="mt-8 inline-flex items-center justify-center rounded-full border border-[var(--d-border)] px-6 py-3.5 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
              >
                {t("ctaContact")}
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Which channels a slot can actually be spent on — the honest limit of the offer. */}
        <Reveal delay={240}>
          <div className="mt-6 rounded-[20px] border border-[var(--d-border)] px-7 py-6">
            <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
              {t("availableTitle")}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chatChannels.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full border border-[rgba(127,201,143,.28)] bg-[rgba(127,201,143,.10)] px-3 py-1 text-[13px] text-[var(--d-success)]"
                >
                  {c.label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
              {t("available")}
            </p>
            {!PURCHASABLE && (
              <p className="mt-3 font-brand-mono text-[12px] text-[var(--d-ink-faint)]">
                {t("notPurchasable")}
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default ChatPlans;
