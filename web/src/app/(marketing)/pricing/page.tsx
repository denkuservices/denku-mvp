'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Button } from '@/components/marketing/Button';
import { Check, ArrowRight, Zap, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import React from 'react';
import { pricingPlans } from '@/components/marketing/pricing-data';

const plans = pricingPlans.map(plan => ({
  name: plan.name,
  subtitle: plan.subtitle || plan.bestFor || '',
  price: plan.price || plan.monthlyPrice,
  priceUnit: plan.priceUnit || (plan.monthlyPrice !== 'Custom' ? '/ month' : ''),
  concurrencyLine: plan.concurrencyLine,
  bullets: plan.coreBullets || plan.bullets || plan.features,
  cta: plan.cta,
  highlight: plan.highlight,
}));

// Feature groups for comparison table
const featureGroups = [
  {
    category: 'CAPACITY',
    features: [
      { name: 'Phone numbers included', starter: '1', growth: '1', scale: '1' },
      { name: 'Concurrent calls', starter: '1', growth: '4', scale: '10' },
      { name: 'Personas', starter: 'Unlimited', growth: 'Unlimited', scale: 'Unlimited' },
      { name: 'Included minutes (capacity bonus)', starter: '400 / month', growth: '1,200 / month', scale: '3,600 / month' },
      { name: 'Overage rate', starter: '$0.22 / min', growth: '$0.18 / min', scale: 'From $0.13 / min' },
    ],
  },
  {
    category: 'FEATURES',
    features: [
      { name: 'Languages', starter: '20+', growth: '20+', scale: '20+' },
      { name: 'Ticket creation', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Appointment booking', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Advanced routing', starter: '—', growth: '✓', scale: '✓' },
      { name: 'Multilingual routing', starter: '—', growth: '✓', scale: '✓' },
      { name: 'CRM integrations', starter: '—', growth: '✓', scale: '✓' },
      { name: 'API access', starter: '—', growth: '—', scale: '✓' },
      { name: 'Unlimited knowledge base', starter: '—', growth: '—', scale: '✓' },
    ],
  },
  {
    category: 'ANALYTICS & OBSERVABILITY',
    features: [
      { name: 'Basic analytics', starter: '✓', growth: '—', scale: '—' },
      { name: 'Advanced analytics', starter: '—', growth: '✓', scale: '✓' },
      { name: 'Call transcripts', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Structured logs', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Alerts & webhooks', starter: '—', growth: '✓', scale: '✓' },
    ],
  },
  {
    category: 'SECURITY & COMPLIANCE',
    features: [
      { name: 'Tenant isolation', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Audit logs', starter: 'Basic', growth: 'Full', scale: 'Full + Immutable' },
      { name: 'HIPAA compliance', starter: '—', growth: '—', scale: '✓' },
      { name: 'Webhook signature verification', starter: '—', growth: '✓', scale: '✓' },
    ],
  },
  {
    category: 'SUPPORT',
    features: [
      { name: 'Community support', starter: '✓', growth: '✓', scale: '✓' },
      { name: 'Priority support', starter: '—', growth: '✓', scale: '✓' },
      { name: 'Account manager', starter: '—', growth: '—', scale: '✓' },
      { name: 'SLA', starter: '—', growth: '—', scale: '✓' },
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
            <div className="space-y-2">
              <p className="text-base font-semibold text-[#0F172A]">
                Concurrency + reliability. Unlimited personas.
              </p>
              <p className="text-sm text-[#475569]">
                Concurrent calls define capacity. Personas are unlimited and included.
              </p>
            </div>
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
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#0F172A]">{plan.price}</span>
                    {plan.priceUnit && (
                      <span className="text-sm text-[#64748B]">{plan.priceUnit}</span>
                    )}
                  </div>
                </div>

                {/* Concurrency line - prominent but secondary to price */}
                {plan.concurrencyLine && (
                  <p className="mb-4 text-base font-medium text-[#0F172A]">
                    {plan.concurrencyLine}
                  </p>
                )}

                {/* Bullets */}
                <ul className="flex-1 space-y-3 mb-6">
                  {plan.bullets.map((bullet, index) => {
                    // Handle minutes line with explanation
                    if (bullet.includes('included minutes')) {
                      const minutesMatch = bullet.match(/(\d+(?:,\d+)?)\s+included minutes/);
                      if (minutesMatch) {
                        const minutes = minutesMatch[1];
                        return (
                          <li key={bullet} className="space-y-1">
                            <div className="flex items-start gap-3">
                              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full mt-0.5">
                                <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-[#0F172A] leading-relaxed">{minutes} minutes included</span>
                                <span className="text-xs text-[#64748B]">Minutes are a usage allowance for smoother onboarding — overage is pay-as-you-go.</span>
                              </div>
                            </div>
                          </li>
                        );
                      }
                    }
                    
                    return (
                      <li key={bullet} className="flex items-start gap-3">
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full mt-0.5">
                          <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                        </div>
                        <span className="text-sm font-medium text-[#0F172A] leading-relaxed">
                          {bullet}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* CTA Button */}
                <Button
                  asChild
                  size="lg"
                  variant={plan.highlight ? 'default' : 'secondary'}
                  className="w-full"
                >
                  <Link href={plan.cta.href}>
                    {plan.cta.label}
                  </Link>
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
                              <p className="text-sm font-bold text-[#64748B] uppercase">GROWTH</p>
                              <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-xs font-bold text-white">
                                Most Popular
                              </span>
                            </div>
                          </th>
                          <th className="border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                            <p className="text-sm font-bold text-[#64748B] uppercase">SCALE</p>
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
                                  {renderCellValue(feature.growth)}
                                </td>
                                <td className="border-white/0 py-3 pr-4 text-center">
                                  {renderCellValue(feature.scale)}
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

          {/* Add-ons Section */}
          <div className="mt-12 rounded-2xl border border-[#CBD5E1] bg-white p-6 md:p-8 shadow-sm max-w-4xl mx-auto">
            <h3 className="text-xl font-bold text-[#0F172A] mb-4">Add-ons</h3>
            {/* TODO: Fetch addon prices from /api/billing/summary or a public pricing endpoint for server truth */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <div className="rounded-lg border border-[#CBD5E1] p-4">
                <div className="text-sm font-semibold text-[#0F172A] mb-1">Extra concurrent calls</div>
                <div className="text-lg font-bold text-[#0F172A] mb-2">+$99 / month per 1</div>
                <p className="text-xs text-[#64748B]">Adds 1 concurrent call to your plan</p>
              </div>
              <div className="rounded-lg border border-[#CBD5E1] p-4">
                <div className="text-sm font-semibold text-[#0F172A] mb-1">Extra phone number</div>
                <div className="text-lg font-bold text-[#0F172A] mb-2">+$10 / month per 1</div>
                <p className="text-xs text-[#64748B]">Additional phone number for your account</p>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
