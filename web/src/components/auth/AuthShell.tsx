import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { AuthScenes } from '@/components/auth/AuthScenes';
import { DenkuLogo } from "@/components/brand/DenkuLogo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showBackLink?: boolean;
  /** Rendered under the form — the social sign-in row on login/signup. */
  secondary?: React.ReactNode;
}

/**
 * The auth shell: form on the left, a rotating story of the product on the right.
 *
 * Now on the dark canvas. The marketing site is dark end to end after P6, and a
 * bone-white login one click later was the visible seam in the journey. The panel
 * uses the same `--d-*` tokens as the landing, so the two surfaces are literally
 * the same system rather than two that happen to look alike.
 *
 * Onboarding and the dashboard are NOT changed by this — they keep their own
 * themes (CLAUDE.md design-system rule). If the dark auth is unwanted, swapping
 * `landing-surface` back to `brand-surface` here restores the warm treatment,
 * because every colour below goes through the shared role tokens.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  showBackLink,
  secondary,
}: AuthShellProps) {
  // next-intl's hook is isomorphic — this stays a server component.
  const t = useTranslations('auth');

  return (
    <div className="landing-surface flex min-h-screen w-full items-stretch bg-[var(--d-bg)] text-[var(--d-ink)]">
      {/* Left: form */}
      <div className="relative flex w-full items-center justify-center px-6 py-10 md:w-[54%] lg:px-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 30% -10%, rgba(47,163,154,.16), transparent 65%)',
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-9 flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-[var(--d-ink)]"
            >
              <DenkuLogo size={25} variant="gradient" />
            </Link>

            {showBackLink && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-[var(--d-ink-faint)] transition-colors hover:text-[var(--d-copper)]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("backToHome")}
              </Link>
            )}
          </div>

          <h1 className="font-display text-[32px] font-semibold tracking-[-.02em] text-[var(--d-ink)]">
            {title}
          </h1>
          <p className="mt-2 text-[15px] text-[var(--d-ink-soft)]">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {secondary && <div className="mt-6">{secondary}</div>}

          {footer && (
            <div className="mt-7 border-t border-[var(--d-border)] pt-6">{footer}</div>
          )}
        </div>
      </div>

      {/* Right: the product, working */}
      <div className="relative hidden flex-1 overflow-hidden border-l border-[var(--d-border)] md:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 70% -10%, rgba(47,163,154,.20), transparent 62%),' +
              'radial-gradient(ellipse 50% 40% at 40% 110%, rgba(200,148,104,.12), transparent 68%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.45]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(247,245,241,0.05) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        <div className="relative z-10 h-full w-full">
          <AuthScenes />
        </div>
      </div>
    </div>
  );
}
