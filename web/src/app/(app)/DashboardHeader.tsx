import React from "react";
import Link from "next/link";

interface DashboardHeaderProps {
  userName: string;
  orgName: string;
}

export function DashboardHeader({ userName, orgName }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* LEFT */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Mission Control
        </h1>
        <p className="text-sm text-muted-foreground">
          Welcome back,{" "}
          <span className="font-medium text-foreground">{userName}</span>
        </p>

        {/* NAV */}
        <div className="mt-2 flex gap-4 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Overview
          </Link>

          <Link
            href="/dashboard/agents"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Agents
          </Link>

          <Link
            href="/dashboard/leads"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Leads
          </Link>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 px-3 py-1.5 rounded-full border">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>{orgName}</span>
        <span className="mx-1 text-gray-300">|</span>
        <span>System Operational</span>
      </div>
    </div>
  );
}
