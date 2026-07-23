import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { Code, Webhook, Zap } from 'lucide-react';
import { SITE_NAME } from '@/config/site';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Docs',
  description: `Documentation for ${SITE_NAME} — getting started, how the AI voice employee works, and answers to common questions.`,
  alternates: { canonical: '/docs' },
};

const gettingStartedSteps = [
  { number: '01', title: 'Create Workspace', description: 'Set up your workspace with multi-tenant isolation. Configure team members and access roles.' },
  { number: '02', title: 'Create Agent', description: 'Define your agent with system prompts, language settings, and operational boundaries.' },
  { number: '03', title: 'Connect Tools', description: 'Integrate with your existing stack: CRM, calendars, helpdesk, or custom APIs via webhooks.' },
  { number: '04', title: 'Deploy Voice/Chat', description: 'Go live on any channel. Monitor performance with built-in dashboards and alerts.' },
];

const coreConcepts = [
  { title: 'Tenants & Workspaces', description: 'Isolated environments for different teams or customers. Each workspace has its own agents, data, and access controls.' },
  { title: 'Agents', description: 'AI agents that handle conversations. Configure with prompts, tools, and boundaries. Support both voice and chat.' },
  { title: 'Tools & Webhooks', description: 'Connect external services via pre-built integrations or custom webhooks. Tools enable agents to perform actions.' },
  { title: 'Observability', description: 'Full visibility into agent performance with structured logs, transcripts, metrics, and real-time dashboards.' },
];

const integrationExamples = [
  { title: 'Helpdesk Integration', description: 'Automatically create tickets in Zendesk or Intercom from agent conversations.', icon: Webhook },
  { title: 'Calendar Actions', description: 'Book, reschedule, and confirm appointments through Google Calendar or Calendly.', icon: Zap },
  { title: 'CRM Lead Capture', description: 'Capture qualified leads and sync structured data to Salesforce, HubSpot, or custom CRM.', icon: Code },
];

const docsFaqs = [
  { question: 'How quickly can I get started?', answer: 'Most teams can deploy their first agent within hours. The platform handles infrastructure, so you focus on configuration.' },
  { question: 'Do you provide API access?', answer: 'Scale plans include full API access. Starter and Growth plans use the web interface and standard integrations.' },
  { question: 'Can I use custom models?', answer: 'Scale plans support custom model configurations. Contact sales for details on model options and requirements.' },
  { question: 'How do webhooks work?', answer: 'Configure webhook endpoints in your agent settings. All outbound events are signed with HMAC for verification.' },
];

export default function DocsPage() {
  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-20">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Documentation</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal tracking-[-1.5px] text-[#0A1A2F]">Docs</h1>
            <p className="mx-auto mt-4 max-w-xl text-[18px] text-[#2C3E54]">Get started in minutes.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">Get started</Link>
              <Link href="/" className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">Talk to Denku</Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Getting started */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Getting started</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#2C3E54]">Deploy your first agent in four simple steps.</p>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {gettingStartedSteps.map((step, i) => (
              <Reveal key={step.number} delay={(i % 4) as 0 | 1 | 2 | 3} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#1B6E6E]/30 font-display text-[15px] font-medium text-[#1B6E6E]">{step.number}</div>
                <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#2C3E54]">{step.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Core concepts */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Core concepts</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#2C3E54]">Understand the building blocks of {SITE_NAME}.</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {coreConcepts.map((concept, i) => (
              <Reveal key={concept.title} delay={(i % 2) as 0 | 1} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
                <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">{concept.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#2C3E54]">{concept.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Webhooks */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <Reveal className="mb-8 text-center">
              <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Webhooks</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-[#2C3E54]">Configure endpoints to receive events from your agents.</p>
            </Reveal>
            <div className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-6">
              <p className="mb-4 text-sm text-[#2C3E54]">All webhook payloads are signed with HMAC-SHA256. Verify signatures on your server using your webhook secret.</p>
              <div className="rounded-[12px] border border-[#0A1A2F]/10 bg-[#0A1A2F] p-4">
                <pre className="overflow-x-auto font-brand-mono text-xs text-[#F7F5F1]/80">
                  <code>{`// Verify webhook signature (example)
const signature = request.headers['x-signature'];
const payload = request.body;
const secret = process.env.WEBHOOK_SECRET;

const expected = hmacSHA256(payload, secret);
if (signature !== expected) {
  return 401; // Invalid signature
}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Integration examples */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Integration examples</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#2C3E54]">Common patterns and workflows.</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {integrationExamples.map((example, i) => {
              const Icon = example.icon;
              return (
                <Reveal key={example.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6 transition-all hover:-translate-y-1 hover:brand-shadow-md">
                  <div className="mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">{example.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#2C3E54]">{example.description}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="border-t border-[#0A1A2F]/[0.06]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Documentation FAQ</h2>
            <div className="space-y-6">
              {docsFaqs.map((faq) => (
                <div key={faq.question} className="border-b border-[#0A1A2F]/[0.08] pb-6">
                  <h3 className="mb-2 font-display text-[17px] font-medium text-[#0A1A2F]">{faq.question}</h3>
                  <p className="text-sm leading-relaxed text-[#2C3E54]">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
