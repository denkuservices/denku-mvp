import { NavRoute } from './types';

/**
 * Adapter navigation utilities for Horizon shell.
 * Extends Horizon's navigation to work correctly with '/dashboard' layout routes.
 * 
 * NOTE: This function is deterministic and works on both server and client.
 * Pathname matching doesn't require browser APIs, so no window/document checks needed.
 */
export const findCurrentRoute = (
  routes: NavRoute[],
  pathname: string,
): NavRoute | null => {
  if (!pathname) return null;

  for (let route of routes) {
    if (!!route.items) {
      const found = findCurrentRoute(route.items, pathname);
      if (!!found) return found;
    }
    
    // For dashboard routes, match more precisely (handle both 'dashboard' and '/dashboard' layout)
    const layout = route.layout?.replace(/^\/+/, '') || '';
    if (layout === 'dashboard') {
      if (!route.path) {
        // Dashboard home: must match exactly '/dashboard'
        if (pathname === '/dashboard') return route;
      } else {
        // Child routes: match '/dashboard/path' or '/dashboard/path/*'
        const routePath = `/dashboard/${route.path}`;
        if (pathname === routePath || pathname.startsWith(`${routePath}/`)) {
          return route;
        }
      }
    } else {
      // Original Horizon behavior for other layouts
      if (pathname?.match(route.path) && route) return route;
    }
  }
  return null;
};

export const getActiveRoute = (routes: NavRoute[], pathname: string): string => {
  const route = findCurrentRoute(routes, pathname);
  return route?.name || 'Dashboard';
};

export const getActiveNavbar = (
  routes: NavRoute[],
  pathname: string,
): boolean => {
  const route = findCurrentRoute(routes, pathname);
  return route?.secondary || false;
};
