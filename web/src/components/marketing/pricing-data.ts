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
    concurrencyLine: 'Handles 1 call at a time',
    coreBullets: [
      '1 phone number included',
      '1 concurrent call',
      'Unlimited core personas',
      '400 minutes included',
      'Capacity bonus',
      '$0.22 / minute overage',
    ],
    features: [
      '1 phone number included',
      '1 concurrent call',
      'Unlimited core personas',
      '400 minutes included',
      'Capacity bonus',
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
      'Upgrade when call volume increases',
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
    concurrencyLine: 'Handles 4 calls simultaneously',
    coreBullets: [
      '2 phone numbers included',
      '4 concurrent calls',
      'Unlimited core personas',
      '1,200 minutes included',
      'Capacity bonus',
      '$0.18 / minute overage',
    ],
    features: [
      '2 phone numbers included',
      '4 concurrent calls',
      'Unlimited core personas',
      '1,200 minutes included',
      'Capacity bonus',
      '$0.18 / minute overage',
      'Advanced routing',
      'Multilingual routing',
      'CRM integrations',
      'Advanced analytics',
      'Priority support',
    ],
    bullets: [
      '2 phone numbers',
      '4 concurrent calls',
      'Unlimited personas',
      '1,200 included minutes',
      'Sales & CEO/Ops agents available as add-ons',
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
    concurrencyLine: 'Handles 10 simultaneous calls',
    coreBullets: [
      '5 phone numbers included',
      '10 concurrent calls',
      'Unlimited core personas',
      '3,600 minutes included',
      'Capacity bonus',
      'From $0.13 / minute overage',
    ],
    features: [
      '5 phone numbers included',
      '10 concurrent calls',
      'Unlimited core personas',
      '3,600 minutes included',
      'Capacity bonus',
      'From $0.13 / minute overage',
      'HIPAA & audit logs',
      'SLA',
      'Account manager',
      'API access',
      'Unlimited knowledge base',
      'Custom pricing for high volume',
    ],
    bullets: [
      '5 phone numbers',
      '10 concurrent calls',
      'Unlimited personas',
      '3,600 included minutes',
      'HIPAA compliance & SLA',
    ],
    cta: { label: 'Talk to sales', href: '/#contact' },
  },
];
