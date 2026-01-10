'use client';

/* eslint-disable */
import React from 'react';
import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { NavRoute } from './types';

/**
 * Helper function to ensure a path is absolute (starts with /).
 * Normalizes paths by:
 * - Trimming whitespace
 * - Ensuring exactly one leading slash
 * - Collapsing double slashes
 */
function toAbsPath(path: string): string {
  const trimmed = (path ?? '').trim();
  // Remove leading slashes, then add exactly one
  const withoutLeading = trimmed.replace(/^\/+/, '');
  // Add leading slash and collapse double slashes
  const normalized = `/${withoutLeading}`.replace(/\/{2,}/g, '/');
  return normalized;
}

/**
 * Custom Links component adapter for Horizon shell.
 * Extends Horizon's Links pattern to support '/dashboard' layout routes.
 */
export const SidebarLinks = (props: { routes: NavRoute[] }): React.ReactElement => {
  const pathname = usePathname();
  const { routes } = props;

  // Verifies if routeName is the one active (in browser input)
  const activeRoute = useCallback(
    (route: NavRoute) => {
      // For dashboard routes, check if pathname matches the route path
      if (route.layout === '/dashboard' || route.layout === 'dashboard') {
        if (!route.path) {
          // Dashboard home route: match exactly '/dashboard'
          return pathname === '/dashboard';
        }
        // Child routes: match '/dashboard/path' or '/dashboard/path/*'
        const routePath = toAbsPath(`dashboard/${route.path}`);
        return pathname === routePath || pathname.startsWith(`${routePath}/`);
      }
      // Fallback to original behavior for other layouts
      return pathname?.includes(route.path);
    },
    [pathname],
  );

  const createLinks = (routes: NavRoute[]) => {
    return routes.map((route, index) => {
      // Support both '/admin' and '/dashboard' layouts
      if (
        route.layout === '/admin' ||
        route.layout === 'admin' ||
        route.layout === '/auth' ||
        route.layout === 'auth' ||
        route.layout === '/rtl' ||
        route.layout === 'rtl' ||
        route.layout === '/dashboard' ||
        route.layout === 'dashboard'
      ) {
        // Construct href: normalize layout (remove leading slash if present) and path
        const layoutNormalized = (route.layout || '').replace(/^\/+/, '');
        const pathNormalized = (route.path || '').replace(/^\/+/, '');
        
        // Build absolute path: layout + optional path
        let href: string;
        if (!pathNormalized) {
          // Root route: just the layout (e.g., '/dashboard')
          href = toAbsPath(layoutNormalized);
        } else {
          // Child route: layout/path (e.g., '/dashboard/agents')
          href = toAbsPath(`${layoutNormalized}/${pathNormalized}`);
        }

        const isActive = activeRoute(route);
        const IconElement = route.icon;

        return (
          <Link key={index} href={href}>
            <div className="relative mb-3 flex hover:cursor-pointer">
              <li
                className="my-[3px] flex cursor-pointer items-center px-8"
              >
                <span
                  className={`${
                    isActive === true
                      ? 'font-bold text-brand-500 dark:text-white'
                      : 'font-medium text-gray-600'
                  }`}
                >
                  {IconElement ? IconElement : <LayoutDashboard className="h-6 w-6" />}
                  {' '}
                </span>
                <p
                  className={`leading-1 ml-4 flex ${
                    isActive === true
                      ? 'font-bold text-navy-700 dark:text-white'
                      : 'font-medium text-gray-600'
                  }`}
                >
                  {route.name}
                </p>
              </li>
              {isActive ? (
                <div className="absolute right-0 top-px h-9 w-1 rounded-lg bg-brand-500 dark:bg-brand-400" />
              ) : null}
            </div>
          </Link>
        );
      }
      return null;
    });
  };

  return <>{createLinks(routes)}</>;
};

export default SidebarLinks;
