'use client';

import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Menu, User } from 'lucide-react';
import ProfileDropdown from './ProfileDropdown';
import { useProfileIdentity } from './useProfileIdentity';

interface ProfileWidgetProps {
  onToggleMobileNav?: () => void;
}

/**
 * The authenticated topbar capsule (Sprint 9 · T1–T3).
 *
 * Holds exactly three things, and nothing decorative: the mobile menu button, the
 * theme toggle, and the account menu. The global search box, the notifications bell
 * and the info button were removed — all three were controls a user could focus and
 * click that did nothing (the search stored typed text and never read it back).
 *
 * Identity comes from the signed-in profile: the user's own avatar when they have one,
 * otherwise their initials. Never a stock template image.
 */
export default function ProfileWidget({ onToggleMobileNav }: ProfileWidgetProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const identity = useProfileIdentity();

  // Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    let isDark = false;

    if (savedTheme === 'dark') {
      isDark = true;
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      isDark = false;
      document.documentElement.classList.remove('dark');
    } else {
      // No saved theme, check system preference
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        document.documentElement.classList.add('dark');
      }
    }

    setIsDarkMode(isDark);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const showImage = Boolean(identity.avatarUrl) && !avatarFailed;

  return (
    <div className="flex items-center justify-end">
      <div className="flex h-[61px] flex-nowrap items-center gap-1 rounded-full bg-white px-2 shadow-shadow-100 dark:!bg-navy-800 dark:shadow-none">
        {/* Mobile menu button — hidden on desktop (do not remove). */}
        {onToggleMobileNav && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleMobileNav();
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white/70 dark:hover:bg-white/10 lg:!hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleDarkMode}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white/70 dark:hover:bg-white/10"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Account menu */}
        <div className="relative shrink-0" ref={profileDropdownRef}>
          <button
            type="button"
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-sm font-semibold text-white ring-2 ring-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:ring-navy-700"
            aria-label="Account menu"
            aria-expanded={showProfileDropdown}
          >
            {showImage ? (
              <img
                src={identity.avatarUrl as string}
                alt=""
                className="h-full w-full rounded-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : identity.initials ? (
              <span aria-hidden="true">{identity.initials}</span>
            ) : (
              <User className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          {showProfileDropdown && (
            <div className="absolute right-0 top-12 z-[9999]">
              <ProfileDropdown firstName={identity.firstName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
