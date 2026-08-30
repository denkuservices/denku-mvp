import { getTranslations } from "next-intl/server";
import { EmployeeCard } from "./EmployeeCard";
import { Reveal } from "./primitives";
import { ChannelGrid } from "./ChannelGrid";
import { CapabilityColumns, SubpageCta, SubpageHero } from "./SubpageShell";
import { ChatPlans } from "./ChatPlans";

/**
 * The two channel landing pages, `/voice` and `/chat`.
 *
 * Why these exist alongside `/employees/*`: the roster pages are organised by ROLE
 * ("receptionist", "missed-call rescue"), which matches the brand's hiring metaphor
 * but misses how people actually search. "AI call agent" and "AI chat agent" are
 * distinct queries and distinct ad destinations. These two pages catch that intent
 * without implying two products — both point at the same single plan, because the
 * billing system meters voice minutes and nothing else.
 *
 * That last point is why the billing block on each page says something different
 * and true: voice is billed by the minute, chat is included and unmetered. If chat
 * ever becomes separately priced, this is the paragraph that changes.
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
  const t = await getTranslations(`channelPages.${channel}`);
  const emp = HERO_EMPLOYEE[channel];
  const te = await getTranslations(`employees.items.${emp.slug}`);

  return (
    <>
      <SubpageHero eyebrow={t("eyebrow")} title={t("headline")} sub={t("sub")}>
        <div className="flex flex-col items-center gap-4 lg:items-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(127,201,143,.28)] bg-[rgba(127,201,143,.10)] px-3 py-1.5 font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-success)]">
            <span className="landing-pulse relative h-[5px] w-[5px] rounded-full bg-[var(--d-success)]" />
            {t("status")}
          </span>
          <EmployeeCard
            name={emp.name}
            role={te("role")}
            glyph={emp.glyph}
            ticker={te.raw("ticker") as string[]}
            fragments={[]}
          />
        </div>
      </SubpageHero>

      <CapabilityColumns
        does={t.raw("does") as string[]}
        notYet={t.raw("notYet") as string[]}
      />

      {/* How this channel is paid for — different, and true, for each one. */}
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

      {channel === "chat" && <ChannelGrid />}
      {channel === "chat" && <ChatPlans />}

      <SubpageCta label={t("cta")} />
    </>
  );
}

export default ChannelPage;
