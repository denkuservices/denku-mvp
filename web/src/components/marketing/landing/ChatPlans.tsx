import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CHAT_ADDON_SLOTS } from "@/lib/billing/chatPlanKeys";
import { LIVE_CHANNELS } from "@/lib/marketing/content/channels";
import { Reveal } from "./primitives";
import { ArrowRight, Boxes, Check, Plus, Sparkles } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";

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
  const [t, tp, tc] = await Promise.all([
    getTranslations("chatPlans"),
    getTranslations("pricingPage"),
    getTranslations("channels"),
  ]);
  const chatChannels = LIVE_CHANNELS.filter((c) => c.id !== "voice");

  return (
    <section id="chat-plans" className="relative w-full overflow-hidden px-6 py-20 md:px-8 md:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 48% at 76% 48%, rgba(200,148,104,.09), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 grid gap-7 md:grid-cols-[1.1fr_.9fr] md:items-end">
          <div className="max-w-2xl">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
              {t("eyebrow")}
            </div>
            <h2 className="mt-4 font-display text-[clamp(30px,4vw,50px)] font-semibold leading-[1.03] tracking-[-.025em] text-[var(--d-ink)]">
              {t("headline")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">{t("sub")}</p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {chatChannels.map((channel) => (
              <span
                key={channel.id}
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(127,201,143,.18)] bg-[rgba(127,201,143,.055)] py-1.5 pl-1.5 pr-3 text-[11px] text-[var(--d-ink-soft)]"
              >
                <ChannelIcon channel={channel.id} size="sm" />
                {tc(`items.${channel.id}.label`)}
              </span>
            ))}
          </div>
        </Reveal>

        <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((tier, i) => {
            const slots = CHAT_ADDON_SLOTS[tier.addon] ?? 1;
            const features = t.raw(`features.${tier.key}`) as string[];
            return (
              <Reveal key={tier.key} delay={i * 90}>
                <div
                  className={`landing-glass relative flex h-full min-h-[510px] flex-col overflow-hidden p-7 sm:p-8 ${tier.featured ? "landing-sweep bg-[var(--d-surface-glass-hi)] lg:-translate-y-3" : ""}`}
                >
                  <div
                    aria-hidden="true"
                    className="absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl"
                    style={{ background: tier.featured ? "rgba(200,148,104,.13)" : "rgba(47,163,154,.08)" }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex -space-x-2">
                      {chatChannels.map((channel, channelIndex) => (
                        <ChannelIcon
                          key={channel.id}
                          channel={channel.id}
                          size="md"
                          muted={channelIndex >= slots}
                          className="ring-4 ring-[#101B1B]"
                        />
                      ))}
                    </div>
                    {tier.featured && (
                      <span className="shrink-0 rounded-full border border-[rgba(200,148,104,.34)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-copper)]">
                        {tp("mostPicked")}
                      </span>
                    )}
                  </div>

                  <div className="relative mt-8 flex items-end justify-between gap-3 border-b border-[var(--d-border)] pb-7">
                    <div>
                      <h3 className="font-display text-[23px] font-semibold leading-tight text-[var(--d-ink)]">
                        {slots === 1 ? t("slotOne") : t("slotTwo")}
                      </h3>
                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span
                          className="font-display text-[44px] font-semibold leading-none text-[var(--d-ink)]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {tier.price}
                        </span>
                        <span className="text-[14px] text-[var(--d-ink-faint)]">
                          {tp("perMonth")}
                        </span>
                      </div>
                    </div>
                    <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--d-border)] text-[var(--d-copper)]">
                      <span className="font-display text-[17px] font-semibold">{slots}×</span>
                    </span>
                  </div>

                  <ul className="relative mt-7 flex flex-1 flex-col gap-3">
                    {features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[var(--d-ink-soft)]"
                      >
                        <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--d-success)]" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={PURCHASABLE ? "/signup" : "/request?service=ai-employees"}
                    className={`group/cta relative mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-medium transition-colors ${
                      tier.featured
                        ? "bg-[var(--d-copper)] text-[#0A1414] hover:bg-[#D9A87C]"
                        : "border border-[var(--d-border)] text-[var(--d-ink-soft)] hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                    }`}
                  >
                    {PURCHASABLE ? t("cta") : t("ctaContact")}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                  </Link>
                </div>
              </Reveal>
            );
          })}

          {/* The third tier is a conversation, not a price — the same shape the benchmark uses,
              and honest here because the features it would unlock are not all built. */}
          <Reveal delay={180}>
            <div className="relative flex h-full min-h-[486px] flex-col overflow-hidden rounded-[20px] border border-dashed border-[var(--d-border)] p-7 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-[rgba(200,148,104,.22)] bg-[rgba(200,148,104,.08)] text-[var(--d-copper)]">
                  <Boxes aria-hidden="true" className="h-5 w-5" />
                </span>
                <Sparkles aria-hidden="true" className="h-4 w-4 text-[var(--d-ink-faint)]" />
              </div>
              <h3 className="font-display text-[22px] font-semibold text-[var(--d-ink)]">
                {t("custom")}
              </h3>
              <div className="mt-4 font-display text-[30px] font-semibold leading-none text-[var(--d-ink-soft)]">
                {t("customPrice")}
              </div>
              <div className="my-7 flex items-center gap-2 border-y border-[var(--d-border)] py-5">
                {chatChannels.map((channel) => (
                  <ChannelIcon key={channel.id} channel={channel.id} size="sm" />
                ))}
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-dashed border-[var(--d-border)] text-[var(--d-ink-faint)]">
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="flex-1 text-[13.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("customNote")}
              </p>
              <Link
                href="/request?service=custom-ai"
                className="group/cta mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--d-border)] px-6 py-3.5 text-[14px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
              >
                {t("ctaContact")}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>

        {!PURCHASABLE && (
          <Reveal delay={240}>
            <p className="mt-6 text-center font-brand-mono text-[11px] text-[var(--d-ink-faint)]">
              {t("notPurchasable")}
            </p>
          </Reveal>
        )}
      </div>
    </section>
  );
}

export default ChatPlans;
