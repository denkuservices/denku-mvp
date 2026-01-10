import { Container } from './Container';
import { Section } from './Section';
import { Button } from './Button';
import Link from 'next/link';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
}

export function SectionHeader({ eyebrow, title, description, ctaPrimary, ctaSecondary }: SectionHeaderProps) {
  return (
    <Section className="py-16 md:py-20">
      <Container>
        <div className="text-center max-w-3xl mx-auto">
          {eyebrow && (
            <p className="text-sm font-bold text-[#64748B] mb-4 uppercase tracking-wide">
              {eyebrow}
            </p>
          )}
          <h1 className="text-4xl font-bold tracking-tight text-[#0F172A] md:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-6 text-base text-[#475569] md:text-lg">
              {description}
            </p>
          )}
          {(ctaPrimary || ctaSecondary) && (
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              {ctaPrimary && (
                <Button asChild size="lg" className="text-base">
                  <Link href={ctaPrimary.href}>{ctaPrimary.label}</Link>
                </Button>
              )}
              {ctaSecondary && (
                <Button asChild variant="secondary" size="lg" className="text-base">
                  <Link href={ctaSecondary.href}>{ctaSecondary.label}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
}
