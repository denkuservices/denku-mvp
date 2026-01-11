'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

type SplineProps = {
  scene: string;
};

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
}) as ComponentType<SplineProps>;

export default function SplineClient({ scene }: { scene: string }) {
  if (!scene) return null;
  return <Spline scene={scene} />;
}
