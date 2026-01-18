'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { signOutAction } from '@/app/(app)/dashboard/actions';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface ProfileDropdownProps {
  avatarSrc?: string;
}

/**
 * Profile dropdown menu component for Horizon Navbar.
 * Fetches user data client-side to avoid hydration issues.
 */
export default function ProfileDropdown({ avatarSrc = '/horizon/img/avatars/avatar4.png' }: ProfileDropdownProps) {
  // Start with 'there' as initial value to avoid hydration mismatch
  const [firstName, setFirstName] = useState<string>('there');
  const [isPending, startTransition] = useTransition();

  // Fetch user data on mount (client-side only)
  useEffect(() => {
    async function fetchUserData() {
      try {
        // Create browser client with proper cookie handling
        const supabase = createSupabaseBrowserClient();
        
        // Get user session first - handle missing session gracefully
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[ProfileDropdown] Auth error:', userError);
          }
          setFirstName('there');
          return;
        }
        
        if (!user) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ProfileDropdown] No user found in session');
          }
          setFirstName('there');
          return;
        }

        // Try to get full_name from profiles table
        // Use same pattern as other components: select array, then take first item
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('auth_user_id', user.id)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        if (profileError) {
          console.error('[ProfileDropdown] Failed to fetch profile:', profileError);
          setFirstName('there');
          return;
        }

        // Get first profile from array (handle multiple profiles gracefully)
        const profile = profiles && profiles.length > 0 ? profiles[0] : null;

        // Dev-only debug log to help diagnose RLS/profile mismatch
        if (process.env.NODE_ENV === 'development' && (!profile || !profile.full_name)) {
          console.log('[ProfileDropdown] Profile fetch result:', {
            userId: user.id,
            profilesCount: profiles?.length || 0,
            profile: profile,
            full_name: profile?.full_name,
            error: profileError
          });
        }

        // Determine firstName: first word of full_name > "there" (no email fallback)
        let displayFirstName: string | null = null;
        
        // Extract first name from full_name (if exists and not empty)
        if (profile?.full_name?.trim()) {
          const trimmedName = profile.full_name.trim();
          const firstWord = trimmedName.split(' ')[0];
          if (firstWord) {
            // Capitalize first letter, rest lowercase
            displayFirstName = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
          }
        }
        
        // Fallback to "there" only if full_name is missing/null/empty
        const finalFirstName = displayFirstName || 'there';
        setFirstName(finalFirstName);
        
        // Dev-only log to confirm state update
        if (process.env.NODE_ENV === 'development') {
          console.log('[ProfileDropdown] Setting firstName:', finalFirstName, 'from full_name:', profile?.full_name);
        }
      } catch (error) {
        // Silently fail - firstName will default to "there"
        console.error('[ProfileDropdown] Failed to fetch user data:', error);
        setFirstName('there');
      }
    }

    fetchUserData();
  }, []);

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
        <Link
          href="/contact"
          className="mt-3 text-sm text-gray-800 dark:text-white hover:dark:text-white"
        >
          Help / Support
        </Link>

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
