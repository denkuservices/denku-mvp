import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

export function FinalCta() {
  return (
    <Section>
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-foreground px-8 py-12 text-background shadow-lg md:px-12">
          {/* subtle background */}
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent)]"
            aria-hidden="true"
          />

          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Ready to Build with SovereignAI?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-background/80">
              Explore the platform and start building today. Deploy your first agent in minutes.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
                <Link href="/pricing">Get Started</Link>
              </Button>
                <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                <Link href="/contact">Talk to Sales</Link>
                </Button>





            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
