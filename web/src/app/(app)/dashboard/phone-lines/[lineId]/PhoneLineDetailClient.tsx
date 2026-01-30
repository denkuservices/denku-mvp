"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LineConfigurationTab } from "./_tabs/LineConfigurationTab";
import { AssignedAITab } from "./_tabs/AssignedAITab";
import { AdvancedTab } from "./_tabs/AdvancedTab";
import { DeletePhoneLineDialog } from "../_components/DeletePhoneLineDialog";
import { PhoneLineSummaryBar } from "./_components/PhoneLineSummaryBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type AgentForAdvanced = {
  vapi_assistant_id: string | null;
  system_prompt_override: string | null;
} | null;

interface PhoneLineDetailClientProps {
  line: {
    id: string;
    phone_number_e164: string | null;
    status: string | null;
    line_type: string | null;
    display_name: string | null;
    language_mode: string | null;
    tools_create_ticket: boolean | null;
    tools_book_appointment: boolean | null;
    first_message: string | null;
    vapi_phone_number_id?: string | null;
    assigned_agent_id?: string | null;
  };
  orgId: string;
  agentForAdvanced: AgentForAdvanced;
  isPreviewMode?: boolean;
  todayInboundCalls?: number;
  lastCallFormatted?: string;
  capacityLabel?: string;
}

type Tab = "configuration" | "assigned-ai" | "advanced";

export function PhoneLineDetailClient({
  line: initialLine,
  orgId,
  agentForAdvanced,
  isPreviewMode = false,
  todayInboundCalls = 0,
  lastCallFormatted = "—",
  capacityLabel = "Preview",
}: PhoneLineDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("configuration");
  const [line, setLine] = useState(initialLine);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  const handleTabClick = useCallback((tab: Tab) => {
    if (activeTab === "configuration" && configDirty) {
      setPendingTab(tab);
      setDiscardConfirmOpen(true);
    } else {
      setActiveTab(tab);
    }
  }, [activeTab, configDirty]);

  const handleDiscardConfirm = useCallback(() => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
      setConfigDirty(false);
    }
    setDiscardConfirmOpen(false);
  }, [pendingTab]);

  const handleDiscardCancel = useCallback(() => {
    setPendingTab(null);
    setDiscardConfirmOpen(false);
  }, []);

  // Show save toast
  useEffect(() => {
    if (saveToast) {
      const timer = setTimeout(() => setSaveToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveToast]);

  const handleSaveDisplayName = async (newName: string) => {
    const res = await fetch(`/api/phone-lines/${line.id}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: newName || null }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    setLine((prev) => ({ ...prev, display_name: newName || null }));
    setSaveToast("Saved");
    router.refresh();
  };

  const handleCopyPhoneNumber = () => {
    if (line.phone_number_e164) {
      navigator.clipboard.writeText(line.phone_number_e164);
      setSaveToast("Phone number copied");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <PhoneLineSummaryBar
        line={line}
        todayInboundCalls={todayInboundCalls}
        lastCallFormatted={lastCallFormatted}
        capacityLabel={capacityLabel}
        isPreviewMode={isPreviewMode}
        onCopyPhoneNumber={handleCopyPhoneNumber}
        onSaveDisplayName={handleSaveDisplayName}
        onDeleteClick={() => setDeleteDialogOpen(true)}
        saveToast={saveToast}
      />

      {/* Save Toast */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-brand-500 text-white px-4 py-2 text-sm shadow-lg">
          {saveToast}
        </div>
      )}

      <DeletePhoneLineDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        lineId={line.id}
        onConfirm={async () => {
          // Prevent API call in preview mode
          if (isPreviewMode) {
            throw new Error("Upgrade to activate this feature");
          }
          const res = await fetch(`/api/phone-lines/${line.id}`, { method: "DELETE" });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            throw new Error(data?.error || "Failed to delete phone line");
          }
          router.refresh();
        }}
        onDeleted={() => {
          router.push("/dashboard/phone-lines");
          router.refresh();
        }}
      />

      <Dialog open={discardConfirmOpen} onOpenChange={(open) => !open && handleDiscardCancel()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in Line Configuration. Discard them and switch tabs?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-3">
            <Button variant="outline" onClick={handleDiscardCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDiscardConfirm}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white dark:border-white/20 dark:bg-navy-800">
        <div className="flex border-b border-gray-200 dark:border-white/10">
          <button
            onClick={() => handleTabClick("configuration")}
            className={`relative -mb-px px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "configuration"
                ? "text-brand-500 border-b-2 border-brand-500 dark:text-brand-400"
                : "text-gray-600 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            Line Configuration
          </button>
          <button
            onClick={() => handleTabClick("assigned-ai")}
            className={`relative -mb-px px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "assigned-ai"
                ? "text-brand-500 border-b-2 border-brand-500 dark:text-brand-400"
                : "text-gray-600 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            Assigned AI
          </button>
          <button
            onClick={() => handleTabClick("advanced")}
            className={`relative -mb-px px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "advanced"
                ? "text-brand-500 border-b-2 border-brand-500 dark:text-brand-400"
                : "text-gray-600 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            Advanced
          </button>
        </div>

        <div className="p-6">
          {activeTab === "configuration" && (
            <LineConfigurationTab
              line={line}
              onUpdate={(updates) => {
                setLine((prev) => ({ ...prev, ...updates }));
                setSaveToast("Saved");
                router.refresh();
              }}
              onDirtyChange={setConfigDirty}
              onSaveError={() => setSaveToast("Couldn't save changes")}
            />
          )}
          {activeTab === "assigned-ai" && (
            <AssignedAITab
              line={line}
              onUpdate={(updates) => {
                setLine((prev) => ({ ...prev, ...updates }));
                setSaveToast("Saved");
                router.refresh();
              }}
              onSaveError={() => setSaveToast("Couldn't save changes")}
            />
          )}
          {activeTab === "advanced" && (
            <AdvancedTab
              lineId={line.id}
              line={line}
              orgId={orgId}
              agentForAdvanced={agentForAdvanced}
              isPreviewMode={isPreviewMode}
              onSaveToast={() => setSaveToast("Saved")}
              onResetToast={() => setSaveToast("Reset")}
              onSaveError={() => setSaveToast("Couldn't save changes")}
              onSaved={() => router.refresh()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
