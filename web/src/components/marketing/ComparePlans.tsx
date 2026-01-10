'use client';

import { useState } from 'react';
import React from 'react';
import { Check, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';

// Feature groups matching Horizon UI table structure
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
        <Minus className="h-5 w-5 text-[#CBD5E1]" />
      </div>
    );
  }
  return <p className="text-sm font-bold text-[#0F172A]">{value}</p>;
}

export function ComparePlans() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Section id="compare" className="scroll-mt-20">
      <Container>
        <div className="relative flex flex-col rounded-2xl border border-[#CBD5E1] bg-white shadow-sm w-full">
          {/* Header with toggle */}
          <div className="relative flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#CBD5E1]">
            <h2 className="text-xl font-semibold text-[#0F172A]">
              Compare Plans
            </h2>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#2563EB] hover:bg-[#F1F5F9] transition-colors"
            >
              <span>{isExpanded ? 'Hide' : 'Compare plans'}</span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Collapsible content */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-6 pb-6 overflow-x-scroll xl:overflow-x-hidden">
              <div className="mt-4 overflow-x-scroll xl:overflow-x-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="!border-px !border-[#CBD5E1]">
                      <th className="cursor-pointer border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-start">
                        <div className="items-center justify-between">
                          <p className="text-sm font-bold text-[#64748B] uppercase">FEATURE</p>
                        </div>
                      </th>
                      <th className="cursor-pointer border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                        <div className="items-center justify-between">
                          <p className="text-sm font-bold text-[#64748B] uppercase">STARTER</p>
                        </div>
                      </th>
                      <th className="cursor-pointer border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                        <div className="items-center justify-between">
                          <div className="flex items-center justify-center gap-2">
                            <p className="text-sm font-bold text-[#64748B] uppercase">PRO</p>
                            <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-xs font-bold text-white">
                              Most Popular
                            </span>
                          </div>
                        </div>
                      </th>
                      <th className="cursor-pointer border-b-[1px] border-[#CBD5E1] pt-4 pb-2 pr-4 text-center">
                        <div className="items-center justify-between">
                          <p className="text-sm font-bold text-[#64748B] uppercase">ENTERPRISE</p>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureGroups.map((group, groupIdx) => (
                      <React.Fragment key={group.category}>
                        <tr>
                          <td
                            colSpan={4}
                            className="min-w-[150px] border-white/0 py-2 pr-4 bg-[#F1F5F9]"
                          >
                            <p className="text-xs font-bold text-[#64748B] uppercase">
                              {group.category}
                            </p>
                          </td>
                        </tr>
                        {group.features.map((feature, featureIdx) => (
                          <tr key={feature.name}>
                            <td className="min-w-[150px] border-white/0 py-3 pr-4">
                              <p className="text-sm font-bold text-[#0F172A]">
                                {feature.name}
                              </p>
                            </td>
                            <td className="min-w-[150px] border-white/0 py-3 pr-4 text-center">
                              {renderCellValue(feature.starter)}
                            </td>
                            <td className="min-w-[150px] border-white/0 py-3 pr-4 text-center">
                              {renderCellValue(feature.pro)}
                            </td>
                            <td className="min-w-[150px] border-white/0 py-3 pr-4 text-center">
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
        </div>
      </Container>
    </Section>
  );
}
