import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/marketing/landing/primitives";
import { ChannelGrid } from "@/components/marketing/landing/ChannelGrid";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Company",
  description:
    "What Denku is building, the rules we hold ourselves to, and how to reach a person.",
  alternates: { canonical: "/company" },
};

/**
 * The company page.
 *
 * Not an "about us" with stock photography and a founding myth. The most useful
 * thing a small vendor can put here is the set of rules it actually engineers to —
 * they are checkable against the product, which is the whole argument.
 *
 * Each principle below is implemented, not aspirational; the parenthetical names
 * the mechanism so it can be verified.
 */

const PRINCIPLES = [
  {
    title: "A call never dead-ends.",
    body: "Every finished call produces something — a ticket or an appointment request — even when the AI never reaches for a tool. It is a guarantee in the pipeline, not a prompt we hope holds.",
  },
  {
    title: "We fail closed on money.",
    body: "Gating checks fail open so a paying customer is never locked out. Billing writes fail closed so nothing is ever guessed. When those two conflict, money loses.",
  },
  {
    title: "Everything can happen twice.",
    body: "Webhooks retry. Networks repeat themselves. Every write path is built to be run again without doing damage — that is why a retried call does not create two appointments.",
  },
  {
    title: "We say what isn't built.",
    body: "Channels in beta are labelled beta. Certifications we don't hold are named on the security page. We removed compliance claims from this site that we could not stand behind.",
  },
];

const FACTS = [
  { k: "What we sell", v: "An AI employee for your phone line, plus the work around it." },
  { k: "Who it's for", v: "Service businesses in the US where a missed call is a lost job." },
  { k: "How you buy", v: "Self-serve, printed prices, month to month." },
  { k: "Who answers support", v: "A person. Sometimes our own AI — and it says so." },
];

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <section className="relative w-full overflow-hidden px-6 pb-16 pt-28 md:px-8 md:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(47,163,154,.20), transparent 65%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          <div className="mb-6 font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            Company
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            We build one thing, carefully.
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            An employee that answers your phone, writes down what happened, and
            remembers the customer next time.
          </p>
        </div>
      </section>

      {/* The facts, without a story around them */}
      <section className="relative w-full px-6 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)] md:grid-cols-2 lg:grid-cols-4">
              {FACTS.map((f) => (
                <div key={f.k} className="bg-[var(--d-bg)] px-7 py-8">
                  <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                    {f.k}
                  </div>
                  <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--d-ink)]">{f.v}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* The rules we engineer to */}
      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-12 max-w-2xl">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
              How we build
            </div>
            <h2 className="mt-4 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
              Four rules, enforced in code.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
              You can check every one of these against the product.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 70}>
                <div className="landing-glass flex h-full flex-col p-7">
                  <span
                    aria-hidden="true"
                    className="mb-4 h-[2px] w-9 rounded-full bg-[var(--d-copper)]"
                  />
                  <h3 className="font-display text-[21px] font-semibold leading-snug text-[var(--d-ink)]">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                    {p.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ChannelGrid />

      <section className="relative w-full px-6 pb-8 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] border border-[var(--d-border)] p-8 sm:flex-row sm:items-center">
              <div>
                <div className="font-display text-[20px] font-semibold text-[var(--d-ink)]">
                  Want to check any of this?
                </div>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                  Read the security page, or call the demo line and judge the product
                  rather than the copy.
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Link
                  href="/security"
                  className="rounded-full border border-[var(--d-border)] px-5 py-2.5 text-[14px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                >
                  Security
                </Link>
                <Link
                  href="/request"
                  className="rounded-full border border-[var(--d-border)] px-5 py-2.5 text-[14px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                >
                  Contact
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SubpageCta />
    </>
  );
}
