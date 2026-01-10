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
};
