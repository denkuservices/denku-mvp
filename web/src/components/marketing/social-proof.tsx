export function SocialProof() {
  return (
    <section className="py-10 md:py-14">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-background p-6">
          <div className="text-sm text-muted-foreground">Architecture</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">Multi-tenant by default</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Tenant-isolated data access and scoped tooling—built for SaaS scale and clean
            customer separation.
          </p>
        </div>

        <div className="rounded-2xl border bg-background p-6">
          <div className="text-sm text-muted-foreground">Reliability</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">Observable operations</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Track calls, messages, and automation outcomes with structured events that
            support audits and iteration.
          </p>
        </div>

        <div className="rounded-2xl border bg-background p-6">
          <div className="text-sm text-muted-foreground">Security</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">Secure integrations</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Webhooks, API tools, and workflows designed to minimize blast radius and keep
            sensitive data contained.
          </p>
        </div>
      </div>
    </section>
  );
}
