export default function TermsPage() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Terms of Service</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is an MVP terms page. We will expand this document before production rollout.
        </p>

        <div className="mt-10 space-y-6 text-sm text-muted-foreground">
          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">Use of the service</div>
            <p className="mt-2">
              You agree to use the service in compliance with applicable laws and not to misuse or
              interfere with the platform.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">Availability</div>
            <p className="mt-2">
              The service is provided on an “as is” basis during MVP. We may change features as we
              iterate and improve.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">Limitation of liability</div>
            <p className="mt-2">
              To the extent permitted by law, we are not liable for indirect or consequential damages.
              Enterprise terms may be provided under separate agreement.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
