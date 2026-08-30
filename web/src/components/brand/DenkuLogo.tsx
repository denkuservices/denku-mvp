import * as React from "react";

/**
 * The Denku mark — "the vortex".
 *
 * Three tapered blades sweeping around a hollow core. Not a letter and not a
 * creature: an abstract form that says the thing the product does, which is turn
 * without stopping. The signal spirals outward, the core stays open, and the
 * rotational symmetry means it works as an avatar, an app icon and a 16px favicon
 * without a second drawing.
 *
 * Colour is the site's own palette (doc 17 §2): a single diagonal sweep from the
 * lifted brand teal, through bone, into the copper signature — spanning the WHOLE
 * mark rather than per blade, so the three blades read as one swept object instead
 * of three stickers.
 *
 * The stops were chosen by rendering five candidates side by side, not by theory.
 * Routing through bone (the obvious `--d-grad-ember` reading) came out milky — bone
 * is so light that it swallowed the middle of the mark and left teal and copper as
 * slivers at the edges. Copper → bone alone collapsed to a single warm blob at
 * favicon size. What works is a shaded metal: a deep teal edge, the brand teal
 * through the body, warming to copper at the tips. Dark → luminous → warm gives the
 * blades dimension, and it still reads two-tone at 32px.
 *
 * A logo is the one artifact allowed to carry both brand accents at once; the
 * "one saturated colour per viewport" rule in doc 17 governs layouts, not the mark.
 */

/** The single blade, rotated three times. Generated geometry — do not hand-edit. */
const BLADE =
  "M37.95 25.6 L38.45 25.3 L38.96 25.01 L39.48 24.76 L40 24.52 L40.51 24.3 L41.02 24.1 L41.51 23.92 L41.99 23.76 L42.46 23.61 L42.91 23.46 L43.35 23.33 L43.76 23.2 L44.16 23.08 L44.54 22.96 L44.91 22.84 L45.26 22.72 L45.6 22.59 L45.93 22.46 L46.25 22.33 L46.57 22.2 L46.88 22.06 L47.2 21.92 L47.52 21.78 L47.85 21.64 L48.19 21.51 L48.54 21.38 L48.92 21.26 L49.3 21.15 L49.71 21.05 L50.15 20.98 L50.65 20.98 L51.26 21.12 L51.88 21.29 L52.49 21.47 L53.11 21.68 L53.73 21.91 L54.35 22.16 L54.97 22.43 L55.59 22.72 L56.2 23.02 L56.81 23.33 L57.41 23.66 L58 23.97 L58.57 24.27 L59.12 24.51 L59.49 24.12 L59.49 24.12 L58.48 22.48 L57.62 21.53 L56.76 20.72 L55.89 19.99 L55.02 19.33 L54.14 18.73 L53.25 18.18 L52.36 17.68 L51.46 17.24 L50.55 16.83 L49.64 16.48 L48.74 16.17 L47.83 15.9 L46.92 15.67 L46.02 15.48 L45.01 15.22 L43.95 14.95 L42.88 14.71 L41.8 14.52 L40.73 14.38 L39.66 14.29 L38.59 14.25 L37.54 14.27 L36.51 14.33 L35.51 14.45 L34.53 14.63 L33.59 14.85 L32.68 15.13 L31.82 15.46 L31 15.84 L30.24 16.27 L29.53 16.73 L28.88 17.24 L28.3 17.78 L27.77 18.36 L27.31 18.96 L26.91 19.59 L26.58 20.24 L26.31 20.9 L26.1 21.57 L25.96 22.25 L25.87 22.93 L25.84 23.6 L25.86 24.28 L25.93 24.94 L26.05 25.6 Z";

/**
 * Doc-17 tokens: --d-teal, --d-ink, --d-copper. Change these three to retint the
 * entire brand — the favicon and apple icon carry the same values.
 */
export const MARK_STOPS = ["#17635E", "#2FA39A", "#C89468"] as const;

export function DenkuMark({
  size = 28,
  className = "",
  /** `gradient` is the brand mark; `mono` inherits currentColor for one-colour contexts. */
  variant = "gradient",
  title,
}: {
  size?: number;
  className?: string;
  variant?: "gradient" | "mono";
  title?: string;
}) {
  // Gradient ids must be unique per instance or the first <defs> on the page wins
  // for every copy. `useId` is stable across server and client — a module-level
  // counter is not, and produced a hydration mismatch.
  const id = React.useId();
  const fill = variant === "mono" ? "currentColor" : `url(#${id})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {variant === "gradient" && (
        <defs>
          {/* userSpaceOnUse so the sweep spans the whole mark, not each blade. */}
          <linearGradient id={id} x1="10" y1="9" x2="54" y2="55" gradientUnits="userSpaceOnUse">
            <stop offset="0.04" stopColor={MARK_STOPS[0]} />
            <stop offset="0.30" stopColor={MARK_STOPS[1]} />
            <stop offset="0.76" stopColor={MARK_STOPS[2]} />
          </linearGradient>
        </defs>
      )}
      <g fill={fill}>
        <path d={BLADE} />
        <path d={BLADE} transform="rotate(120 32 32)" />
        <path d={BLADE} transform="rotate(240 32 32)" />
      </g>
    </svg>
  );
}

/**
 * Mark + wordmark.
 *
 * `denku` stays lowercase in Fraunces — the warm serif is the brand's most ownable
 * typographic asset (doc 17 §3), and it is what keeps the loud mark anchored to the
 * rest of the system. The wordmark is a single colour: the mark carries the colour,
 * and the old two-tone "den·ku" split competed with it.
 */
export function DenkuLogo({
  size = 26,
  className = "",
  variant = "gradient",
  showMark = true,
}: {
  size?: number;
  className?: string;
  variant?: "gradient" | "mono";
  showMark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {showMark && <DenkuMark size={size * 1.15} variant={variant} />}
      <span
        className="font-display font-semibold tracking-[-.025em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        denku
      </span>
    </span>
  );
}

export default DenkuLogo;
