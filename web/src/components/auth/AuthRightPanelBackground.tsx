'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import '@/components/DotGrid.css';

// Dynamic import for DotGrid to avoid SSR issues
const DotGrid = dynamic(
  () => import('../DotGrid').then((m) => m.default),
  { ssr: false }
);

export function AuthRightPanelBackground() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    setMounted(true);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Reduced motion: render static pattern
  if (prefersReducedMotion || !mounted) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{ width: '1080px', height: '1080px', position: 'relative' }}
          className="pointer-events-none"
        >
          {/* Static dot pattern */}
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)`,
              backgroundSize: '40px 40px',
            }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  // Animated DotGrid
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div style={{ width: 1080, height: 1080, position: 'relative' }}>
        <DotGrid
          dotSize={3}
          gap={20}
          baseColor="#271E37"
          activeColor="#5227FF"
          proximity={120}
          speedTrigger={100}
          shockRadius={250}
          shockStrength={5}
          maxSpeed={5000}
          resistance={750}
          returnDuration={1.5}
        />
      </div>
    </div>
  );
}
