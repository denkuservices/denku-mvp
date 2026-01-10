'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Button } from '@/components/marketing/Button';
import { Check, ArrowRight, Zap, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import React from 'react';

const plans = [
  {
    name: 'Starter',
    subtitle: 'For solo builders & small teams',
    price: '$49',
    priceUnit: '/ month',
    bullets: ['1 voice agent', 'Core observability', 'Standard integrations'],
    cta: { label: 'Get started', href: '/signup' },
  },
  {
    name: 'Pro',
    subtitle: 'For growing products',
    price: '$99',
    priceUnit: '/ month',
    bullets: ['Up to 10 voice agents', 'Advanced analytics', 'Custom tools & webhooks'],
    cta: { label: 'Get started', href: '/signup' },
    highlight: true,
  },
  {
    name: 'Enterprise',
    subtitle: 'For scale & compliance',
    price: 'Custom',
    priceUnit: '',
    bullets: ['Unlimited agents', 'Custom isolation', 'Security & SLA'],
    cta: { label: 'Talk to sales', href: '/#contact' },
  },
];

// Feature groups for comparison table
const featureGroups = [
  {
    category: 'CORE',
    features: [
      { name: 'Agents included', starter: '1', pro: 'Up to 10', enterprise: 'Unlimited' },
      { name: 'Workspaces / tenants', starter: '1', pro: 'Up to 5', enterprise: 'Unlimited' },
      { name: 'Channels (Voice, Chat)', starter: '1 channel', pro: 'Both', enterprise: 'Both' },
      { name: 'Team seats', starter: '3', pro: '10', enterprise: 'Unlimited' },
    ],
  },
  {
    category: 'OBSERVABILITY',
    features: [
      { name: 'Live dashboards', starter: 'Basic', pro: 'Advanced', enterprise: 'Custom' },
      { name: 'Call / chat transcripts', starter: '✓', pro: '✓', enterprise: '✓' },
      { name: 'Structured logs', starter: '✓', pro: '✓', enterprise: '✓' },
      { name: 'Alerts & webhooks', starter: '—', pro: '✓', enterprise: '✓' },
      { name: 'Data retention', starter: '30 days', pro: '90 days', enterprise: 'Custom' },
    ],
  },
  {
    category: 'SECURITY',
    features: [
      { name: 'Tenant isolation', starter: '✓', pro: '✓', enterprise: '✓' },
      { name: 'Role-based access (RBAC)', starter: 'Basic', pro: 'Advanced', enterprise: 'Custom' },
      { name: 'Audit logs', starter: 'Basic', pro: 'Full', enterprise: 'Full + Immutable' },
      { name: 'Webhook signature verification', starter: '—', pro: '✓', enterprise: '✓' },
      { name: 'SSO / SAML', starter: '—', pro: '—', enterprise: 'Roadmap' },
    ],
  },
  {
    category: 'SUPPORT',
    features: [
      { name: 'Community support', starter: '✓', pro: '✓', enterprise: '✓' },
      { name: 'Priority support', starter: '—', pro: '✓', enterprise: '✓' },
      { name: 'Dedicated support / SLA', starter: '—', pro: '—', enterprise: '✓' },
    ],
  },
];

function renderCellValue(value: string) {
  if (value === '✓') {
    return (
      <div className="flex items-center justify-center">
        <Check className="h-5 w-5 text-[#2563EB]" />
      </div>
    );
  }
  if (value === '—') {
    return (
      <div className="flex items-center justify-center">
        <span className="text-[#CBD5E1] text-lg">—</span>
      </div>
    );
  }
  return <p className="text-sm font-bold text-[#0F172A]">{value}</p>;
}

export default function PricingPage() {
  const [compareExpanded, setCompareExpanded] = useState(false);

  return (
    <>
      {/* Hero Section */}
      <Section className="py-12 md:py-16">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-[#0F172A] md:text-4xl lg:text-5xl mb-4">
              Simple, transparent pricing.
            </h1>
            <p className="text-base text-[#475569] md:text-lg">
              Start small. Scale when you need to.
            </p>
          </div>
        </Container>
      </Section>

      {/* Plan Cards */}
      <Section className="py-6 md:py-8">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all ${
                  plan.highlight
                    ? 'border-[#2563EB] shadow-md'
                    : 'border-[#CBD5E1] hover:scale-[1.01] hover:shadow-md'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[#2563EB] px-2.5 py-0.5 text-xs font-medium text-white">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan Name & Subtitle */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-[#0F172A] mb-1">{plan.name}</h3>
                  <p className="text-sm text-[#64748B]">{plan.subtitle}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#0F172A]">{plan.price}</span>
                    {plan.priceUnit && (
                      <span className="text-sm text-[#64748B]">{plan.priceUnit}</span>
                    )}
                  </div>
                </div>

                {/* Bullets */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.bullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full mt-0.5">
                        <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                      </div>
                      <span className="text-sm font-medium text-[#0F172A] leading-relaxed">
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  asChild
                  size="lg"
                  variant={plan.highlight ? 'default' : 'secondary'}
                  className="w-full"
                >
                  <Link href={plan.cta.href}>{plan.cta.label}</Link>
                </Button>
              </div>
            ))}
          </div>

          {/* Micro Benefits - Inline directly under cards */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm text-[#64748B]">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[#2563EB]" />
              <span>No setup fees</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#2563EB]" />
              <span>Go live in minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#2563EB]" />
              <span>Secure by default</span>
            </div>
          </div>

          {/* Inline Compare Plans Toggle */}
          <div className="mt-8 text-center">
            <button
              onClick={() => setCompareExpanded(!compareExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors mx-auto"
            >
              <span>View full feature comparison</span>
              {compareExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </Container>
      </Section>

      {/* Inline Compare Plans Accordion */}
      <Section className="py-0">
        <Container>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              compareExpanded ? 'max-h-[2000px] opacity-100 pb-6' : 'max-h-0 opacity-0'
            }`}
          >
            {compareExpanded && (
              <div className="rounded-2xl border border-[#CBD5E1] bg-white shadow-sm overflow-hidden mt-4">
                <div className="overflow-x-auto">
                  <div className="px-6 pb-6 min-w-[600px] md:min-w-0">
                    <table className="w-full">
                      <thead>
                        <tr className="!border-px !border-[#CBD5E1]">
                          <th className="border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-start">
                            <p className="text-sm font-bold text-[#64748B] uppercase">FEATURE</p>
                          </th>
                          <th className="border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                            <p className="text-sm font-bold text-[#64748B] uppercase">STARTER</p>
                          </th>
                          <th className="border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <p className="text-sm font-bold text-[#64748B] uppercase">PRO</p>
                              <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-xs font-bold text-white">
                                Most Popular
                              </span>
                            </div>
                          </th>
                          <th className="border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                            <p className="text-sm font-bold text-[#64748B] uppercase">ENTERPRISE</p>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {featureGroups.map((group) => (
                          <React.Fragment key={group.category}>
                            <tr>
                              <td
                                colSpan={4}
                                className="border-white/0 py-2 pr-4 bg-[#F1F5F9]"
                              >
                                <p className="text-xs font-bold text-[#64748B] uppercase">
                                  {group.category}
                                </p>
                              </td>
                            </tr>
                            {group.features.map((feature) => (
                              <tr key={feature.name}>
                                <td className="border-white/0 py-3 pr-4">
                                  <p className="text-sm font-bold text-[#0F172A]">{feature.name}</p>
                                </td>
                                <td className="border-white/0 py-3 pr-4 text-center">
                                  {renderCellValue(feature.starter)}
                                </td>
                                <td className="border-white/0 py-3 pr-4 text-center">
                                  {renderCellValue(feature.pro)}
                                </td>
                                <td className="border-white/0 py-3 pr-4 text-center">
                                  {renderCellValue(feature.enterprise)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Container>
      </Section>
    </>
  );
}
