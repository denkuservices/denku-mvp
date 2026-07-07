'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { Check, Zap, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import React from 'react';
import { pricingPlans } from '@/components/marketing/pricing-data';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const plans = pricingPlans.map((plan) => ({
  name: plan.name,
  subtitle: plan.subtitle || plan.bestFor || '',
  price: plan.price || plan.monthlyPrice,
  priceUnit: plan.priceUnit || (plan.monthlyPrice !== 'Custom' ? '/ month' : ''),
  concurrencyLine: plan.concurrencyLine,
  bullets: plan.coreBullets || plan.bullets || plan.features,
  cta: plan.cta,
  highlight: plan.highlight,
}));

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
  if (value === '✓') return <div className="flex justify-center"><Check className="h-4 w-4 text-[#1B6E6E]" /></div>;
  if (value === '—') return <div className="flex justify-center"><span className="text-lg text-[#0A1A2F]/20">—</span></div>;
  return <p className="text-sm font-semibold text-[#0A1A2F]">{value}</p>;
}

export default function PricingPage() {
  const [compareExpanded, setCompareExpanded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);
      } catch {
        setIsLoggedIn(false);
      }
    }
    checkAuth();
  }, []);

  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-20">
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Pricing</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
              Simple, transparent <em className="font-medium italic text-[#1B6E6E]">pricing</em>.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#2C3E54]">
              Concurrency + reliability. Unlimited personas. Concurrent calls define capacity.
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* Cards */}
      <Section className="py-4 md:py-6">
        <Container>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {plans.map((plan, idx) => (
              <Reveal
                key={plan.name}
                delay={(idx % 3) as 0 | 1 | 2}
                className={`relative flex flex-col rounded-[18px] border p-8 transition-all duration-300 ${
                  plan.highlight
                    ? 'border-[#0A1A2F] bg-[#0A1A2F] brand-shadow-lg'
                    : 'border-[#0A1A2F]/10 bg-[#FBFAF8] hover:-translate-y-1 hover:brand-shadow-md'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[#1B6E6E] px-4 py-1 font-brand-mono text-[11px] tracking-wide text-white">MOST POPULAR</span>
                  </div>
                )}
                <div className={`font-display text-[22px] font-medium ${plan.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'}`}>{plan.name}</div>
                <p className={`mt-1 text-sm ${plan.highlight ? 'text-[#F7F5F1]/60' : 'text-[#6B7888]'}`}>{plan.subtitle}</p>

                {plan.concurrencyLine && (
                  <div className={`mt-5 font-display text-[22px] font-medium ${plan.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'}`}>{plan.concurrencyLine}</div>
                )}

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={`font-display text-[40px] font-medium leading-none ${plan.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'}`}>{plan.price}</span>
                  {plan.priceUnit && <span className={`text-sm ${plan.highlight ? 'text-[#F7F5F1]/50' : 'text-[#6B7888]'}`}>{plan.priceUnit}</span>}
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.bullets.map((bullet) => {
                    const label = bullet.replace(/\s*\(capacity bonus\)/, ' (capacity bonus)');
                    return (
                      <li key={bullet} className="flex items-start gap-3">
                        <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.highlight ? 'text-[#3FA3A3]' : 'text-[#1B6E6E]'}`} />
                        <span className={`text-[14px] ${plan.highlight ? 'text-[#F7F5F1]/85' : 'text-[#2C3E54]'}`}>{label}</span>
                      </li>
                    );
                  })}
                </ul>

                <Link
                  href={isLoggedIn ? '/dashboard/settings/workspace/billing' : plan.cta.href}
                  className={`mt-8 flex h-11 w-full items-center justify-center rounded-[10px] text-sm font-medium transition-all duration-300 ${
                    plan.highlight
                      ? 'bg-[#1B6E6E] text-white hover:bg-[#228585]'
                      : 'border border-[#0A1A2F]/10 text-[#0A1A2F] hover:border-[#1B6E6E] hover:text-[#1B6E6E]'
                  }`}
                >
                  {isLoggedIn ? 'Choose plan' : plan.cta.label}
                </Link>
              </Reveal>
            ))}
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-[#6B7888] md:gap-8">
            <div className="flex items-center gap-2"><Check className="h-4 w-4 text-[#1B6E6E]" /> No setup fees</div>
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-[#1B6E6E]" /> Go live in minutes</div>
            <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-[#1B6E6E]" /> Secure by default</div>
          </div>

          <div id="compare" className="mt-8 scroll-mt-24 text-center">
            <button
              onClick={() => setCompareExpanded(!compareExpanded)}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#1B6E6E] transition-colors hover:text-[#134F4F]"
            >
              <span>View full feature comparison</span>
              {compareExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </Container>
      </Section>

      {/* Comparison table */}
      <Section className="py-0">
        <Container>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${compareExpanded ? 'max-h-[2400px] pb-8 opacity-100' : 'max-h-0 opacity-0'}`}>
            {compareExpanded && (
              <div className="mt-4 overflow-hidden rounded-[18px] border border-[#0A1A2F]/10 bg-[#FBFAF8]">
                <div className="overflow-x-auto">
                  <div className="min-w-[560px] px-6 pb-6 md:min-w-0">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="border-b border-[#0A1A2F]/10 pb-3 pr-4 pt-6 text-left">
                            <p className="font-brand-mono text-xs tracking-wider text-[#6B7888]">FEATURE</p>
                          </th>
                          {['STARTER', 'GROWTH', 'SCALE'].map((col) => (
                            <th key={col} className="border-b border-[#0A1A2F]/10 pb-3 pr-4 pt-6 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <p className="font-brand-mono text-xs tracking-wider text-[#6B7888]">{col}</p>
                                {col === 'GROWTH' && <span className="rounded-full bg-[#E3EEED] px-2 py-0.5 text-xs font-bold text-[#134F4F]">Popular</span>}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {featureGroups.map((group) => (
                          <React.Fragment key={group.category}>
                            <tr>
                              <td colSpan={4} className="pb-2 pr-4 pt-5">
                                <p className="font-brand-mono text-xs tracking-wider text-[#1B6E6E]">{group.category}</p>
                              </td>
                            </tr>
                            {group.features.map((feature) => (
                              <tr key={feature.name} className="border-t border-[#0A1A2F]/[0.06]">
                                <td className="py-3 pr-4"><p className="text-sm font-medium text-[#2C3E54]">{feature.name}</p></td>
                                <td className="py-3 pr-4 text-center">{renderCellValue(feature.starter)}</td>
                                <td className="py-3 pr-4 text-center">{renderCellValue(feature.growth)}</td>
                                <td className="py-3 pr-4 text-center">{renderCellValue(feature.scale)}</td>
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

          {/* Add-ons */}
          <div className="mx-auto mb-16 mt-12 max-w-4xl rounded-[18px] border border-[#0A1A2F]/10 bg-[#FBFAF8] p-6 md:p-8">
            <div className="mb-6 text-center">
              <h3 className="font-display text-[22px] font-medium text-[#0A1A2F]">Add-ons</h3>
              <p className="mt-1 text-sm text-[#6B7888]">Optional capacity extensions for all plans</p>
            </div>
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { title: 'Extra concurrent call', price: '+$99 / month per 1', desc: 'Add 1 concurrent call to your plan' },
                { title: 'Extra phone number', price: '+$10 / month per 1', desc: 'Add 1 phone number to your account' },
              ].map((addon) => (
                <div key={addon.title} className="rounded-[12px] border border-[#0A1A2F]/[0.08] bg-[#F7F5F1] p-5">
                  <div className="mb-1 text-sm font-semibold text-[#0A1A2F]">{addon.title}</div>
                  <div className="mb-2 font-display text-[20px] font-medium text-[#0A1A2F]">{addon.price}</div>
                  <p className="text-xs text-[#6B7888]">{addon.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
