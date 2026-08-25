'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { signOutAction } from '@/app/(app)/dashboard/actions';
import { getSupportMailto } from '@/lib/support';

interface ProfileDropdownProps {
  /**
   * Resolved by `useProfileIdentity` in the parent widget. Sprint 9 · T3: this used to run
   * its own duplicate profile query; one fetch now serves the whole topbar.
   */
  firstName?: string;
}

/**
 * Account menu for the authenticated topbar.
 */
export default function ProfileDropdown({ firstName = 'there' }: ProfileDropdownProps) {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) {
        console.error("[ProfileDropdown] Sign out failed:", result.error);
        return;
      }
      // Force full page reload to /login for clean navigation and correct UI rendering
      window.location.assign("/login");
    });
  };

  return (
    <div className="relative z-[9999] flex h-auto w-56 flex-col justify-start rounded-[20px] bg-white bg-cover bg-no-repeat shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none pb-3">
      {/* Greeting - non-clickable */}
      <div className="ml-4 mt-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-navy-700 dark:text-white">
            👋 Hey, {firstName}
          </p>
        </div>
      </div>

      <div className="mt-3 h-px w-full bg-gray-200 dark:bg-white/20" />

      {/* Menu items */}
      <div className="ml-4 mt-3 flex flex-col">
        <Link
          href="/dashboard/settings/account/profile"
          className="text-sm text-gray-800 dark:text-white hover:dark:text-white"
        >
          Account Settings
        </Link>
        <Link
          href="/dashboard/settings/workspace/general"
          className="mt-3 text-sm text-gray-800 dark:text-white hover:dark:text-white"
        >
          Workspace Settings
        </Link>
        <Link
          href="/dashboard/settings/workspace/billing"
          className="mt-3 text-sm text-gray-800 dark:text-white hover:dark:text-white"
        >
          Billing & Usage
        </Link>
        <a
          href={getSupportMailto("Denku support request")}
          className="mt-3 text-sm text-gray-800 dark:text-white hover:dark:text-white"
        >
          Help / Support
        </a>

        {/* Divider */}
        <div className="mt-3 h-px w-full bg-gray-200 dark:bg-white/20" />

        {/* Log out */}
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="mt-3 text-left text-sm font-medium text-red-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
