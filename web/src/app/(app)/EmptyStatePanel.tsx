import Link from "next/link";
import React from "react";
import { Bot } from "lucide-react";

export function EmptyStatePanel() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm mb-4">
        <Bot className="h-6 w-6 text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold">No agents deployed</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Your mission control is empty. Deploy your first AI agent to start monitoring activity.
      </p>
      <div className="mt-6">
        <Link href="/dashboard/agents/new" className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Create Agent
        </Link>
      </div>
    </div>
  );
}