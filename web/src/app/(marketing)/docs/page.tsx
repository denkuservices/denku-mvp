import Link from 'next/link';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { Button } from '@/components/marketing/Button';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Check, Code, Webhook, Zap } from 'lucide-react';

const gettingStartedSteps = [
  {
    number: '1',
    title: 'Create Workspace',
    description: 'Set up your workspace with multi-tenant isolation. Configure team members and access roles.',
  },
  {
    number: '2',
    title: 'Create Agent',
    description: 'Define your agent with system prompts, language settings, and operational boundaries.',
  },
  {
    number: '3',
    title: 'Connect Tools',
    description: 'Integrate with your existing stack: CRM, calendars, helpdesk, or custom APIs via webhooks.',
  },
  {
    number: '4',
    title: 'Deploy Voice/Chat',
    description: 'Go live on any channel. Monitor performance with built-in dashboards and alerts.',
  },
];

const coreConcepts = [
  {
    title: 'Tenants & Workspaces',
    description: 'Isolated environments for different teams or customers. Each workspace has its own agents, data, and access controls.',
  },
  {
    title: 'Agents',
    description: 'AI agents that handle conversations. Configure with prompts, tools, and boundaries. Support both voice and chat.',
  },
  {
    title: 'Tools & Webhooks',
    description: 'Connect external services via pre-built integrations or custom webhooks. Tools enable agents to perform actions.',
  },
  {
    title: 'Observability',
    description: 'Full visibility into agent performance with structured logs, transcripts, metrics, and real-time dashboards.',
  },
];

const integrationExamples = [
  {
    title: 'Helpdesk Integration',
    description: 'Automatically create tickets in Zendesk or Intercom from agent conversations.',
    icon: Webhook,
  },
  {
    title: 'Calendar Actions',
    description: 'Book, reschedule, and confirm appointments through Google Calendar or Calendly.',
    icon: Zap,
  },
  {
    title: 'CRM Lead Capture',
    description: 'Capture qualified leads and sync structured data to Salesforce, HubSpot, or custom CRM.',
    icon: Code,
  },
];

const docsFaqs = [
  {
    question: 'How quickly can I get started?',
    answer: 'Most teams can deploy their first agent within hours. The platform handles infrastructure, so you focus on configuration.',
  },
  {
    question: 'Do you provide API access?',
    answer: 'Pro and Enterprise plans include full API access. Starter plans use the web interface and standard integrations.',
  },
  {
    question: 'Can I use custom models?',
    answer: 'Enterprise plans support custom model configurations. Contact sales for details on model options and requirements.',
  },
  {
    question: 'How do webhooks work?',
    answer: 'Configure webhook endpoints in your agent settings. All outbound events are signed with HMAC for verification.',
  },
];

export default function DocsPage() {
  return (
    <>
      <SectionHeader
        title="Docs"
        description="Get started in minutes."
        ctaPrimary={{ label: 'Get started', href: '/#contact' }}
        ctaSecondary={{ label: 'Talk to our AI', href: '/' }}
      />

      {/* Getting Started */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Getting Started
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
              Deploy your first agent in four simple steps.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {gettingStartedSteps.map((step) => (
              <div
                key={step.number}
                className="relative flex flex-col items-center text-center rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2563EB] bg-white text-xl font-bold text-[#2563EB] shadow-shadow-100">
                  {step.number}
                </div>
                <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#475569]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Core Concepts */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Core Concepts
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
              Understand the building blocks of SovereignAI.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {coreConcepts.map((concept) => (
              <div
                key={concept.title}
                className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold text-[#0F172A] mb-3">
                  {concept.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#475569]">
                  {concept.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Webhooks */}
      <Section>
        <Container>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
                Webhooks
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
                Configure endpoints to receive events from your agents.
              </p>
            </div>

            <div className="rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6">
              <p className="text-sm text-[#475569] mb-4">
                All webhook payloads are signed with HMAC-SHA256. Verify signatures on your server using your webhook secret.
              </p>
              <div className="rounded-lg bg-[#F1F5F9] p-4 border border-[#CBD5E1]">
                <pre className="text-xs text-[#0F172A] overflow-x-auto">
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

      {/* Integration Examples */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Integration Examples
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
              Common patterns and workflows (Preview).
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {integrationExamples.map((example) => {
              const Icon = example.icon;
              return (
                <div
                  key={example.title}
                  className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl mb-4">
                    <Icon className="h-6 w-6 text-[#2563EB]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0F172A] mb-3">
                    {example.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#475569]">
                    {example.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section>
        <Container>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl text-center mb-12">
              Documentation FAQ
            </h2>
            <div className="space-y-8">
              {docsFaqs.map((faq, i) => (
                <div key={i} className="border-b border-[#CBD5E1] pb-6">
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-sm text-[#475569] leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* Bottom CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Need help?
            </h2>
            <p className="mt-4 text-sm text-[#475569]">
              Contact us for technical support or custom integration guidance.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild size="lg" variant="ghost" className="text-base">
                <Link href="/">Talk to our AI</Link>
              </Button>
              <Button asChild size="lg" className="text-base">
                <Link href="/#contact">Contact us</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
