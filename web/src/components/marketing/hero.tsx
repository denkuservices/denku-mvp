import Link from 'next/link';

const trustItems = [
  'Multi-tenant architecture',
  'Secure by design',
  'Deploy in minutes',
  'Voice, chat, and automation',
];

export function Hero() {
  return (
    <section className="py-16 md:py-24">
      <div className="relative overflow-hidden rounded-2xl border bg-background">
        {/* subtle background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-foreground/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-foreground/5 blur-3xl" />
        </div>

        <div className="relative px-6 py-14 md:px-12 md:py-20">
          <div className="max-w-3xl">
            <p className="text-sm text-muted-foreground">
              SovereignAI · AI agents for modern businesses
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
              Rent AI agents. Deploy in minutes.
            </h1>

            <p className="mt-5 text-lg text-muted-foreground md:text-xl">
              Launch voice, chat, and automation agents with multi-tenant isolation,
              observability, and fast onboarding—built for SaaS teams.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90 transition"
              >
                Get started
              </Link>

              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-md border px-5 py-3 text-sm font-medium hover:bg-muted transition"
              >
                Request demo
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {trustItems.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-foreground/60" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
