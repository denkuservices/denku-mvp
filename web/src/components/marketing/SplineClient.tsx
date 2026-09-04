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

export const SPLINE_ORIGIN = 'https://prod.spline.design';

/**
 * Start fetching the 3D employee before anyone scrolls to it (perf, 2026-09-04).
 *
 * The scene only mounts when its section comes into view, which is right — it must never be on
 * the hero's critical path. But mounting is also the moment THREE things start, in series, that
 * had not started before: the runtime chunk downloads (~2 MB raw), then that runtime asks
 * `prod.spline.design` for the scene, which needs a fresh DNS lookup and TLS handshake, and only
 * then does the first of 1.35 MB arrive. Measured from Türkiye: 1.94s for the scene alone, of
 * which **869ms passes before a single byte** — pure connection setup and server think time.
 * That ladder is why the character always showed up late.
 *
 * So the bytes are fetched during idle time instead, while the visitor is still reading the hero.
 * Nothing about WHEN the scene renders changes; only when its download starts. The scene answers
 * with `Access-Control-Allow-Origin: *` and a `Last-Modified` months old and no `Cache-Control`,
 * so the browser caches it heuristically for weeks — which is what lets the runtime's own later
 * request come out of cache rather than off the network.
 *
 * Deliberately conservative about whose data this spends:
 *   - nothing happens without a scene URL, or off the main thread's idle time;
 *   - `saveData` and anything slower than 4g are skipped entirely — on a metered phone a 1.35 MB
 *     speculative download is a real cost, and those visitors simply get the old behaviour;
 *   - the fetch is low priority, so it yields to anything the page actually needs;
 *   - every failure is swallowed. This is an optimisation; if it does not happen, the scene loads
 *     exactly as it did before.
 */
export function warmSpline(scene: string): () => void {
  if (!scene || typeof window === 'undefined') return () => {};

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return () => {};
  if (connection?.effectiveType && connection.effectiveType !== '4g') return () => {};

  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    // The engine and the scene are independent downloads; neither waits for the other.
    void import('@splinetool/react-spline').catch(() => {});
    void fetch(scene, {
      mode: 'cors',
      credentials: 'omit',
      // Chrome honours this; everywhere else it is ignored and the fetch is simply normal.
      priority: 'low',
    } as RequestInit).catch(() => {});
  };

  const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (idle) {
    const handle = idle(run, { timeout: 3000 });
    return () => {
      cancelled = true;
      (window as Window & { cancelIdleCallback?: typeof cancelIdleCallback }).cancelIdleCallback?.(
        handle
      );
    };
  }

  const timer = window.setTimeout(run, 1500);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

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
