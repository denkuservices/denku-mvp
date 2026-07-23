import { UseCasesPage } from '@/components/marketing/use-cases-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Use Cases',
  description:
    "See how businesses use Denku's AI voice employee to answer every call, qualify leads, and book appointments 24/7 — for trades, clinics, salons, and more.",
  alternates: { canonical: '/use-cases' },
};

export default function UseCasesRoutePage() {
  return <UseCasesPage />;
}
