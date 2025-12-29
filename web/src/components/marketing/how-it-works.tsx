import Link from 'next/link';

const steps = [
  {
    title: 'Sign up',
    desc: 'Create your workspace and choose your plan.',
  },
  {
    title: 'Configure your agent',
    desc: 'Set language, behavior, channels, and business tools.',
  },
  {
    title: 'Go live',
    desc: 'Deploy to phone or web and start handling customers instantly.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-10 md:py-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            A clean onboarding flow designed for speed—without sacrificing tenant isolation
            and operational control.
          </p>
        </div>

        <Link
          href="/contact"
          className="hidden md:inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition"
        >
          Talk to sales
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border bg-background p-6">
            <div className="text-sm text-muted-foreground">Step {i + 1}</div>
            <div className="mt-2 text-xl font-semibold tracking-tight">{s.title}</div>
            <p className="mt-3 text-sm text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
