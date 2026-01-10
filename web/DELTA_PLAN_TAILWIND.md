# Delta Plan: Tailwind + Global CSS Setup Parity with Horizon UI

## Executive Summary
Our app uses Tailwind CSS v4 with custom theme variables, while Horizon UI expects Tailwind v3 with specific color/shadow/font extensions. This mismatch causes Horizon components to render unstyled (missing `navy-*`, `brand-*`, `shadow-shadow-*`, `font-poppins`, etc.).

---

## 1. Tailwind Config Changes Required

### File: `web/tailwind.config.ts`

#### 1.1 Missing Theme Colors
**Location:** `theme.extend.colors`

**Add:**
- `navy` color palette (shades: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900)
  - Used in: `bg-navy-700`, `bg-navy-800`, `bg-navy-900`, `text-navy-700`, `dark:bg-navy-700`, etc.
  - Horizon components rely heavily on navy for dark mode backgrounds

- `brand` color palette (shades: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900)
  - Used in: `bg-brand-500`, `text-brand-500`, `border-brand-500`, `bg-brand-400` (dark mode), etc.
  - Primary accent color for active states, links, buttons

- `lightPrimary` color
  - Used in: `bg-lightPrimary` (navbar search, widget icons)
  - Light blue/primary tint for backgrounds

- `background` color palette (shades: 100, 900)
  - Used in: `bg-background-100`, `bg-background-900` (main layout backgrounds)

#### 1.2 Missing Box Shadows
**Location:** `theme.extend.boxShadow`

**Add:**
- `shadow-shadow-500` - Main card/component shadow
  - Used extensively: `shadow-xl shadow-shadow-500` on cards, dropdowns, tooltips
- `shadow-3xl` - Large shadow (already used in components via classes)

#### 1.3 Missing Font Families
**Location:** `theme.extend.fontFamily`

**Add:**
- `font-poppins` - Used for sidebar branding ("Horizon FREE")
- `font-dm` - Used throughout (`font-dm` class in layout)

**Note:** Fonts are imported via Google Fonts in Horizon's `index.css`, but Tailwind needs them registered.

---

## 2. Global CSS Differences

### File: `web/src/app/globals.css`

#### 2.1 CSS Syntax Version Mismatch
**Current:** Uses Tailwind v4 syntax (`@import "tailwindcss"` + `@theme inline`)
**Horizon expects:** Tailwind v3 syntax (`@tailwind base/components/utilities`)

**Issue:** Our v4 syntax might not properly generate all utilities Horizon needs, especially custom tokens.

**Options:**
- **Option A (Recommended):** Keep v4 but ensure all Horizon tokens are defined in `tailwind.config.ts` (not just CSS variables)
- **Option B:** Revert to v3 syntax for compatibility (would require changing PostCSS config)

#### 2.2 Missing Font Imports
**Location:** Top of `globals.css` (before `@import "tailwindcss"`)

**Add:**
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
```

**Note:** Horizon's `index.css` imports these fonts before `@tailwind` directives.

#### 2.3 Base Layer Font Override
**Location:** `@layer base`

**Current:** No font-family override for `html`
**Horizon has:**
```css
@layer base {
  html {
    font-family: 'DM Sans', sans-serif !important;
    font-feature-settings: 'kern' !important;
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.2px;
  }
}
```

**Add:** Font-family override matching Horizon (or ensure it's set via layout/DM_Sans font loader).

---

## 3. PostCSS Config

### File: `web/postcss.config.mjs`

**Current:** Uses `@tailwindcss/postcss` (Tailwind v4)
**Horizon uses:** Traditional PostCSS with `tailwindcss` plugin (v3)

**Note:** If we keep v4, ensure all custom tokens work. If reverting to v3, change to:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

## 4. CSS Import Order

### Horizon's CSS Loading Pattern:
1. Font imports (Google Fonts)
2. `@tailwind base`
3. `@tailwind components`
4. `@tailwind utilities`
5. Custom `@layer base` rules

### Our Current Pattern:
1. `@import "tailwindcss"` (v4 syntax - combines base/components/utilities)
2. `@theme inline` (v4 custom tokens)
3. Custom `@layer base` rules

**Difference:** Horizon separates base/components/utilities, we use combined v4 syntax.

---

## 5. Dark Mode Configuration

### Horizon Pattern:
- Uses `dark:` variant prefix
- Checks for `.dark` class on parent elements
- Colors switch automatically via dark mode variants

### Our Setup:
- Uses `@custom-variant dark (&:is(.dark *))` (v4 syntax)
- Should work similarly, but verify dark mode colors are defined correctly

---

## 6. Critical Missing Tokens Summary

### Colors (most critical):
1. `navy-700`, `navy-800`, `navy-900` - Dark mode backgrounds
2. `brand-400`, `brand-500`, `brand-600`, `brand-700` - Primary accent
3. `lightPrimary` - Navbar/search backgrounds
4. `background-100`, `background-900` - Layout backgrounds

### Shadows:
1. `shadow-shadow-500` - Main component shadow

### Fonts:
1. `font-poppins` - Sidebar branding
2. `font-dm` - Body text

---

## 7. Recommended Implementation Order

1. **Add color definitions** to `tailwind.config.ts` → `theme.extend.colors`
   - Navy palette (10 shades)
   - Brand palette (10 shades)
   - `lightPrimary`
   - `background-100`, `background-900`

2. **Add shadow definitions** to `tailwind.config.ts` → `theme.extend.boxShadow`
   - `shadow-shadow-500`

3. **Add font families** to `tailwind.config.ts` → `theme.extend.fontFamily`
   - `poppins`
   - `dm` (or `dm-sans`)

4. **Add font imports** to `globals.css` (before `@import "tailwindcss"`)
   - Poppins import
   - DM Sans import

5. **Add base layer font override** to `globals.css` → `@layer base`
   - DM Sans as default font-family

6. **Test dark mode** - Verify navy colors work in dark mode

---

## 8. Notes

- **Tailwind v4 vs v3:** Our app uses v4, Horizon expects v3. We should define tokens in `tailwind.config.ts` rather than relying solely on CSS variables for Horizon tokens.

- **Font loading:** Horizon imports fonts via `<link>` in HTML, but we use `next/font/google` (DM_Sans). We should either:
  - Keep next/font and register it in Tailwind config as `font-dm`
  - Or add Google Fonts imports to CSS (may cause double-loading)

- **Color values:** Need to determine exact hex/rgb values for navy, brand, lightPrimary colors from Horizon's original config or infer from usage patterns.

---

## Deliverable

**Files to modify:**
1. `web/tailwind.config.ts` - Add colors, shadows, fonts to `theme.extend`
2. `web/src/app/globals.css` - Add font imports, base layer font override (if needed)

**Estimated changes:** ~100 lines across 2 files
