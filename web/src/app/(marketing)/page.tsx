import { HeroPremium } from '@/components/marketing/hero-premium';
import { UseCases } from '@/components/marketing/UseCases';
import { OutcomesStrip } from '@/components/marketing/OutcomesStrip';
import { Pricing } from '@/components/marketing/Pricing';
import { SecurityTeaser } from '@/components/marketing/SecurityTeaser';
import { Contact } from '@/components/marketing/Contact';

export default function HomePage() {
  return (
    <>
      <HeroPremium />
      <UseCases />
      <OutcomesStrip />
      <Pricing />
      <SecurityTeaser />
      <Contact />
    </>
  );
}
