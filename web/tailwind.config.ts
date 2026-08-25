import type { Config } from "tailwindcss";

/**
 * WHY THE HORIZON TOKENS BELOW ARE DECLARED HERE (do not "clean them up"):
 *
 * This app runs Tailwind v4 (`@import "tailwindcss"` + `@theme inline` in globals.css),
 * but the vendored Horizon UI dashboard components were written against Tailwind v3 and
 * reference `navy-*`, `brand-*`, `lightPrimary`, `background-100/900`, `shadow-shadow-*`,
 * `font-poppins` and `font-dm` as *config* tokens. Under v4 those utilities are only
 * generated if the tokens are declared in this file — declaring them as CSS variables
 * alone is not enough. Remove any of them and the Horizon dashboard silently renders
 * unstyled (missing dark-mode backgrounds, card shadows, and fonts).
 *
 * Font loading is split deliberately: Poppins comes from the Google Fonts @import at the
 * top of globals.css, DM Sans from `next/font/google` in app/(app)/layout.tsx. The
 * families are registered here so Tailwind emits the matching utilities.
 *
 * (Migrated from web/DELTA_PLAN_TAILWIND.md, which described this as pending work. That
 * work is complete — the plan doc was removed in R-133 and this comment replaces it.)
 */
const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      colors: {
        /**
         * THE AUTHENTIC HORIZON PALETTE — extracted from `public/horizon/horizon.bundle.css`
         * on 2026-08-25, not approximated.
         *
         * These tokens previously held *guessed* values: `brand-500` was `#3b82f6` (Tailwind's
         * default blue) where Horizon's actual brand is `#422AFB` (indigo), and the whole navy
         * scale was shifted — config `navy-700` held `#0b1437`, which is really Horizon's
         * `navy-900`. The mismatch stayed invisible because the vendored bundle is injected
         * UNLAYERED and therefore wins for every class Horizon's own build compiled (R-136).
         *
         * It was not harmless. Any shade the bundle did NOT compile fell through to these
         * values, so a new `bg-brand-400` rendered Tailwind blue next to an existing
         * `bg-brand-500` indigo — two different hues from one token family. And R-136's fix
         * (layering the bundle so our utilities win) would have repainted the entire dashboard
         * in the wrong palette the moment it landed.
         *
         * Verified values below come from the bundle itself; the few shades Horizon never
         * compiled (brand 50/100, navy 50–300 and 600) are the documented Horizon UI values and
         * are marked. Keep these in sync with the bundle — they are the same design system.
         */
        navy: {
          50: '#d0dcfb',  // not in bundle — Horizon UI documented value
          100: '#aac0fe', // not in bundle — Horizon UI documented value
          200: '#a3b9f8', // not in bundle — Horizon UI documented value
          300: '#728fea', // not in bundle — Horizon UI documented value
          400: '#3652ba', // from bundle
          500: '#1b3bbb', // from bundle
          600: '#24388a', // not in bundle — Horizon UI documented value
          700: '#1b254b', // from bundle
          800: '#111c44', // from bundle
          900: '#0b1437', // from bundle
        },
        brand: {
          50: '#e9e3ff',  // not in bundle — Horizon UI documented value
          100: '#c0b8fe', // not in bundle — Horizon UI documented value
          200: '#a195fd', // from bundle
          300: '#8171fc', // from bundle
          400: '#7551ff', // from bundle
          500: '#422afb', // from bundle — the primary. NOT #3b82f6.
          600: '#3311db', // from bundle — the hover state
          700: '#2111a5', // from bundle
          800: '#190793', // from bundle
          900: '#11047a', // from bundle
        },
        // Horizon lightPrimary — from bundle (was #e0f2fe, a guess)
        lightPrimary: '#f4f7fe',
        background: {
          100: '#f4f7fe', // from bundle
          900: '#070f2e', // from bundle (was #0b1437, which is navy-900)
        },
      },
      boxShadow: {
        // Horizon shadow utilities
        '3xl': '14px 17px 40px 4px',
        'shadow-100': '0px 18px 40px rgba(112, 144, 176, 0.12)',
        'shadow-500': '0px 18px 40px rgba(112, 144, 176, 0.12)',
        // Horizon shadow classes (used as shadow-shadow-100, shadow-shadow-500)
        'shadow-shadow-100': '0px 18px 40px rgba(112, 144, 176, 0.12)',
        'shadow-shadow-500': '0px 18px 40px rgba(112, 144, 176, 0.12)',
      },
      fontFamily: {
        // Horizon fonts
        poppins: ['Poppins', 'sans-serif'],
        dm: ['DM Sans', 'sans-serif'],
      },
      keyframes: {
        'luma-loader': {
          '0%': {
            inset: '0 35px 35px 0',
          },
          '12.5%': {
            inset: '0 35px 0 0',
          },
          '25%': {
            inset: '35px 35px 0 0',
          },
          '37.5%': {
            inset: '35px 0 0 0',
          },
          '50%': {
            inset: '35px 0 0 35px',
          },
          '62.5%': {
            inset: '0 0 0 35px',
          },
          '75%': {
            inset: '0 0 35px 35px',
          },
          '87.5%': {
            inset: '0 0 35px 0',
          },
          '100%': {
            inset: '0 35px 35px 0',
          },
        },
      },
      animation: {
        'luma-loader': 'luma-loader 2.5s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
