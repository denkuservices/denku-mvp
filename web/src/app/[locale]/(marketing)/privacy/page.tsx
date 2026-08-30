import { Container } from '@/components/marketing/Container';

export default function PrivacyPage() {
  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">Legal</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">Privacy Policy</h1>
          <p className="mt-4 text-[17px] text-[var(--s-ink-soft)]">
            A summary of what we collect, why, and how to reach us about it. We expand this document
            as the product grows — if anything here is unclear, ask us and we will answer plainly.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { title: 'Data we collect', body: 'We may collect account details, contact information, and operational metadata needed to provide the service (e.g., usage events, logs, and configuration data).' },
              { title: 'How we use data', body: 'We use data to operate the platform, provide support, improve reliability, and maintain security. We do not sell personal data.' },
              { title: 'Contact', body: 'For privacy questions, contact us via the Contact page.' },
            ].map((item) => (
              <div key={item.title} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-2 font-display text-[17px] font-medium text-[var(--s-ink)]">{item.title}</div>
                <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
