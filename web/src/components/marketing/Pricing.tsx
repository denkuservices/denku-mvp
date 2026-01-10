'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';
import { Check } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    monthlyPrice: '$49',
    annualPrice: '$39',
    bestFor: 'Small teams getting started',
    features: ['1 Agent', 'Basic Analytics', 'Standard Integrations', 'Email Support', 'Community Access'],
    cta: { label: 'Choose Plan', href: '/pricing' },
  },
  {
    name: 'Pro',
    monthlyPrice: '$99',
    annualPrice: '$79',
    bestFor: 'Growing teams',
    highlight: true,
    features: [
      'Up to 10 Agents',
      'Advanced Analytics',
      'Custom Tools & Webhooks',
      'Priority Support',
      'API Access',
      'Custom Integrations',
    ],
    cta: { label: 'Choose Plan', href: '/pricing' },
  },
  {
    name: 'Enterprise',
    monthlyPrice: 'Custom',
    annualPrice: 'Custom',
    bestFor: 'Large organizations',
    features: [
      'Unlimited Agents',
      'Custom Isolation Architecture',
      'Security Reviews & SLA',
      'Dedicated Support',
      'SSO/SAML',
      'Custom Contracts',
    ],
    cta: { label: 'Contact Sales', href: '#contact' },
  },
];


export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <Section id="pricing" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[#0F172A] md:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
            Find the right plan for your team. Scale up as you grow.
          </p>
        </div>

        {/* Toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setIsAnnual(false)}
              className={[
                'rounded-lg px-6 py-2 text-sm font-bold transition-all',
                !isAnnual
                  ? 'bg-white text-[#2563EB] shadow-shadow-100'
                  : 'text-[#475569] hover:text-[#0F172A]',
              ].join(' ')}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={[
                'rounded-lg px-6 py-2 text-sm font-bold transition-all',
                isAnnual
                  ? 'bg-white text-[#2563EB] shadow-shadow-100'
                  : 'text-[#475569] hover:text-[#0F172A]',
              ].join(' ')}
            >
              Annual
              <span className="ml-2 text-xs text-[#64748B]">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={[
                'group relative flex flex-col rounded-[20px] bg-white bg-clip-border p-8 transition-all border',
                p.highlight
                  ? 'shadow-3xl border-[#2563EB]'
                  : 'shadow-shadow-100 border-[#CBD5E1] hover:shadow-3xl hover:-translate-y-1',
              ].join(' ')}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#2563EB] px-4 py-1 text-xs font-bold text-white">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold text-[#0F172A]">{p.name}</h3>
              </div>

              <div className="mt-4">
                <span className="text-4xl font-bold text-[#0F172A]">
                  {isAnnual ? p.annualPrice : p.monthlyPrice}
                </span>
                {p.monthlyPrice !== 'Custom' && (
                  <span className="ml-2 text-sm text-[#475569]">/month</span>
                )}
              </div>

              <p className="mt-3 text-sm text-[#475569]">Best for: {p.bestFor}</p>

              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full">
                      <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                    </div>
                    <span className="font-medium text-[#0F172A]">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                variant={p.highlight ? 'default' : 'secondary'}
                className="mt-8 w-full"
              >
                <Link href={p.cta.href}>{p.cta.label}</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Compare Plans Link */}
        <div className="mt-12 text-center">
          <Button asChild variant="ghost" size="lg">
            <Link href="/pricing#compare">Compare plans</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
