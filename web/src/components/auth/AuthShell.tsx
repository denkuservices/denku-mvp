import React from 'react';
import Link from 'next/link';
import { AuthRightPanelBackground } from './AuthRightPanelBackground';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showBackLink?: boolean;
}

export function AuthShell({ title, subtitle, children, footer, showBackLink }: AuthShellProps) {
  return (
    <div className="flex min-h-screen w-full items-stretch">
      {/* Left: Form Card */}
      <div className="w-full md:w-1/2 flex items-center justify-center px-6 lg:px-12 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-9">
            {showBackLink && (
              <Link
                href="/"
                className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6 transition-colors"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to home
              </Link>
            )}
            
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>

            <div className="mt-6">{children}</div>

            {footer && (
              <>
                <div className="mt-6 pt-5 border-t border-slate-200">{footer}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Brand Panel */}
      <div className="relative hidden md:flex flex-1 overflow-hidden rounded-l-[48px] min-h-screen">
        {/* 1) Gradient base (bottom) */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700" />
        
        {/* 2) Optional soft overlay (very subtle) */}
        <div className="absolute inset-0 z-10 bg-black/5 pointer-events-none" />
        
        {/* 3) DotGrid (above gradient and overlay) */}
        <div className="absolute inset-0 z-20 opacity-50 pointer-events-auto">
          <AuthRightPanelBackground />
        </div>
        
        {/* 4) Content (top) - pointer-events-none so DotGrid can receive mouse events */}
        <div className="relative z-30 flex h-full w-full items-center justify-center px-8 lg:px-12 pointer-events-none">
          <div className="max-w-md text-center">
            <h2 className="text-4xl font-bold text-white mb-3">Sovereign AI</h2>
            <p className="text-lg text-white/90 mb-6">
              Production-grade Voice AI infrastructure.
            </p>
            <p className="text-sm text-white/80">
              Unlimited personas. Concurrency defines capacity.
            </p>
            
            <div className="mt-8">
              <div className="inline-block rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2">
                <p className="text-sm text-white/90">Learn more at denku-mvp.vercel.app</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
