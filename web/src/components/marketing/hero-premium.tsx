'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';
import { Check } from 'lucide-react';
import { TalkToAgentHero } from './TalkToAgentHero';

const Spline = dynamic(() => import('@splinetool/react-spline'), { ssr: false });

const SPLINE_SCENE = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL || '';

const trustItems = [
  'Multi-tenant isolation',
  'Production-ready from day one',
  'Voice & Chat automation',
];

export function HeroPremium() {
  return (
    <Section id="product" className="relative py-20 md:py-32 scroll-mt-20">
      <Container className="relative bg-transparent">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Left: Content */}
          <div className="text-center lg:text-left">
            <p className="text-sm font-bold text-[#64748B] mb-4">
              SovereignAI · Sovereign-grade AI agents
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-[#0F172A] md:text-5xl lg:text-6xl md:leading-tight">
              Build Production-Ready AI Agents
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-[#475569] md:text-lg lg:mx-0">
              A secure platform for SaaS teams to build, deploy, and manage production-grade AI agents
              with multi-tenant isolation, operational control, and full observability.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row justify-center lg:justify-start gap-4">
              <Button asChild size="lg" className="text-base">
                <Link href="/pricing">Get started</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="text-base">
                <Link href="/contact">Request demo</Link>
              </Button>
            </div>

            {/* Trust items */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#475569]">
              {trustItems.map((item) => (
                <div key={item} className="flex items-center gap-3 justify-center lg:justify-start">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full">
                    <Check className="h-3.5 w-3.5 text-[#2563EB]" />
                  </div>
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: 3D Visual or Fallback + CTA */}
          <div className="flex flex-col items-center">
            <div className="relative h-[400px] lg:h-[500px] w-full bg-transparent">
              {SPLINE_SCENE ? (
                <div className="h-full w-full bg-transparent shadow-none border-0 ring-0 rounded-none pointer-events-auto">
                  {/* TODO: If Spline scene has its own background, set it to transparent or #E3E3E3 in Spline editor */}
                  <Spline scene={SPLINE_SCENE} />
                </div>
              ) : (
                <div className="h-full w-full bg-[#E3E3E3] shadow-none border-0 ring-0 rounded-none relative pointer-events-none">
                  {/* Placeholder content */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/80 border border-gray-200 shadow-sm mb-4">
                        <svg
                          className="h-10 w-10 text-foreground/60"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground">3D Visualization</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Talk to Denku AI CTA - under robot */}
            <TalkToAgentHero />
          </div>
        </div>
      </Container>
    </Section>
  );
}
