"use client";

import { useTransition } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, LogOut, UserCircle, Shield, Settings } from "lucide-react";

interface AccountMenuProps {
  userEmail: string | null;
  userName: string | null;
  orgName: string | null;
  userRole: string | null;
}

export function AccountMenu({ userEmail, userName, orgName, userRole }: AccountMenuProps) {
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) {
        console.error("[AccountMenu] Sign out failed:", result.error);
        return;
      }
      // Force full page reload to /login for clean navigation and correct UI rendering
      window.location.assign("/login");
    });
  };

  const displayName = userName || userEmail || "Signed in";
  const displayOrg = orgName || "Workspace";
  const roleLabel = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-full p-0"
          aria-label="Account menu"
        >
          <User className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        {/* Identity / Status Section */}
        <div className="px-3 py-2.5 border-b">
          <div className="text-sm font-medium text-foreground">{displayName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{displayOrg}</div>
          {roleLabel && (
            <div className="mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground">
                {roleLabel}
              </span>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="p-1">
          <Link
            href="/dashboard/settings/account/profile"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <UserCircle className="h-4 w-4" />
            <span>Profile</span>
          </Link>
          <Link
            href="/dashboard/settings/account/security"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Shield className="h-4 w-4" />
            <span>Security</span>
          </Link>
          <Link
            href="/dashboard/settings/workspace/general"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" />
            <span>Workspace settings</span>
          </Link>
        </div>

        {/* Divider + Sign out */}
        <div className="border-t p-1">
          <button
            onClick={handleSignOut}
            disabled={isPending}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

