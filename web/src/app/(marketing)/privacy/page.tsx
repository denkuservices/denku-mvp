export default function PrivacyPage() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Privacy Policy</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is an MVP policy page. We will expand this document as we finalize product scope and
          compliance requirements.
        </p>

        <div className="mt-10 space-y-6 text-sm text-muted-foreground">
          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">Data we collect</div>
            <p className="mt-2">
              We may collect account details, contact information, and operational metadata needed to
              provide the service (e.g., usage events, logs, and configuration data).
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">How we use data</div>
            <p className="mt-2">
              We use data to operate the platform, provide support, improve reliability, and maintain
              security. We do not sell personal data.
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight text-foreground">Contact</div>
            <p className="mt-2">
              For privacy questions, contact us via the Contact page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
