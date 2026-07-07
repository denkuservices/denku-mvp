'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-reveal wrapper. Fades + lifts children into view once.
 * Delay tiers: 0, 1, 2, 3 → staggered 80ms steps.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: visible ? `${delay * 80}ms` : '0ms' }}
      className={cn('brand-reveal', visible && 'visible', className)}
    >
      {children}
    </Tag>
  );
}
