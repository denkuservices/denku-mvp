"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero's signal field — flowing teal threads with one copper thread, on the
 * doc-17 ink ground. This is the landing's only WebGL context, and it sits above
 * the fold (plan §7 rule 1: never more than one).
 *
 * Degrades in three steps, cheapest first:
 *   - `prefers-reduced-motion: reduce` → static CSS ground, no canvas, no rAF.
 *   - viewport < 768px            → static CSS ground (plan §7 rule 5: no WebGL on phones).
 *   - WebGL unavailable / context lost → static CSS ground.
 *
 * The static ground is not a placeholder: it is the same palette and the same
 * vertical composition, so the reduced-motion and mobile renders read as the
 * designed page rather than a broken one.
 */

const MOBILE_BREAKPOINT = 768;

export function SignalFieldFallback({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(47,163,154,0.28), transparent 62%)," +
          "radial-gradient(ellipse 60% 40% at 50% 58%, rgba(200,148,104,0.10), transparent 70%)," +
          "#0A1414",
      }}
    />
  );
}

export default function SignalField({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [useCanvas, setUseCanvas] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < MOBILE_BREAKPOINT;
    setUseCanvas(!reduced && !small);
  }, []);

  useEffect(() => {
    if (!useCanvas) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    // Dynamic import keeps ogl out of the initial bundle; the hero renders its
    // static ground first and upgrades to the shader once ogl has landed.
    void (async () => {
      try {
        const { Renderer, Program, Mesh, Triangle } = await import("ogl");
        if (disposed) return;

        const renderer = new Renderer({
          alpha: false,
          antialias: false,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
        const gl = renderer.gl;
        gl.clearColor(0.039, 0.078, 0.078, 1);
        host.appendChild(gl.canvas);
        gl.canvas.style.width = "100%";
        gl.canvas.style.height = "100%";
        gl.canvas.style.display = "block";

        const geometry = new Triangle(gl);
        const program = new Program(gl, {
          vertex: /* glsl */ `
            attribute vec2 uv;
            attribute vec2 position;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = vec4(position, 0.0, 1.0);
            }
          `,
          fragment: /* glsl */ `
            precision highp float;
            uniform float uTime;
            uniform vec2  uResolution;
            uniform vec2  uMouse;
            varying vec2  vUv;

            // A single flowing thread. Returns its glow contribution at this pixel.
            float thread(vec2 uv, float phase, float freq, float amp, float sharp) {
              // Envelope pins both ends of the thread to the centre line so the
              // field fades out at the edges instead of being cut off.
              float env = pow(sin(3.14159265 * clamp(uv.x, 0.0, 1.0)), 1.35);
              float y = 0.5 + sin(uv.x * freq + uTime * 0.55 + phase) * amp * env;
              float d = abs(uv.y - y);
              return 1.0 / (1.0 + d * sharp);
            }

            void main() {
              vec2 uv = vUv;
              // Correct for aspect so the waves keep their shape on wide screens.
              float aspect = uResolution.x / max(uResolution.y, 1.0);

              vec3 ink    = vec3(0.039, 0.078, 0.078); // #0A1414
              vec3 teal   = vec3(0.184, 0.639, 0.604); // #2FA39A
              vec3 copper = vec3(0.784, 0.580, 0.408); // #C89468

              // Cursor pulls the field very gently — presence, not a toy.
              float pull = (uMouse.y - 0.5) * 0.06;

              vec3 col = ink;

              // Four teal threads, each quieter than the last.
              for (int i = 0; i < 4; i++) {
                float fi = float(i);
                float amp = (0.115 - fi * 0.022) * (1.0 + pull);
                float g = thread(uv, fi * 0.85, 7.0 + fi * 1.6, amp, 260.0 + fi * 90.0);
                col += teal * g * (0.42 - fi * 0.085);
              }

              // One copper thread — the signature, and the only warm light here.
              float cg = thread(uv, 1.7, 5.0, 0.155 * (1.0 + pull), 420.0);
              col += copper * cg * 0.55;

              // Depth glow from above the frame (doc 06: sections articulated by glow).
              float glow = smoothstep(1.0, 0.0, length((uv - vec2(0.5, 1.15)) * vec2(aspect * 0.55, 1.0)));
              col += teal * glow * 0.10;

              // Vignette so type stays legible over the field.
              float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(aspect * 0.7, 1.0)));
              col *= mix(0.72, 1.0, vig);

              gl_FragColor = vec4(col, 1.0);
            }
          `,
          uniforms: {
            uTime: { value: 0 },
            uResolution: { value: [1, 1] as [number, number] },
            uMouse: { value: [0.5, 0.5] as [number, number] },
          },
        });
        const mesh = new Mesh(gl, { geometry, program });

        const resize = () => {
          const r = host.getBoundingClientRect();
          renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
          program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
        };
        resize();
        window.addEventListener("resize", resize);

        // Pointer is read passively and only on fine pointers.
        const finePointer = window.matchMedia("(pointer: fine)").matches;
        const onMove = (e: PointerEvent) => {
          const r = host.getBoundingClientRect();
          program.uniforms.uMouse.value = [
            (e.clientX - r.left) / Math.max(r.width, 1),
            1 - (e.clientY - r.top) / Math.max(r.height, 1),
          ];
        };
        if (finePointer) window.addEventListener("pointermove", onMove, { passive: true });

        // Only animate while the field is actually on screen.
        let raf = 0;
        let running = false;
        const start = performance.now();
        const frame = (now: number) => {
          if (!running) return;
          program.uniforms.uTime.value = (now - start) / 1000;
          renderer.render({ scene: mesh });
          raf = requestAnimationFrame(frame);
        };
        const setRunning = (next: boolean) => {
          if (next === running) return;
          running = next;
          if (next) raf = requestAnimationFrame(frame);
          else cancelAnimationFrame(raf);
        };

        const io = new IntersectionObserver(
          (entries) => entries.forEach((e) => setRunning(e.isIntersecting)),
          { threshold: 0.01 }
        );
        io.observe(host);

        const onVisibility = () => {
          if (document.hidden) setRunning(false);
          else if (host.getBoundingClientRect().bottom > 0) setRunning(true);
        };
        document.addEventListener("visibilitychange", onVisibility);

        const onLost = (e: Event) => {
          e.preventDefault();
          setRunning(false);
          setUseCanvas(false);
        };
        gl.canvas.addEventListener("webglcontextlost", onLost);

        cleanup = () => {
          setRunning(false);
          io.disconnect();
          window.removeEventListener("resize", resize);
          if (finePointer) window.removeEventListener("pointermove", onMove);
          document.removeEventListener("visibilitychange", onVisibility);
          gl.canvas.removeEventListener("webglcontextlost", onLost);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
          gl.canvas.remove();
        };
      } catch {
        // ogl failed to load or WebGL is unavailable — the static ground stands.
        if (!disposed) setUseCanvas(false);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [useCanvas]);

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {/* Always painted: the canvas draws over it once ready, and it is the whole
          render under reduced motion, on phones, and without WebGL. */}
      <SignalFieldFallback />
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  );
}
