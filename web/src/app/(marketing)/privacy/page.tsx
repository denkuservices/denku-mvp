import { Container } from '@/components/marketing/Container';

export default function PrivacyPage() {
  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">Legal</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[#0A1A2F]">Privacy Policy</h1>
          <p className="mt-4 text-[17px] text-[#2C3E54]">
            This is an MVP policy page. We will expand this document as we finalize product scope and compliance requirements.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { title: 'Data we collect', body: 'We may collect account details, contact information, and operational metadata needed to provide the service (e.g., usage events, logs, and configuration data).' },
              { title: 'How we use data', body: 'We use data to operate the platform, provide support, improve reliability, and maintain security. We do not sell personal data.' },
              { title: 'Contact', body: 'For privacy questions, contact us via the Contact page.' },
            ].map((item) => (
              <div key={item.title} className="rounded-[18px] border border-[#0A1A2F]/[0.08] bg-[#FBFAF8] p-6">
                <div className="mb-2 font-display text-[17px] font-medium text-[#0A1A2F]">{item.title}</div>
                <p className="text-sm leading-relaxed text-[#2C3E54]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
