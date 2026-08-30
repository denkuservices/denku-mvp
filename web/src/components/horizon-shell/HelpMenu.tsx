'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, BookOpen, LifeBuoy, Mail } from 'lucide-react';
import { getSupportEmail } from '@/lib/support';

/**
 * The help menu behind the topbar's info button.
 *
 * Every entry goes somewhere that already exists — the public docs page, the support page, and
 * the monitored support address. That is the whole bar this control has to clear: an info button
 * whose menu explained itself and linked nowhere would be the decorative control this capsule
 * had removed from it once already.
 *
 * The support address is read through `lib/support.ts` rather than written here, so the operator
 * still points it at one monitored inbox in one place. The env object is handed in **explicitly**:
 * Next inlines `process.env.NEXT_PUBLIC_*` into a client bundle only where it is written as a
 * literal member access, so `getSupportEmail()` reading `process.env` through a parameter would
 * silently miss a configured address and fall back to the default.
 */
export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const supportEmail = getSupportEmail({
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  });

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Help"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white/70 dark:hover:bg-white/10"
      >
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Help"
          className="absolute right-0 top-12 z-[9999] w-[min(92vw,260px)] overflow-hidden rounded-[20px] bg-white py-2 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none"
        >
          <Item href="/docs" icon={BookOpen} label="Documentation" hint="How Denku works" newTab />
          <Item href="/support" icon={LifeBuoy} label="Support" hint="Answers and contact" newTab />
          <Item
            href={`mailto:${supportEmail}?subject=${encodeURIComponent('Denku support request')}`}
            icon={Mail}
            label="Email support"
            hint={supportEmail}
          />
        </div>
      )}
    </div>
  );
}

function Item({
  href,
  icon: Icon,
  label,
  hint,
  newTab = false,
}: {
  href: string;
  icon: typeof Info;
  label: string;
  hint: string;
  newTab?: boolean;
}) {
  const className =
    'flex items-start gap-3 px-4 py-2.5 transition hover:bg-gray-50 dark:hover:bg-navy-800/60';
  const body = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-white/40" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-navy-700 dark:text-white">{label}</span>
        <span className="block truncate text-xs text-gray-500 dark:text-white/60">{hint}</span>
      </span>
    </>
  );

  // The docs and support pages live on the marketing site: opening them in a new tab keeps the
  // dashboard — and whatever the person was in the middle of — exactly where they left it.
  if (href.startsWith('mailto:')) {
    return (
      <a role="menuitem" href={href} className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link
      role="menuitem"
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}
