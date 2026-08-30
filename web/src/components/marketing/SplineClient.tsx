'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/**
 * Minimal wrapper around @splinetool/react-spline.
 *
 * `onLoad` is forwarded so callers can reach the Spline `Application` — the dark
 * landing uses it to clear the scene's baked-in light background, which would
 * otherwise punch a grey rectangle through the teal-black canvas.
 */

type SplineApp = {
  setBackgroundColor?: (color: string) => void;
};

type SplineProps = {
  scene: string;
  onLoad?: (app: SplineApp) => void;
  className?: string;
};

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
}) as ComponentType<SplineProps>;

export default function SplineClient({
  scene,
  onLoad,
  className,
}: {
  scene: string;
  onLoad?: (app: SplineApp) => void;
  className?: string;
}) {
  if (!scene) return null;
  return <Spline scene={scene} onLoad={onLoad} className={className} />;
}
