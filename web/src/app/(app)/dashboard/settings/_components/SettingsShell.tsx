"use client";

import * as React from "react";
import Link from "next/link";
import { PausedWorkspaceBanner } from "@/app/(app)/dashboard/_components/PausedWorkspaceBanner";

type Crumb = { label: string; href?: string };

export function SettingsShell({
  title,
  subtitle,
  crumbs,
  children,
  workspaceStatus,
}: {
  title?: string;
  subtitle?: string;
  crumbs?: Crumb[];
  children: React.ReactNode;
  workspaceStatus?: "active" | "paused";
}) {
  return (
    <div className="p-6 space-y-8">
      {/* Header - only render if title provided */}
      {title && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gradient-to-b from-white to-gray-50 dark:to-navy-900 p-6 shadow-sm">
          {crumbs && crumbs.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              {crumbs.map((c, idx) => (
                <React.Fragment key={`${c.label}-${idx}`}>
                  {c.href ? (
                    <Link href={c.href} className="hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-navy-700 dark:text-white font-medium">{c.label}</span>
                  )}
                  {idx < crumbs.length - 1 ? <span className="text-gray-400">/</span> : null}
                </React.Fragment>
              ))}
            </div>
          ) : null}

          <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p> : null}
        </div>
      )}

      {/* Paused workspace banner */}
      {workspaceStatus && (
        <PausedWorkspaceBanner workspaceStatus={workspaceStatus} />
      )}

      {children}
    </div>
  );
}
