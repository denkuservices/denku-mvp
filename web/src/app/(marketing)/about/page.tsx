import { AboutPage } from '@/components/marketing/about-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: "About Denku — building AI voice employees so businesses never miss a call.",
  alternates: { canonical: '/about' },
};

export default function AboutRoutePage() {
  return <AboutPage />;
}
