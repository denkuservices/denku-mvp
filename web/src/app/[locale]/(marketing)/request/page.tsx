import type { Metadata } from "next";
import { RequestForm } from "@/components/marketing/landing/RequestForm";

export const metadata: Metadata = {
  title: "Make a request",
  description:
    "Ask about the AI Employees platform, a free AI Audit of your phone line, AI Studio creative work, or a custom AI project.",
  alternates: { canonical: "/request" },
};

// Next.js 16: searchParams is a Promise and must be awaited.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;

  return (
    <>
      <section className="relative w-full overflow-hidden px-6 pb-12 pt-28 md:px-8 md:pt-32">
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
            Requests
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,64px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            Tell us what you need.
          </h1>
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            Four things we do. Pick the one you came for.
          </p>
        </div>
      </section>

      <section className="relative w-full px-6 pb-28 md:px-8">
        <RequestForm initialService={service} />
      </section>
    </>
  );
}
