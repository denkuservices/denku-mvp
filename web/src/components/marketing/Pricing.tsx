'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';
import { Check } from 'lucide-react';
import { pricingPlans } from './pricing-data';

const plans = pricingPlans;


export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <Section id="pricing" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[#0F172A] md:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <div className="mx-auto mt-4 max-w-2xl space-y-2">
            <p className="text-base font-semibold text-[#0F172A]">
              Unlimited personas. Limited concurrent calls.
            </p>
            <p className="text-sm text-[#475569]">
              Personas define behavior. Concurrency defines capacity.
            </p>
          </div>
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
                  {isAnnual && p.annualPrice ? p.annualPrice : p.monthlyPrice}
                </span>
                {p.monthlyPrice !== 'Custom' && (
                  <span className="ml-2 text-sm text-[#475569]">/month</span>
                )}
              </div>

              {/* Concurrency line - prominent but secondary to price */}
              {p.concurrencyLine && (
                <p className="mt-2 text-base font-medium text-[#0F172A]">
                  {p.concurrencyLine}
                </p>
              )}

              <p className="mt-4 text-sm text-[#475569]">{p.subtitle}</p>

              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {(p.coreBullets || p.features).map((f, index, array) => {
                  // Handle two-line treatment for minutes + capacity bonus
                  const minutesMatch = f.match(/(\d+(?:,\d+)?)\s+minutes included/);
                  const isCapacityBonus = f === 'Capacity bonus';
                  const nextIsCapacityBonus = array[index + 1] === 'Capacity bonus';
                  
                  if (minutesMatch && nextIsCapacityBonus) {
                    const minutes = minutesMatch[1];
                    return (
                      <li key={`${f}-${index}`} className="space-y-1">
                        <div className="flex items-start gap-3">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full mt-0.5">
                            <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-[#0F172A]">{minutes} minutes included</span>
                            <span className="text-xs text-[#64748B]">Capacity bonus</span>
                          </div>
                        </div>
                      </li>
                    );
                  }
                  
                  // Skip capacity bonus if it was already rendered with minutes
                  if (isCapacityBonus && index > 0 && array[index - 1].includes('minutes included')) {
                    return null;
                  }
                  
                  return (
                    <li key={f} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full">
                        <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                      </div>
                      <span className="font-medium text-[#0F172A]">{f}</span>
                    </li>
                  );
                }).filter(Boolean)}
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

        {/* Add-ons Footnote */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#64748B] max-w-2xl mx-auto">
            <strong className="text-[#0F172A]">Add-ons:</strong> Additional phone numbers: $10 / number / month. Sales Agent: $199 / month. CEO / Ops Agent: $299 / month. Add-ons share the same concurrency pool and do not increase capacity.
          </p>
        </div>

        {/* Subtle explanatory text below cards */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[#64748B]">
            Phone numbers create entry points. Concurrent calls define capacity.
          </p>
        </div>
      </Container>
    </Section>
  );
}
