import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
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
        <Reveal className="mx-auto max-w-3xl text-center">
          {eyebrow && <div className="brand-eyebrow centered mb-5 justify-center">{eyebrow}</div>}
          <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-[#2C3E54]">{description}</p>
          )}
          {(ctaPrimary || ctaSecondary) && (
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              {ctaPrimary && (
                <Link href={ctaPrimary.href} className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">
                  {ctaPrimary.label}
                </Link>
              )}
              {ctaSecondary && (
                <Link href={ctaSecondary.href} className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">
                  {ctaSecondary.label}
                </Link>
              )}
            </div>
          )}
        </Reveal>
      </Container>
    </Section>
  );
}
