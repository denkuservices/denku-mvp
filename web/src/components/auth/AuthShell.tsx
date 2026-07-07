import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showBackLink?: boolean;
}

const proofPoints = [
  'Answer every call — 24/7, never a missed lead',
  'Qualify and book directly into your calendar',
  'Live in days, not months. No setup calls.',
];

export function AuthShell({ title, subtitle, children, footer, showBackLink }: AuthShellProps) {
  return (
    <div className="brand-surface flex min-h-screen w-full items-stretch bg-[#F7F5F1] text-[#0A1A2F]">
      {/* Left: Form */}
      <div className="flex w-full items-center justify-center px-6 py-10 md:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="mb-8 inline-block font-display text-[26px] font-semibold tracking-tight text-[#0A1A2F]">
            den<span className="text-[#1B6E6E]">ku</span>
          </Link>

          <div className="rounded-[20px] border border-[#0A1A2F]/[0.08] bg-white p-8 brand-shadow-md md:p-9">
            {showBackLink && (
              <Link
                href="/"
                className="mb-6 inline-flex items-center gap-2 text-sm text-[#6B7888] transition-colors hover:text-[#1B6E6E]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            )}

            <h1 className="font-display text-[28px] font-medium tracking-tight text-[#0A1A2F]">{title}</h1>
            <p className="mt-1.5 text-sm text-[#6B7888]">{subtitle}</p>

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-6 border-t border-[#0A1A2F]/[0.08] pt-5">{footer}</div>}
          </div>
        </div>
      </div>

      {/* Right: Brand panel (dark ink) */}
      <div className="relative hidden flex-1 overflow-hidden rounded-l-[48px] bg-[#0A1A2F] md:flex">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-[10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(27,110,110,0.25)_0%,transparent_65%)]" />
          <div className="absolute bottom-[-10%] left-[-10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(184,137,90,0.12)_0%,transparent_65%)]" />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-12">
          {/* Robot face */}
          <div
            className="brand-float mb-10 flex h-[110px] w-[120px] items-center justify-center gap-4 rounded-[34px_34px_28px_28px] bg-gradient-to-b from-white to-[#EAE6DE]"
            style={{ boxShadow: '0 0 0 10px rgba(27,110,110,0.10), 0 24px 60px rgba(0,0,0,0.3)' }}
          >
            <span className="h-[18px] w-[18px] rounded-full bg-[#1B6E6E]" style={{ boxShadow: '0 0 12px rgba(27,110,110,0.7)' }} />
            <span className="h-[18px] w-[18px] rounded-full bg-[#1B6E6E]" style={{ boxShadow: '0 0 12px rgba(27,110,110,0.7)' }} />
          </div>

          <div className="max-w-sm text-center">
            <div className="brand-eyebrow centered mb-5 justify-center !text-[#3FA3A3] before:!bg-[#3FA3A3]">
              AI Voice Employees
            </div>
            <h2 className="font-display text-[34px] font-normal leading-[1.12] tracking-[-1px] text-[#F7F5F1]">
              The employee that <em className="font-medium italic text-[#3FA3A3]">never</em> misses a call.
            </h2>
          </div>

          <div className="mt-10 w-full max-w-sm space-y-3">
            {proofPoints.map((point) => (
              <div key={point} className="flex items-center gap-3 rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B6E6E] text-white">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm text-[#F7F5F1]/85">{point}</span>
              </div>
            ))}
          </div>

          <p className="mt-10 flex items-center gap-2 font-brand-mono text-xs text-[#3FA3A3]">
            <span className="h-[7px] w-[7px] rounded-full bg-[#3FA3A3] pulse-dot" />
            DENKU · ONLINE · READY TO TALK
          </p>
        </div>
      </div>
    </div>
  );
}
