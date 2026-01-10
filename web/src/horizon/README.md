# Horizon UI Free - Isolated Preview

This directory contains Horizon UI Free Admin Dashboard source files for isolated preview.

## Required Files

To complete the setup, you need to copy the Horizon UI Free Admin Dashboard source files into this directory structure:

```
src/horizon/
  app/
    admin/
      layout.tsx
      page.tsx
  components/
    [Horizon components]
  contexts/
    [Horizon contexts]
  styles/
    App.css
    index.css
  assets/
    [if any assets exist]
```

## Source

Horizon UI Free can be downloaded from:
- https://horizon-ui.com/
- Or from their GitHub repository

## Notes

- Files should be copied as-is without modification
- Component imports may need path adjustments to work within Next.js app directory structure
- CSS imports will be scoped to the preview route only

