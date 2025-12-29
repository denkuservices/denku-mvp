'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-semibold tracking-tight">
            SovereignAI
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 md:flex text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/use-cases" className="hover:text-foreground">Use Cases</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </nav>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:opacity-90 transition"
            >
              Get started
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden rounded-md border px-3 py-2 text-sm hover:bg-muted transition"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div id="mobile-menu" className="md:hidden border-t bg-background" ref={panelRef}>
            <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-2 text-sm">
              <Link href="/about" className="rounded-md px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                About
              </Link>
              <Link href="/use-cases" className="rounded-md px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                Use Cases
              </Link>
              <Link href="/pricing" className="rounded-md px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                Pricing
              </Link>
              <Link href="/contact" className="rounded-md px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                Contact
              </Link>

              <div className="my-2 h-px bg-border" />

              <Link href="/login" className="rounded-md px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md px-3 py-2 bg-foreground text-background hover:opacity-90 transition"
                onClick={() => setOpen(false)}
              >
                Get started
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4">{children}</main>

      <footer className="border-t mt-16">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} SovereignAI. All rights reserved.</div>
          <div className="flex gap-4">
            <Link className="hover:text-foreground" href="/privacy">Privacy</Link>
            <Link className="hover:text-foreground" href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
