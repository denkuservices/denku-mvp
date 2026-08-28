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

/** The layouts this sidebar knows how to build an href for. */
function isSupportedLayout(layout?: string): boolean {
  const l = (layout || '').replace(/^\/+/, '');
  return l === 'admin' || l === 'auth' || l === 'rtl' || l === 'dashboard';
}

/**
 * A route's absolute href: layout + optional path (e.g. 'dashboard' + 'settings/account').
 *
 * An explicit `href` wins, for the item whose destination is not the same thing as the section it
 * marks active — Settings highlights everything under `/dashboard/settings` but navigates to the
 * first section, because `/dashboard/settings` itself is only a redirect.
 */
function routeHref(route: NavRoute): string {
  if (route.href) return toAbsPath(route.href);
  const layoutNormalized = (route.layout || '').replace(/^\/+/, '');
  const pathNormalized = (route.path || '').replace(/^\/+/, '');
  return pathNormalized
    ? toAbsPath(`${layoutNormalized}/${pathNormalized}`)
    : toAbsPath(layoutNormalized);
}

/**
 * Custom Links component adapter for Horizon shell.
 * Extends Horizon's Links pattern to support '/dashboard' layout routes.
 *
 * A route may carry `items` — a one-level sub-menu that opens **in the sidebar** instead of as a
 * second navigation rail inside the page. Settings is the route that has one: its sections used
 * to be a vertical rail rendered into every settings page, which narrowed the forms it pointed at
 * and duplicated navigation the sidebar was already there to do. Sub-items are labels only (the
 * one-line descriptions belong on the pages themselves), and the group opens by itself whenever
 * you are inside it — nothing to click open, nothing left open behind you.
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

  /**
   * Which sub-item owns the current pathname — longest match wins.
   *
   * `/dashboard/settings/workspace` is a prefix of `/dashboard/settings/workspace/billing`, so a
   * first-match rule would light up Workspace while you are changing your card.
   */
  const activeChildHref = useCallback(
    (items: NavRoute[]): string | null => {
      let best: string | null = null;
      for (const item of items) {
        const href = routeHref(item);
        const hit = pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
        if (hit && (!best || href.length > best.length)) best = href;
      }
      return best;
    },
    [pathname],
  );

  const createLinks = (routes: NavRoute[]) => {
    return routes.map((route, index) => {
      // Support both '/admin' and '/dashboard' layouts
      if (isSupportedLayout(route.layout)) {
        const href = routeHref(route);

        const isActive = activeRoute(route);
        const IconElement = route.icon;

        const items = route.items ?? [];
        const childHref = items.length > 0 ? activeChildHref(items) : null;
        // Open while you are inside the section — including on a sub-item routed outside the
        // parent's own path (Channels is configured from Settings but lives at /dashboard/channels).
        const expanded = items.length > 0 && (isActive || childHref !== null);

        return (
          <React.Fragment key={index}>
            <Link href={href}>
              <div className={`relative flex hover:cursor-pointer ${expanded ? 'mb-1' : 'mb-3'}`}>
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

            {expanded ? (
              // Plain elements rather than a nested <ul>: these render inside the sidebar's own
              // list, and a second list without an <li> wrapping it is markup nobody can rely on.
              <div className="mb-3">
                {items.map((child) => {
                  const cHref = routeHref(child);
                  const childActive = cHref === childHref;
                  return (
                    <Link key={cHref} href={cHref} aria-current={childActive ? 'page' : undefined}>
                      <div className="relative flex hover:cursor-pointer">
                        <span
                          className={`flex w-full items-center py-[6px] pl-[72px] pr-8 text-sm transition-colors ${
                            childActive
                              ? 'font-bold text-navy-700 dark:text-white'
                              : 'font-medium text-gray-600 hover:text-navy-700 dark:hover:text-white'
                          }`}
                        >
                          {/* The dot carries the current sub-item on its own — label weight alone
                              is too quiet this far in from the icon column. */}
                          <span
                            aria-hidden="true"
                            className={`absolute left-[52px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
                              childActive
                                ? 'bg-brand-500 dark:bg-brand-400'
                                : 'bg-gray-300 dark:bg-white/20'
                            }`}
                          />
                          {child.name}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </React.Fragment>
        );
      }
      return null;
    });
  };

  return <>{createLinks(routes)}</>;
};

export default SidebarLinks;
