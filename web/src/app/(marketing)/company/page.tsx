'use client';

import Link from 'next/link';
import Image from 'next/image';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { Button } from '@/components/marketing/Button';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { PanelMock } from '@/components/marketing/visual/PanelMock';
import { StatusChip } from '@/components/marketing/visual/StatusChip';
import { Shield, Settings, Eye, Lock, Users, Database, Zap } from 'lucide-react';

export default function CompanyPage() {
  return (
    <>
      {/* Hero - Split Layout */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-sm font-bold text-[#64748B] mb-4 uppercase tracking-wide">
                Company
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-[#0F172A] md:text-5xl lg:text-6xl mb-6">
                Built for production.
              </h1>
              <p className="text-lg text-[#475569] mb-8 leading-relaxed">
                Isolation, control, and observability for voice and chat agents.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="text-base">
                  <Link href="/">Talk to Denku AI</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="text-base">
                  <Link href="/security">View security</Link>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden">
                <Image
                  src="/marketing/company-hero.svg"
                  alt="Production infrastructure"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div className="absolute top-4 right-4">
                <StatusChip label="Live demo available" pulse />
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* What we build - 3 Visual Panels */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              What we build
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 overflow-x-auto md:overflow-visible pb-4 md:pb-0">
            {/* Isolation Panel */}
            <div className="min-w-[280px] md:min-w-0">
              <PanelMock>
                <div className="mb-4">
                  <Shield className="h-8 w-8 text-[#2563EB] mb-3" />
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    Isolation
                  </h3>
                </div>
                {/* Visual: Tenant boxes */}
                <div className="space-y-2">
                  <div className="p-3 border border-[#CBD5E1] rounded-lg bg-[#F1F5F9]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                      <span className="text-xs font-medium text-[#0F172A]">Workspace A</span>
                    </div>
                    <div className="h-2 bg-[#CBD5E1] rounded w-3/4" />
                  </div>
                  <div className="p-3 border border-[#CBD5E1] rounded-lg bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                      <span className="text-xs font-medium text-[#0F172A]">Workspace B</span>
                    </div>
                    <div className="h-2 bg-[#CBD5E1] rounded w-2/3" />
                  </div>
                  <div className="p-3 border-2 border-[#2563EB] rounded-lg bg-[#F1F5F9] relative">
                    <div className="absolute -top-2 -right-2 bg-[#2563EB] text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      Boundary
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                      <span className="text-xs font-medium text-[#0F172A]">Isolated</span>
                    </div>
                    <div className="h-2 bg-[#2563EB] rounded w-1/2" />
                  </div>
                </div>
                <p className="text-xs text-[#64748B] mt-4">
                  Multi-tenant architecture with strict data boundaries.
                </p>
              </PanelMock>
            </div>

            {/* Control Panel */}
            <div className="min-w-[280px] md:min-w-0">
              <PanelMock>
                <div className="mb-4">
                  <Settings className="h-8 w-8 text-[#2563EB] mb-3" />
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    Control
                  </h3>
                </div>
                {/* Visual: Policy toggles */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 border border-[#CBD5E1] rounded">
                    <span className="text-xs text-[#475569]">Tool Access</span>
                    <div className="w-10 h-5 bg-[#2563EB] rounded-full relative">
                      <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 border border-[#CBD5E1] rounded">
                    <span className="text-xs text-[#475569]">RBAC</span>
                    <div className="w-10 h-5 bg-[#2563EB] rounded-full relative">
                      <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 border border-[#CBD5E1] rounded bg-[#F1F5F9]">
                    <span className="text-xs text-[#64748B]">Webhook Verify</span>
                    <div className="w-10 h-5 bg-[#CBD5E1] rounded-full relative">
                      <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#64748B] mt-4">
                  Tools, policies, and operational guardrails.
                </p>
              </PanelMock>
            </div>

            {/* Observability Panel */}
            <div className="min-w-[280px] md:min-w-0">
              <PanelMock>
                <div className="mb-4">
                  <Eye className="h-8 w-8 text-[#2563EB] mb-3" />
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    Observability
                  </h3>
                </div>
                {/* Visual: Logs + mini chart */}
                <div className="space-y-2 mb-3">
                  <div className="text-xs font-mono text-[#475569] space-y-1">
                    <div className="flex gap-2">
                      <span className="text-[#2563EB]">[INFO]</span>
                      <span>Agent started</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[#10B981]">[OK]</span>
                      <span>Tool connected</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[#64748B]">[LOG]</span>
                      <span>Call received</span>
                    </div>
                  </div>
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-1 h-12 border-t border-[#CBD5E1] pt-2">
                  {[30, 45, 35, 60, 40, 55].map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-[#2563EB] rounded-t"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <p className="text-xs text-[#64748B] mt-4">
                  Logs, transcripts, and monitoring.
                </p>
              </PanelMock>
            </div>
          </div>
        </Container>
      </Section>

      {/* How teams adopt - Step visuals */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              How teams adopt
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            {[
              { num: '1', title: 'Provision', desc: 'Create workspace and configure isolation.' },
              { num: '2', title: 'Configure', desc: 'Set up agents, tools, and policies.' },
              { num: '3', title: 'Deploy', desc: 'Go live with voice or chat channels.' },
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#2563EB] bg-white text-2xl font-bold text-[#2563EB] shadow-shadow-100">
                    {step.num}
                  </div>
                </div>
                <PanelMock className="min-h-[120px]">
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    {step.title}
                  </h3>
                  <div className="space-y-2">
                    <div className="h-2 bg-[#CBD5E1] rounded w-full" />
                    <div className="h-2 bg-[#CBD5E1] rounded w-3/4 mx-auto" />
                    <div className="h-2 bg-[#CBD5E1] rounded w-1/2 mx-auto" />
                  </div>
                </PanelMock>
                <p className="mt-4 text-sm text-[#475569]">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Planned next - Roadmap Timeline */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Planned next
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <PanelMock>
              <div className="relative py-8">
                {/* Timeline line - desktop */}
                <div className="hidden md:block absolute left-16 right-16 top-1/2 h-0.5 bg-[#CBD5E1]" />
                
                {/* Timeline items */}
                <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
                  {[
                    { icon: Lock, label: 'SSO/SAML' },
                    { icon: Users, label: 'Advanced RBAC' },
                    { icon: Database, label: 'Retention controls' },
                    { icon: Zap, label: 'Connector marketplace' },
                  ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={index}
                        className="relative flex flex-col items-center gap-3 group hover:scale-105 transition-transform z-10 bg-white"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#CBD5E1] bg-[#F1F5F9] group-hover:border-[#2563EB] transition-colors">
                          <Icon className="h-6 w-6 text-[#2563EB]" />
                        </div>
                        <span className="text-xs font-medium text-[#64748B] group-hover:text-[#0F172A] transition-colors text-center">
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PanelMock>
          </div>
        </Container>
      </Section>

      {/* Bottom CTA - Visual */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
                  See security details.
                </h2>
                <p className="text-sm text-[#475569] mb-6">
                  Request our security brief to review controls, compliance, and deployment practices.
                </p>
                <Button asChild size="lg" className="text-base">
                  <Link href="/security#request">Request security brief</Link>
                </Button>
              </div>
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden">
                <Image
                  src="/marketing/security-brief.svg"
                  alt="Security documentation"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
