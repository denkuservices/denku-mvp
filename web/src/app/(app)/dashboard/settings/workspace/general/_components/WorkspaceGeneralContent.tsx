"use client";

import { useState, useEffect } from "react";
import { WorkspaceGeneralForm } from "./WorkspaceGeneralForm";
import { RuntimeCard } from "./RuntimeCard";

type OrganizationSettings = {
  id: string;
  org_id: string;
  name: string | null;
  default_timezone: string | null;
  default_language: string | null;
  billing_email: string | null;
  workspace_status: "active" | "paused";
  paused_at: string | null;
  paused_reason: "manual" | "hard_cap" | "past_due" | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceGeneralContentProps = {
  initialSettings: OrganizationSettings | null;
  role: "owner" | "admin" | "viewer";
  orgId: string;
  orgName: string;
  accessLabel: string;
  workspaceStatus: "active" | "paused";
};

export function WorkspaceGeneralContent({
  initialSettings,
  role,
  orgId,
  orgName,
  accessLabel,
  workspaceStatus: initialWorkspaceStatus,
}: WorkspaceGeneralContentProps) {
  // Shared timezone state that both form and Runtime card use
  const [timezone, setTimezone] = useState<string | null>(
    initialSettings?.default_timezone || null
  );

  // Shared workspace status state
  const [workspaceStatus, setWorkspaceStatus] = useState<"active" | "paused">(initialWorkspaceStatus);

  // Sync with server props when they change (from router.refresh())
  useEffect(() => {
    setTimezone(initialSettings?.default_timezone || null);
  }, [initialSettings?.default_timezone]);

  useEffect(() => {
    setWorkspaceStatus(initialWorkspaceStatus);
  }, [initialWorkspaceStatus]);

  // Listen for updates from WorkspaceControlsCard
  useEffect(() => {
    (window as any).__updateRuntimeWorkspaceStatus = (newStatus: "active" | "paused") => {
      setWorkspaceStatus(newStatus);
    };
    return () => {
      delete (window as any).__updateRuntimeWorkspaceStatus;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
      {/* Identity */}
      <section className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-base font-semibold text-zinc-900">Workspace identity</p>
          <p className="mt-1 text-sm text-zinc-600">
            Used across your agents and messaging. Company name can be injected into greetings automatically.
          </p>
        </div>

        <div className="mt-6">
          <WorkspaceGeneralForm
            initialSettings={initialSettings}
            role={role}
            orgId={orgId}
            orgName={orgName}
            onTimezoneUpdate={setTimezone}
          />
        </div>
      </section>

      {/* Runtime */}
      <RuntimeCard
        timezone={timezone}
        accessLabel={accessLabel}
        workspaceStatus={workspaceStatus}
      />
    </div>
  );
}

