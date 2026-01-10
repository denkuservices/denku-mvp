'use client';

import { useEffect } from 'react';

/**
 * Client component that injects Horizon's compiled CSS bundle into the document head.
 * This ensures Horizon's 1:1 styling is applied to authenticated app routes.
 * Loads immediately on mount to minimize FOUC.
 */
export default function HorizonStylesheet() {
  useEffect(() => {
    // Check if link already exists
    if (typeof document === 'undefined') return;
    
    const existingLink = document.getElementById('horizon-bundle-css');
    if (existingLink) {
      return; // Already added
    }

    // Create and inject link tag immediately
    const link = document.createElement('link');
    link.id = 'horizon-bundle-css';
    link.rel = 'stylesheet';
    link.href = '/horizon/horizon.bundle.css';
    link.as = 'style';
    // Insert at the beginning of head to ensure it loads early
    document.head.insertBefore(link, document.head.firstChild);
  }, []);

  return null;
}
