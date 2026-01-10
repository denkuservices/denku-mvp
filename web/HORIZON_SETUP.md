# Horizon UI Preview Setup Guide

## Overview

This document describes the isolated Horizon UI Free Admin Dashboard preview setup. The preview route (`/horizon-preview`) will render Horizon UI exactly as it appears in the original demo, without any modifications.

## Current Status

✅ **Completed:**
- Created isolated namespace directory: `src/horizon/`
- Created preview route: `src/app/horizon-preview/`
- Set up layout and page structure
- Tailwind config is ready (no conflicts expected)

⏳ **Pending:**
- Horizon UI Free source files need to be copied to `src/horizon/`
- CSS imports need to be uncommented in `src/app/horizon-preview/layout.tsx`
- Component imports need to be updated in `src/app/horizon-preview/page.tsx`

## Directory Structure

```
web/
├── src/
│   ├── horizon/                    # ← Horizon UI source files go here
│   │   ├── app/
│   │   │   └── admin/
│   │   │       ├── layout.tsx      # Horizon admin layout
│   │   │       └── page.tsx        # Horizon admin dashboard page
│   │   ├── components/             # Horizon components
│   │   ├── contexts/               # Horizon contexts
│   │   ├── styles/
│   │   │   ├── index.css
│   │   │   └── App.css
│   │   └── README.md
│   │
│   └── app/
│       └── horizon-preview/        # ← Preview route
│           ├── layout.tsx          # Isolated layout (imports Horizon CSS)
│           └── page.tsx            # Renders Horizon admin page
│
└── tailwind.config.ts              # Should support Horizon styles
```

## Steps to Complete Setup

### 1. Obtain Horizon UI Free Source Files

Download Horizon UI Free Admin Dashboard from:
- Official site: https://horizon-ui.com/
- Or GitHub repository (if available)

### 2. Copy Files to Isolated Namespace

Copy Horizon UI source files to `src/horizon/` maintaining the original structure:
- Admin layout and page components
- All UI components
- Context providers
- CSS/stylesheet files
- Assets (if any)

### 3. Update Preview Route

Once files are in place:

**In `src/app/horizon-preview/layout.tsx`:**
- Uncomment and adjust CSS import paths
- Ensure styles are scoped (imported here, not globally)

**In `src/app/horizon-preview/page.tsx`:**
- Replace placeholder with actual Horizon UI imports:
  ```tsx
  import HorizonAdminLayout from "@/horizon/app/admin/layout";
  import HorizonAdminPage from "@/horizon/app/admin/page";
  
  export default function HorizonPreviewPage() {
    return (
      <HorizonAdminLayout>
        <HorizonAdminPage />
      </HorizonAdminLayout>
    );
  }
  ```

### 4. Adjust Import Paths (if needed)

Horizon UI components may need path adjustments to work within Next.js App Router:
- Update relative imports to use `@/horizon/` alias
- Ensure Next.js can resolve all component imports
- Fix any TypeScript errors related to module resolution

### 5. Verify Tailwind Compatibility

The current Tailwind config should support Horizon UI, but verify:
- No conflicting utility classes
- Horizon-specific classes are recognized
- Custom Tailwind config from Horizon (if any) doesn't break existing app

### 6. Test Preview Route

Visit `/horizon-preview` and verify:
- ✅ Horizon UI Admin Dashboard renders
- ✅ Sidebar, navbar, cards, charts match original
- ✅ Spacing, shadows, typography are identical
- ✅ No console errors
- ✅ Existing routes still work

## Success Criteria

The preview is ready when:
1. `/horizon-preview` shows Horizon UI Admin Dashboard
2. Visual match is 95%+ identical to original Horizon demo
3. No existing routes are broken
4. No runtime errors or warnings

## Notes

- **Isolation:** Horizon UI styles are imported only in the preview layout, not globally
- **No Modifications:** Horizon UI files should remain unchanged (no adaptations)
- **Validation Only:** This preview is for validation only - no migration logic yet

## Next Steps

After successful preview setup:
1. Document any Tailwind/CSS adjustments needed
2. Report completion
3. Wait for next instruction (do NOT proceed with migration yet)

