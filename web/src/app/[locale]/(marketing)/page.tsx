import type { Metadata } from "next";
import { LandingHero } from '@/components/marketing/landing/LandingHero';
import { ProofStrip } from '@/components/marketing/landing/ProofStrip';
import { LiveDemo } from '@/components/marketing/landing/LiveDemo';
import { HowHiringWorks } from '@/components/marketing/landing/HowHiringWorks';
import { MeetEmployees } from '@/components/marketing/landing/MeetEmployees';
import { Workday } from '@/components/marketing/landing/Workday';
import { PricingPreview } from '@/components/marketing/landing/PricingPreview';
import { AuditCta, FinalCta, HonestFaq } from '@/components/marketing/landing/Closing';
import { localeAlternates } from "@/i18n/alternates";

/**
 * Landing v3 — see docs/LANDING_V3_DESIGN_PLAN.md.
 *
 * Section order follows doc 15's homepage blueprint (the business-validated one),
 * given the cinematic, low-copy treatment the owner asked for. The dark canvas is
 * switched on for "/" in MarketingSurface.tsx.
 */

/**
 * Only `alternates` — the title and description are inherited from the root layout, and this
 * page has never overridden them. What it must not inherit is a canonical: the root's used to
 * name the English home page for every locale.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, '') };
}

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
