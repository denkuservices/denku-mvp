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
      '1 phone number included',
      '1 concurrent call',
      'Unlimited personas',
      '400 minutes included',
      '$0.22 / minute overage',
    ],
    features: [
      '1 phone number included',
      '1 concurrent call',
      'Unlimited personas',
      '400 minutes included',
      '$0.22 / minute overage',
      '20+ languages',
      'Ticket + appointment creation',
      'Basic analytics',
    ],
    bullets: [
      '1 phone number',
      '1 concurrent call',
      'Unlimited personas',
      '400 included minutes',
      '$0.22 / minute overage',
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
      '1 phone number included',
      '4 concurrent calls',
      'Unlimited personas',
      '1,200 minutes included',
      '$0.18 / minute overage',
    ],
    features: [
      '1 phone number included',
      '4 concurrent calls',
      'Unlimited personas',
      '1,200 minutes included',
      '$0.18 / minute overage',
      'Advanced routing',
      'Multilingual routing',
      'CRM integrations',
      'Advanced analytics',
      'Priority support',
    ],
    bullets: [
      '1 phone number',
      '4 concurrent calls',
      'Unlimited personas',
      '1,200 included minutes',
      '$0.18 / minute overage',
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
      '1 phone number included',
      '10 concurrent calls',
      'Unlimited personas',
      '3,600 minutes included',
      '$0.13 / minute overage',
    ],
    features: [
      '1 phone number included',
      '10 concurrent calls',
      'Unlimited personas',
      '3,600 minutes included',
      '$0.13 / minute overage',
      'HIPAA & audit logs',
      'SLA',
      'Account manager',
      'API access',
      'Unlimited knowledge base',
      'Custom pricing for high volume',
    ],
    bullets: [
      '1 phone number',
      '10 concurrent calls',
      'Unlimited personas',
      '3,600 included minutes',
      '$0.13 / minute overage',
    ],
    cta: { label: 'Get started', href: '/signup' },
  },
];
