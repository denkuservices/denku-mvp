import { LandingHero } from '@/components/marketing/landing/LandingHero';
import { ProofStrip } from '@/components/marketing/landing/ProofStrip';
import { LiveDemo } from '@/components/marketing/landing/LiveDemo';
import { HowHiringWorks } from '@/components/marketing/landing/HowHiringWorks';
import { MeetEmployees } from '@/components/marketing/landing/MeetEmployees';
import { Workday } from '@/components/marketing/landing/Workday';
import { PricingPreview } from '@/components/marketing/landing/PricingPreview';
import { AuditCta, FinalCta, HonestFaq } from '@/components/marketing/landing/Closing';

/**
 * Landing v3 — see docs/LANDING_V3_DESIGN_PLAN.md.
 *
 * Section order follows doc 15's homepage blueprint (the business-validated one),
 * given the cinematic, low-copy treatment the owner asked for. The dark canvas is
 * switched on for "/" in MarketingSurface.tsx.
 */
export default function HomePage() {
  return (
    <>
      <LandingHero />
      <ProofStrip />
      <LiveDemo />
      <HowHiringWorks />
      <MeetEmployees />
      <Workday />
      <PricingPreview />
      <AuditCta />
      <HonestFaq />
      <FinalCta />
    </>
  );
}
