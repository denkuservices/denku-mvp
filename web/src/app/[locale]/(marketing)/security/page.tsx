import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Denku isolates your data, authenticates its webhooks, caps your spend — and what we deliberately do not claim.",
  alternates: { canonical: "/security" },
};

/**
 * The trust page.
 *
 * Doc 14 §5: for a small vendor in the US market, a candid trust page beats
 * inflated badges. That is why the last section exists and is not buried — this
 * repo previously shipped SOC 2 and HIPAA claims that were not true, and the
 * correction is not just removing them but saying plainly what the status is.
 *
 * Every control listed here is one the codebase actually implements.
 */

const CONTROLS = [
  {
    n: "01",
    title: "Tenant isolation",
    body: "Every tenant table carries an organisation id, and row-level security policies scope reads to the organisation on your profile. Privileged background writes go through a separate client that must name the organisation explicitly.",
  },
  {
    n: "02",
    title: "Encryption",
    body: "TLS in transit. Data at rest is encrypted by our database provider. Per-tenant channel credentials — bot tokens, access tokens — are encrypted with a separate key before they are stored, and are never readable from the browser.",
  },
  {
    n: "03",
    title: "Authenticated webhooks",
    body: "Inbound webhooks are verified before their body is parsed: Meta's signature for Instagram, a per-connection secret token for Telegram. Requests that fail verification are rejected, not logged and processed.",
  },
  {
    n: "04",
    title: "Spend caps",
    body: "Each workspace has a hard cap. On reaching it we pause the line rather than continue billing — enforced in the platform itself, not in a spreadsheet. Pausing actually stops inbound calls; it is not a flag we check later.",
  },
  {
    n: "05",
    title: "Your data stays yours",
    body: "Calls, transcripts, contacts and appointments belong to your workspace. You can export them, and deleting your account deletes them.",
  },
  {
    n: "06",
    title: "Access control",
    body: "The operator console is separate from the customer application and behind its own authentication. Customer sessions can never reach it.",
  },
];

const NOT_CLAIMED = [
  {
    title: "We are not SOC 2 certified.",
    body: "Not yet, and we will not imply otherwise. If your procurement needs a report today, we are the wrong vendor right now — tell us and we will say so.",
  },
  {
    title: "We are not HIPAA compliant.",
    body: "Do not route protected health information through Denku. Booking a dental appointment is fine; clinical detail is not.",
  },
  {
    title: "We have no third-party penetration test to show.",
    body: "When we commission one, the result goes on this page whichever way it reads.",
  },
];

export default async function SecurityPage({
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
            Security &amp; trust
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            What we do, and what we don&apos;t claim.
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            Both halves of this page matter. The second one is the reason to believe
            the first.
          </p>
        </div>
      </section>

      <section className="relative w-full px-6 py-12 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((c, i) => (
            <Reveal key={c.n} delay={i * 60}>
              <div className="landing-glass flex h-full flex-col p-7">
                <div className="font-brand-mono text-[11px] tracking-[.16em] text-[var(--d-teal)]">
                  {c.n}
                </div>
                <h2 className="mt-3.5 font-display text-[20px] font-semibold leading-snug text-[var(--d-ink)]">
                  {c.title}
                </h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                  {c.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-10">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
              Not claimed
            </div>
            <h2 className="mt-4 font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
              The things we can&apos;t say yet.
            </h2>
          </Reveal>

          <div className="flex flex-col gap-4">
            {NOT_CLAIMED.map((n, i) => (
              <Reveal key={n.title} delay={i * 70}>
                <div className="rounded-[20px] border border-dashed border-[var(--d-border)] p-7">
                  <h3 className="font-display text-[18px] font-semibold text-[var(--d-ink)]">
                    {n.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                    {n.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={250}>
            <p className="mt-8 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
              Something here unclear, or something you need that isn&apos;t listed?{" "}
              <Link href="/request" className="text-[var(--d-copper)] hover:underline">
                Ask us directly
              </Link>{" "}
              — a person answers.
            </p>
          </Reveal>
        </div>
      </section>

      <SubpageCta label="Questions before you trust us with the phone?" />
    </>
  );
}
