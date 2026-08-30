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
          <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[var(--s-ink)]">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-[var(--s-ink-soft)]">{description}</p>
          )}
          {(ctaPrimary || ctaSecondary) && (
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              {ctaPrimary && (
                <Link href={ctaPrimary.href} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">
                  {ctaPrimary.label}
                </Link>
              )}
              {ctaSecondary && (
                <Link href={ctaSecondary.href} className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">
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
