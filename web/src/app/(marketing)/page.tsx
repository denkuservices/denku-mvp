import HeroPremium from '@/components/marketing/hero-premium';
import { WhyDenku } from '@/components/marketing/WhyDenku';
import { UseCases } from '@/components/marketing/UseCases';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { DemoCallout } from '@/components/marketing/DemoCallout';
import { OutcomesStrip } from '@/components/marketing/OutcomesStrip';
import { Pricing } from '@/components/marketing/Pricing';
import { SecurityTeaser } from '@/components/marketing/SecurityTeaser';
import { Contact } from '@/components/marketing/Contact';

export default function HomePage() {
  return (
    <>
      <HeroPremium />
      <WhyDenku />
      <UseCases />
      <HowItWorks />
      <DemoCallout />
      <OutcomesStrip />
      <Pricing />
      <SecurityTeaser />
      <Contact />
    </>
  );
}
