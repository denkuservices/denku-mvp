'use client';

import { useState } from 'react';
import { Container } from './Container';
import { Section } from './Section';
import { Eye, Settings, Plug } from 'lucide-react';

const tabs = [
  { id: 'observe', label: 'Observe', icon: Eye },
  { id: 'control', label: 'Control', icon: Settings },
  { id: 'integrate', label: 'Integrate', icon: Plug },
];

const BAR_HEIGHTS = [72, 58, 91, 64, 83, 69, 88, 55, 76, 62, 95, 67]; // percentages

const tabContent = {
  observe: {
    title: 'Full Observability',
    description: 'Monitor every interaction with structured logs, real-time metrics, and performance dashboards.',
    metrics: [
      { label: 'Active Agents', value: '12' },
      { label: 'Avg Response Time', value: '1.2s' },
      { label: 'Success Rate', value: '98.5%' },
    ],
  },
  control: {
    title: 'Operational Control',
    description: 'Set boundaries, manage access, and enforce policies across all agents and tools.',
    metrics: [
      { label: 'Workspaces', value: '8' },
      { label: 'Active Tools', value: '24' },
      { label: 'API Calls Today', value: '12.4K' },
    ],
  },
  integrate: {
    title: 'Seamless Integration',
    description: 'Connect with your existing stack: CRM, calendars, helpdesk, and custom webhooks.',
    metrics: [
      { label: 'Connected Tools', value: '15' },
      { label: 'Webhooks', value: '8' },
      { label: 'Sync Status', value: 'Active' },
    ],
  },
};

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState('observe');

  return (
    <Section id="product" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-navy-700 md:text-4xl">
            See SovereignAI in Action
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-600">
            Explore how teams use our platform to build, deploy, and manage production-grade AI agents.
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold transition-all',
                    activeTab === tab.id
                      ? 'bg-white text-brand-500 shadow-shadow-100'
                      : 'text-gray-600 hover:text-navy-700',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          <div className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-3xl p-8">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-navy-700">
                {tabContent[activeTab as keyof typeof tabContent].title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {tabContent[activeTab as keyof typeof tabContent].description}
              </p>
            </div>

            {/* Metrics Row */}
            <div className="grid gap-4 md:grid-cols-3">
              {tabContent[activeTab as keyof typeof tabContent].metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="text-xs font-bold text-gray-600">{metric.label}</div>
                  <div className="mt-1 text-2xl font-bold text-navy-700">{metric.value}</div>
                </div>
              ))}
            </div>

            {/* Chart Placeholder */}
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="text-xs font-bold text-gray-600 mb-4">Performance Overview</div>
              <div className="h-48 flex items-end justify-between gap-2">
                {BAR_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-brand-500 transition-[height] duration-700 ease-out"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* List Placeholder */}
            <div className="mt-6 space-y-3">
              <div className="text-xs font-bold text-gray-600 mb-3">Recent Activity</div>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-brand-500" />
                    <div>
                      <div className="text-sm font-bold text-navy-700">Agent interaction #{i}</div>
                      <div className="text-xs text-gray-600">2 minutes ago</div>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-green-500">Success</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
