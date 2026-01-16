'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Bell, Info, Moon, Sun } from 'lucide-react';
import ProfileDropdown from './ProfileDropdown';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface DashboardHeaderProps {
  breadcrumb?: string;
  title: string;
}

/**
 * Horizon Free Dashboard Header
 * Left: breadcrumb + big title
 * Right: rounded capsule with search, bell, info, moon, avatar
 */
export default function DashboardHeader({ breadcrumb = 'Pages / Main Dashboard', title }: DashboardHeaderProps) {
  const [searchValue, setSearchValue] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState('/horizon/img/avatars/avatar4.png');
  const profileDropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch user avatar on mount
  useEffect(() => {
    async function fetchAvatar() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('auth_user_id', user.id)
            .limit(1);
          if (profiles && profiles[0]?.avatar_url) {
            setAvatarSrc(profiles[0].avatar_url);
          }
        }
      } catch (error) {
        // Silently fail, use default avatar
      }
    }
    fetchAvatar();
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

  return (
    <div className="relative z-50 mb-5 mt-3 flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-6">
      {/* Left: Breadcrumb + Title */}
      <div className="min-w-0 flex-1">
        {/* Breadcrumb */}
        <p className="text-sm font-medium text-gray-600 dark:text-white/60 mb-1">
          {breadcrumb}
        </p>
        {/* Big Title */}
        <h4 className="text-3xl font-bold text-navy-700 dark:text-white whitespace-nowrap">
          {title}
        </h4>
      </div>

      {/* Right: Rounded Capsule with Search + Icons + Avatar */}
      <div className="mt-4 flex items-center justify-end min-w-[420px] md:mt-0">
        <div className="flex h-[61px] w-[420px] items-center justify-between rounded-full bg-white px-2 shadow-shadow-100 dark:!bg-navy-800 dark:shadow-none">
          {/* Search section */}
          <div className="flex h-[45px] w-[240px] items-center gap-2 rounded-full bg-lightPrimary px-4 dark:bg-navy-900/20">
            <span className="text-gray-500 dark:text-white/70">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search..."
              data-testid="dashboard-search-input"
              className="h-full w-full bg-transparent text-sm font-medium text-navy-700 outline-none placeholder:font-medium placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/50"
            />
          </div>

          {/* Right icons */}
          <div className="flex h-full items-center">
            <div className="mx-2 h-6 w-px bg-gray-200 dark:bg-white/10" />

            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>

            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10"
              aria-label="Information"
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 dark:text-white/70 dark:hover:bg-white/10"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            {/* Avatar Dropdown */}
            <div className="relative ml-2" ref={profileDropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-white dark:ring-navy-700"
                aria-label="Profile menu"
              >
                <img
                  src={avatarSrc}
                  alt="Profile"
                  className="h-full w-full rounded-full object-cover"
                  onError={(e) => {
                    // Fallback to default avatar on error
                    (e.target as HTMLImageElement).src = '/horizon/img/avatars/avatar4.png';
                  }}
                />
              </button>
              {showProfileDropdown && (
                <div className="absolute right-0 top-12 z-[9999]">
                  <ProfileDropdown avatarSrc={avatarSrc} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
