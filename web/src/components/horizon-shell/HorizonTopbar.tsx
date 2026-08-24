'use client';

import ProfileWidget from './ProfileWidget';
import { useMobileNavOptional } from './MobileNavContext';

/**
 * The authenticated topbar (Sprint 9 · T1).
 *
 * **It renders no page title and no breadcrumb.** Each page owns its own heading via
 * `PageHeader`, so the topbar carrying a second one meant every screen shipped two
 * competing H1s — and any route the old `routeMeta` map didn't know (employee,
 * conversation, contact, ticket) title-cased its URL segment, printing a UUID as the
 * page title. The map, the derivation and the heading are all gone; the topbar is now
 * only chrome: mobile menu, theme toggle, account menu.
 */
export default function HorizonTopbar() {
  const mobileNav = useMobileNavOptional();
  const toggleMobileNav = mobileNav?.toggleMobileNav;

  return (
    // Sticky on mobile only (as before), so the menu button stays reachable while scrolling
    // without the capsule floating over desktop content.
    <div className="sticky top-0 z-50 mb-2 mt-3 flex justify-end lg:static lg:z-auto">
      <ProfileWidget onToggleMobileNav={toggleMobileNav} />
    </div>
  );
}
