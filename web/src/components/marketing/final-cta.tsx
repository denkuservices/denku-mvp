import Link from 'next/link';

export function FinalCta() {
  return (
    <section className="py-10 md:py-16">
      <div className="rounded-2xl border bg-background p-8 md:p-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Ready to ship your AI agent?
            </h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Create an agent, connect channels, and go live. Keep data isolated with multi-tenant design.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
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
        </div>
      </div>
    </section>
  );
}
