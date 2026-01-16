export interface PricingPlan {
  name: string;
  monthlyPrice: string;
  annualPrice?: string;
  price?: string; // For simple price display
  priceUnit?: string; // For "/ month" suffix
  cadence?: string; // For "/mo" suffix
  note?: string; // Additional note
  subtitle?: string; // For "For solo builders & small teams"
  bestFor?: string;
  desc?: string;
  highlight?: boolean;
  concurrencyLine?: string; // Human-readable capacity line
  features: string[];
  bullets?: string[]; // Alternative to features for some components
  coreBullets?: string[]; // Core capacity-defining items only
  cta: {
    label: string;
    href: string;
  };
}

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Starter',
    monthlyPrice: '$149',
    price: '$149',
    priceUnit: '/ month',
    cadence: '/mo',
    subtitle: 'For single-location or small teams',
    bestFor: 'For single-location or small teams',
    desc: 'For single-location or small teams',
    concurrencyLine: '1 concurrent call',
    coreBullets: [
      '1 concurrent call',
      '400 minutes (capacity bonus)',
      '$0.22/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    features: [
      '1 concurrent call',
      '400 minutes (capacity bonus)',
      '$0.22/min overage',
      '1 phone included',
      'Unlimited personas',
      '20+ languages',
      'Ticket + appointment creation',
      'Basic analytics',
    ],
    bullets: [
      '1 concurrent call',
      '400 minutes (capacity bonus)',
      '$0.22/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    cta: { label: 'Get started', href: '/signup' },
  },
  {
    name: 'Growth',
    monthlyPrice: '$399',
    price: '$399',
    priceUnit: '/ month',
    cadence: '/mo',
    subtitle: 'Designed for growing teams with real call volume',
    bestFor: 'Designed for growing teams with real call volume',
    desc: 'Designed for growing teams with real call volume',
    highlight: true,
    concurrencyLine: '4 concurrent calls',
    coreBullets: [
      '4 concurrent calls',
      '1,200 minutes (capacity bonus)',
      '$0.18/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    features: [
      '4 concurrent calls',
      '1,200 minutes (capacity bonus)',
      '$0.18/min overage',
      '1 phone included',
      'Unlimited personas',
      'Advanced routing',
      'Multilingual routing',
      'CRM integrations',
      'Advanced analytics',
      'Priority support',
    ],
    bullets: [
      '4 concurrent calls',
      '1,200 minutes (capacity bonus)',
      '$0.18/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    cta: { label: 'Get started', href: '/signup' },
  },
  {
    name: 'Scale',
    monthlyPrice: '$899',
    price: '$899',
    priceUnit: '/ month',
    cadence: '/mo',
    subtitle: 'For high-volume operations',
    bestFor: 'For high-volume operations',
    desc: 'For high-volume operations',
    concurrencyLine: '10 concurrent calls',
    coreBullets: [
      '10 concurrent calls',
      '3,600 minutes (capacity bonus)',
      '$0.13/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    features: [
      '10 concurrent calls',
      '3,600 minutes (capacity bonus)',
      '$0.13/min overage',
      '1 phone included',
      'Unlimited personas',
      'HIPAA & audit logs',
      'SLA',
      'Account manager',
      'API access',
      'Unlimited knowledge base',
    ],
    bullets: [
      '10 concurrent calls',
      '3,600 minutes (capacity bonus)',
      '$0.13/min overage',
      '1 phone included',
      'Unlimited personas',
    ],
    cta: { label: 'Get started', href: '/signup' },
  },
];
