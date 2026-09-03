import { getTranslations } from "next-intl/server";
import { EmployeeCard } from "./EmployeeCard";
import { Reveal } from "./primitives";
import { ChannelGrid } from "./ChannelGrid";
import { CapabilityColumns, SubpageCta, SubpageHero } from "./SubpageShell";
import { ChatPlans } from "./ChatPlans";
import { ChatProductPreview, type ChatPreviewCopy } from "./ChatProductPreview";
import { ChatJourney, type ChatJourneyCopy } from "./ChatJourney";

/**
 * The two channel landing pages, `/voice` and `/chat`.
 *
 * Why these exist alongside `/employees/*`: the roster pages are organised by ROLE
 * ("receptionist", "missed-call rescue"), which matches the brand's hiring metaphor
 * but misses how people actually search. "AI call agent" and "AI chat agent" are
 * distinct queries and distinct ad destinations. These two pages catch that intent
 * without implying two products. Voice is billed by minute allowance; chat is sold
 * separately by the number of live channels the employee answers.
 *
 * Naming note: these are "AI Voice" and "AI Chat", never "AI Call Agent". CLAUDE.md
 * bans "agent" in customer-facing copy, and doc 14 makes "AI Employee" the category
 * term — so the channel is the noun, not the worker.
 */

type ChannelKey = "voice" | "chat";

const HERO_EMPLOYEE: Record<ChannelKey, { slug: string; name: string; glyph: string }> = {
  voice: { slug: "receptionist", name: "Ava", glyph: "◍" },
  chat: { slug: "support-agent", name: "Iris", glyph: "◎" },
};

export async function ChannelPage({ channel }: { channel: ChannelKey }) {
  const isChat = channel === "chat";
  const emp = HERO_EMPLOYEE[channel];
  const [t, te] = await Promise.all([
    getTranslations(`channelPages.${channel}`),
    isChat ? Promise.resolve(null) : getTranslations(`employees.items.${emp.slug}`),
  ]);

  return (
    <>
      <SubpageHero
        eyebrow={t("eyebrow")}
        title={t("headline")}
        sub={t("sub")}
        primaryCta={isChat ? { label: t("primaryCta"), href: "#chat-plans" } : undefined}
        secondaryCta={isChat ? { label: t("secondaryCta"), href: "/request?service=ai-employees" } : undefined}
      >
        {isChat ? (
          <ChatProductPreview copy={t.raw("showcase") as ChatPreviewCopy} />
        ) : (
          <div className="flex flex-col items-center gap-4 lg:items-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(127,201,143,.28)] bg-[rgba(127,201,143,.10)] px-3 py-1.5 font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-success)]">
              <span className="landing-pulse relative h-[5px] w-[5px] rounded-full bg-[var(--d-success)]" />
              {t("status")}
            </span>
            <EmployeeCard
              name={emp.name}
              role={te?.("role") ?? ""}
              glyph={emp.glyph}
              ticker={(te?.raw("ticker") as string[] | undefined) ?? []}
              fragments={[]}
            />
          </div>
        )}
      </SubpageHero>

      {isChat ? (
        <ChatJourney copy={t.raw("journey") as ChatJourneyCopy} />
      ) : (
        <CapabilityColumns
          does={t.raw("does") as string[]}
          notYet={t.raw("notYet") as string[]}
        />
      )}

      {/* How this channel is paid for — different, and true, for each one. */}
      {!isChat && (
        <section className="relative w-full px-6 py-16 md:px-8">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <div className="rounded-[20px] border border-[rgba(200,148,104,.30)] p-8">
                <h2 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-copper)]">
                  {t("billingTitle")}
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
                  {t("billingBody")}
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {isChat && <ChannelGrid includeVoice={false} />}
      {isChat && <ChatPlans />}

      <SubpageCta label={t("cta")} />
    </>
  );
}

export default ChannelPage;
