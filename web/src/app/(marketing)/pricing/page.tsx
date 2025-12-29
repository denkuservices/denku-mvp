import { PricingTable } from '@/components/marketing/pricing-table';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';

export default function PricingPage() {
  return (
    <Section>
      <Container>
        <PricingTable />
      </Container>
    </Section>
  );
}
