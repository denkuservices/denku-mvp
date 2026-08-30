import { Container } from '@/components/marketing/Container';

export default function TermsPage() {
  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">Legal</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">Terms of Service</h1>
          <p className="mt-4 text-[17px] text-[var(--s-ink-soft)]">
            The terms you agree to when you use Denku. Plain language, kept short on purpose.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { title: 'Use of the service', body: 'You agree to use the service in compliance with applicable laws and not to misuse or interfere with the platform.' },
              { title: 'Availability', body: 'The service is provided on an "as is" basis. We may change features as we iterate and improve, and we will tell you before anything you rely on goes away.' },
              { title: 'Limitation of liability', body: 'To the extent permitted by law, we are not liable for indirect or consequential damages. Enterprise terms may be provided under separate agreement.' },
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
