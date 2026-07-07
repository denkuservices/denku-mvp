'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { pricingPlans } from './pricing-data';

const plans = pricingPlans;

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <Section id="pricing" className="scroll-mt-20">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="brand-eyebrow centered mb-5 justify-center">Pricing</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
            Simple, transparent <em className="font-medium italic text-[#1B6E6E]">pricing</em>.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#2C3E54]">
            Unlimited personas. Concurrency defines capacity. No setup fees, ever.
          </p>
        </Reveal>

        {/* Toggle */}
        <div className="mt-9 flex justify-center">
          <div className="inline-flex rounded-full border border-[#0A1A2F]/10 bg-[#FBFAF8] p-1">
            <button
              onClick={() => setIsAnnual(false)}
              className={[
                'rounded-full px-6 py-2 text-sm font-medium transition-all',
                !isAnnual ? 'bg-[#0A1A2F] text-[#F7F5F1]' : 'text-[#2C3E54] hover:text-[#0A1A2F]',
              ].join(' ')}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={[
                'rounded-full px-6 py-2 text-sm font-medium transition-all',
                isAnnual ? 'bg-[#0A1A2F] text-[#F7F5F1]' : 'text-[#2C3E54] hover:text-[#0A1A2F]',
              ].join(' ')}
            >
              Annual <span className="ml-1.5 text-xs text-[#1B6E6E]">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p, idx) => (
            <Reveal
              key={p.name}
              delay={(idx % 3) as 0 | 1 | 2}
              className={[
                'relative flex flex-col rounded-[18px] border p-8 transition-all duration-300',
                p.highlight
                  ? 'border-[#0A1A2F] bg-[#0A1A2F] brand-shadow-lg'
                  : 'border-[#0A1A2F]/10 bg-[#FBFAF8] hover:-translate-y-1 hover:brand-shadow-md',
              ].join(' ')}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#1B6E6E] px-4 py-1 font-brand-mono text-[11px] tracking-wide text-white">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className={['font-display text-[22px] font-medium', p.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'].join(' ')}>
                {p.name}
              </div>
              <div className={['mt-1 text-sm', p.highlight ? 'text-[#F7F5F1]/60' : 'text-[#6B7888]'].join(' ')}>
                {p.subtitle}
              </div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className={['font-display text-[40px] font-medium leading-none', p.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'].join(' ')}>
                  {isAnnual && p.annualPrice ? p.annualPrice : p.monthlyPrice}
                </span>
                {p.monthlyPrice !== 'Custom' && (
                  <span className={['text-sm', p.highlight ? 'text-[#F7F5F1]/50' : 'text-[#6B7888]'].join(' ')}>/month</span>
                )}
              </div>

              {p.concurrencyLine && (
                <div className={['mt-3 text-[15px] font-medium', p.highlight ? 'text-[#F7F5F1]/90' : 'text-[#2C3E54]'].join(' ')}>
                  {p.concurrencyLine}
                </div>
              )}

              <ul className="mt-6 flex-1 space-y-3">
                {(p.coreBullets || p.features).map((f, index, array) => {
                  const minutesMatch = f.match(/(\d+(?:,\d+)?)\s+minutes included/);
                  const nextIsCapacityBonus = array[index + 1] === 'Capacity bonus';
                  if (f === 'Capacity bonus' && index > 0 && array[index - 1].includes('minutes included')) return null;
                  const label = minutesMatch && nextIsCapacityBonus ? `${minutesMatch[1]} minutes included` : f;
                  return (
                    <li key={`${f}-${index}`} className="flex items-start gap-3">
                      <Check className={['mt-0.5 h-3.5 w-3.5 shrink-0', p.highlight ? 'text-[#3FA3A3]' : 'text-[#1B6E6E]'].join(' ')} />
                      <span className={['text-[14px]', p.highlight ? 'text-[#F7F5F1]/85' : 'text-[#2C3E54]'].join(' ')}>{label}</span>
                    </li>
                  );
                }).filter(Boolean)}
              </ul>

              <Link
                href={p.cta.href}
                className={[
                  'mt-8 flex h-11 w-full items-center justify-center rounded-[10px] text-sm font-medium transition-all duration-300',
                  p.highlight
                    ? 'bg-[#1B6E6E] text-white hover:bg-[#228585]'
                    : 'border border-[#0A1A2F]/10 bg-transparent text-[#0A1A2F] hover:border-[#1B6E6E] hover:text-[#1B6E6E]',
                ].join(' ')}
              >
                {p.cta.label}
              </Link>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/pricing#compare" className="text-sm font-medium text-[#1B6E6E] transition-colors hover:text-[#134F4F]">
            Compare all plans →
          </Link>
        </div>
      </Container>
    </Section>
  );
}
