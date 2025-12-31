import Link from "next/link";
import React from "react";
import { Plus, Settings, BookOpen, Shield } from "lucide-react";

export function QuickActionsCard() {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-3">
        <ActionItem
          href="/dashboard/agents/new"
          icon={Plus}
          label="New Agent"
          primary
        />
        <ActionItem
          href="/dashboard/knowledge"
          icon={BookOpen}
          label="Add Knowledge"
        />
        <ActionItem href="/dashboard/tools" icon={Settings} label="Configure Tools" />
        <ActionItem href="/dashboard/risk" icon={Shield} label="Risk Policies" />
      </div>
    </div>
  );
}

function ActionItem({ href, icon: Icon, label, primary }: any) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-medium transition-colors ${
        primary ? "bg-black text-white hover:bg-gray-800" : "bg-gray-50 text-gray-700 hover:bg-gray-100 border"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}