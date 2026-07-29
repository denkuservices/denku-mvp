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
        // Horizon navy palette (blue-gray for dark mode backgrounds)
        navy: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d4ff',
          300: '#a4b5ff',
          400: '#818cff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#0b1437', // Darker navy for dark mode (common Horizon value)
          800: '#1a1f3a', // Very dark navy
          900: '#1e293b', // Almost black navy
        },
        // Horizon brand palette (blue accent for active states)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6', // Primary brand blue
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Horizon lightPrimary (light blue tint for search/nav backgrounds)
        lightPrimary: '#e0f2fe',
        // Horizon background shades (main layout backgrounds)
        background: {
          100: '#f4f7fe', // Light gray-blue background
          900: '#0b1437', // Dark navy background
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
