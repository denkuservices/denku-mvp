import React from 'react';

/**
 * Navigation route type for HorizonShell.
 * Self-contained type replacing @/horizon/types/navigation IRoute.
 */
export type NavRoute = {
  name: string;
  path: string;
  layout?: string;
  icon?: React.ReactNode;
  items?: NavRoute[];
  secondary?: boolean;
  /**
   * Where the item navigates, when that differs from the section it highlights.
   *
   * Settings is the case: `path` stays `settings` so the item is active (and its sub-menu open)
   * anywhere under `/dashboard/settings`, while the click goes straight to the first section.
   * `/dashboard/settings` is only a redirect to that section — sending people through it makes
   * the sidebar bounce them via a page with nothing on it.
   */
  href?: string;
};
