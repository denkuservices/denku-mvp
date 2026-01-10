'use client';

import Link from 'next/link';
import Image from 'next/image';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { Button } from '@/components/marketing/Button';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { PanelMock } from '@/components/marketing/visual/PanelMock';
import { StatusChip } from '@/components/marketing/visual/StatusChip';
import { SlaComparisonCard } from '@/components/marketing/visual/SlaComparisonCard';
import { VisualAccordion } from '@/components/marketing/visual/VisualAccordion';
import { Waveform } from '@/components/marketing/visual/Waveform';
import { BookOpen, MessageSquare, Mail, Mic, AlertCircle, Webhook, Gauge, CreditCard } from 'lucide-react';

export default function SupportPage() {
  return (
    <>
      {/* Hero - Split Layout */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-sm font-bold text-[#64748B] mb-4 uppercase tracking-wide">
                Support
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-[#0F172A] md:text-5xl lg:text-6xl mb-6">
                Help that's predictable.
              </h1>
              <p className="text-lg text-[#475569] mb-8 leading-relaxed">
                Docs, response targets, and escalation when it matters.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="text-base">
                  <Link href="/#contact">Contact support</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="text-base">
                  <Link href="/docs">Read docs</Link>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden">
                <Image
                  src="/marketing/support-hero.svg"
                  alt="Support dashboard"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-white/90 backdrop-blur-sm rounded-lg p-3 border border-[#CBD5E1]">
                  <p className="text-xs text-[#64748B]">
                    Average response: <span className="font-medium text-[#0F172A]">same day for Pro</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Choose your path - 3 Big Tiles */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Choose your path
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Documentation */}
            <PanelMock className="flex flex-col items-center text-center hover:shadow-3xl transition-all hover:-translate-y-1">
              <div className="relative w-full aspect-[4/3] mb-6 rounded-lg overflow-hidden bg-[#F1F5F9]">
                <Image
                  src="/marketing/docs-setup.svg"
                  alt="Documentation"
                  fill
                  className="object-contain p-4"
                />
              </div>
              <BookOpen className="h-8 w-8 text-[#2563EB] mb-4" />
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">
                Documentation
              </h3>
              <p className="text-sm text-[#475569] mb-6 flex-1">
                Setup, integrations, and operational best practices.
              </p>
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/docs">Go to docs</Link>
              </Button>
            </PanelMock>

            {/* Talk to AI */}
            <PanelMock className="flex flex-col items-center text-center hover:shadow-3xl transition-all hover:-translate-y-1">
              <div className="relative w-full aspect-[4/3] mb-6 rounded-lg overflow-hidden bg-[#F1F5F9] flex items-center justify-center">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <Mic className="h-6 w-6 text-[#2563EB]" />
                    <span className="text-xs font-medium text-[#64748B]">Live demo</span>
                  </div>
                  <Waveform />
                </div>
              </div>
              <MessageSquare className="h-8 w-8 text-[#2563EB] mb-4" />
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">
                Talk to AI
              </h3>
              <p className="text-sm text-[#475569] mb-6 flex-1">
                Try our live agent demo with no signup required.
              </p>
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/">Try live demo</Link>
              </Button>
            </PanelMock>

            {/* Contact & Escalation */}
            <PanelMock className="flex flex-col items-center text-center hover:shadow-3xl transition-all hover:-translate-y-1">
              <div className="relative w-full aspect-[4/3] mb-6 rounded-lg overflow-hidden bg-[#F1F5F9]">
                <Image
                  src="/marketing/sla-support.svg"
                  alt="SLA Support"
                  fill
                  className="object-contain p-4"
                />
              </div>
              <Mail className="h-8 w-8 text-[#2563EB] mb-4" />
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">
                Contact & Escalation
              </h3>
              <p className="text-sm text-[#475569] mb-6 flex-1">
                Reach our team for demos, troubleshooting, and deployments.
              </p>
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/#contact">Open a request</Link>
              </Button>
            </PanelMock>
          </div>
        </Container>
      </Section>

      {/* Response targets - Visual SLA Card */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Response targets
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <SlaComparisonCard
              plans={[
                {
                  name: 'Starter',
                  level: 'Best effort',
                  description: 'Community support and email responses typically within 1–2 business days.',
                },
                {
                  name: 'Pro',
                  level: 'Priority handling',
                  description: 'Priority support with same-business-day response targets.',
                },
                {
                  name: 'Enterprise',
                  level: 'Contractual SLA',
                  description: 'Guaranteed response times and escalation paths defined in contract.',
                },
              ]}
              note="Exact SLAs depend on contract."
            />
          </div>
        </Container>
      </Section>

      {/* Common fixes - Visual Accordion */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Common fixes
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <VisualAccordion
              items={[
                {
                  icon: Mic,
                  title: 'Microphone permission',
                  answer: (
                    <div className="space-y-2">
                      <p>Ensure your browser allows microphone access. Check site settings and grant permission when prompted. For persistent issues, clear browser cache and retry.</p>
                    </div>
                  ),
                  visual: (
                    <PanelMock className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-full border-2 border-[#2563EB] flex items-center justify-center">
                          <Mic className="h-4 w-4 text-[#2563EB]" />
                        </div>
                        <span className="text-xs font-medium text-[#0F172A]">Mic enabled</span>
                      </div>
                      <div className="h-2 bg-[#10B981] rounded w-full" />
                    </PanelMock>
                  ),
                },
                {
                  icon: AlertCircle,
                  title: 'Agent not starting',
                  answer: (
                    <div className="space-y-2">
                      <p>Check agent configuration (system prompt, tools, boundaries). Verify tool credentials are valid and accessible. Review logs in dashboard for specific error messages.</p>
                    </div>
                  ),
                  visual: (
                    <PanelMock className="p-4">
                      <div className="space-y-2">
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#10B981]">✓</span>
                          <span className="text-[#475569]">Config valid</span>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#10B981]">✓</span>
                          <span className="text-[#475569]">Tools connected</span>
                        </div>
                        <div className="h-2 bg-[#2563EB] rounded w-3/4" />
                      </div>
                    </PanelMock>
                  ),
                },
                {
                  icon: Webhook,
                  title: 'Webhook verification',
                  answer: (
                    <div className="space-y-2">
                      <p>Copy your webhook secret from agent settings. Verify HMAC-SHA256 signature using the X-Signature header. Compare against computed hash of request body + secret.</p>
                    </div>
                  ),
                  visual: (
                    <PanelMock className="p-4">
                      <div className="font-mono text-xs space-y-1">
                        <div className="text-[#2563EB]">X-Signature:</div>
                        <div className="text-[#64748B] break-all">sha256=abc123...</div>
                      </div>
                    </PanelMock>
                  ),
                },
                {
                  icon: Gauge,
                  title: 'Latency',
                  answer: (
                    <div className="space-y-2">
                      <p>Check network latency to your tool/webhook endpoints. Review agent logs for slow tool responses. Consider tool caching or async webhooks for heavy operations.</p>
                    </div>
                  ),
                  visual: (
                    <PanelMock className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#475569]">Response time</span>
                          <span className="text-[#10B981] font-medium">~200ms</span>
                        </div>
                        <div className="h-2 bg-[#10B981] rounded w-4/5" />
                      </div>
                    </PanelMock>
                  ),
                },
                {
                  icon: CreditCard,
                  title: 'Billing & invoices',
                  answer: (
                    <div className="space-y-2">
                      <p>View billing history in workspace settings. Download invoices from billing page. For plan changes, contact support for prorated adjustments.</p>
                    </div>
                  ),
                  visual: (
                    <PanelMock className="p-4">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-[#0F172A]">Current plan</div>
                        <div className="text-sm font-bold text-[#2563EB]">Pro</div>
                        <div className="h-2 bg-[#CBD5E1] rounded w-full" />
                      </div>
                    </PanelMock>
                  ),
                },
              ]}
            />
          </div>
        </Container>
      </Section>

      {/* Status section - Visual */}
      <Section>
        <Container>
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
                  System status
                </h2>
                <div className="flex items-center gap-3 mb-4">
                  <StatusChip label="All systems operational" variant="success" pulse />
                </div>
                <p className="text-sm text-[#64748B]">
                  Status page coming soon.
                </p>
              </div>
              <div className="relative w-full aspect-[5/3] rounded-2xl overflow-hidden">
                <Image
                  src="/marketing/status-ops.svg"
                  alt="System status"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Bottom CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Need a deployment plan?
            </h2>
            <p className="text-sm text-[#475569] mb-8">
              Tell us your channels, tools, and volume. We'll propose a workflow.
            </p>
            <Button asChild size="lg" className="text-base">
              <Link href="/#contact">Request a demo</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
