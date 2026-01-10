import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

export function FinalCta() {
  return (
    <Section>
      <Container>
        <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-8 py-16 text-white shadow-3xl md:px-16">
          {/* subtle background */}
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent)]"
            aria-hidden="true"
          />

          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Ready to Build with SovereignAI?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/90">
              Explore the platform and start building today. Deploy your first agent in minutes.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild size="lg" className="bg-white text-brand-500 hover:bg-gray-50 text-base font-bold">
                <Link href="/pricing">Get Started</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-2 border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white text-base font-bold"
              >
                <Link href="#contact">Talk to Sales</Link>
              </Button>





            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
