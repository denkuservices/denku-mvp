import { Hero } from '@/components/marketing/hero';
import { SocialProof } from '@/components/marketing/social-proof';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { UseCases } from '@/components/marketing/use-cases';
import { PricingPreview } from '@/components/marketing/pricing-preview';
import { FinalCta } from '@/components/marketing/final-cta';

export default function HomePage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <HowItWorks />
      <UseCases />
      <PricingPreview />
      <FinalCta />
    </>
  );
}
