"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";

type TicketDetailFormProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  field: "subject" | "description" | "status" | "priority";
  value: string;
  label: string;
  type?: "text" | "textarea" | "select";
  options?: string[];
};

export function TicketDetailForm({
  ticketId,
  orgId,
  userId,
  field,
  value,
  label,
  type = "text",
  options,
}: TicketDetailFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isPending, startTransition] = useTransition();

  // Safe error parser - never crashes on undefined/null/unknown error types
  function parseActionError(err: unknown): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message || "Unknown error";
    if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
      return (err as any).message;
    }
    return "Unknown error";
  }

  const handleSave = () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      try {
        const patch: Record<string, string | null> = {};
        patch[field] = editValue || null;

        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch,
        });

        if (result?.ok === true) {
          setIsEditing(false);
          router.refresh();
        } else {
          alert(`Failed to update ${label.toLowerCase()}: ${parseActionError(result?.error ?? result)}`);
          setEditValue(value); // Reset on error
        }
      } catch (e) {
        alert(`Failed to update ${label.toLowerCase()}: ${parseActionError(e)}`);
        setEditValue(value); // Reset on error
      }
    });
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  // Check if description contains technical placeholder text
  const isTechnicalPlaceholder = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes("powershell") ||
      lower.includes("prod test") ||
      lower.includes("test ticket") ||
      lower.includes("created from")
    );
  };

  if (!isEditing) {
    const isEmpty = !value || value.trim() === "";
    const isPlaceholder = value && isTechnicalPlaceholder(value);

    return (
      <div className="group flex items-start justify-between gap-2">
        {type === "textarea" ? (
          <div className="flex-1">
            {isEmpty || isPlaceholder ? (
              <p className="text-sm text-muted-foreground italic">
                No description was provided for this ticket.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{value}</p>
            )}
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-900 flex-1">{value}</p>
        )}
        {type === "textarea" && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="opacity-40 group-hover:opacity-100 transition-opacity text-xs text-blue-600 hover:underline"
          >
            {isEmpty || isPlaceholder ? "Add description" : "Edit description"}
          </button>
        )}
        {type !== "textarea" && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="opacity-40 group-hover:opacity-100 transition-opacity text-xs text-blue-600 hover:underline flex items-center gap-1"
            title="Edit subject"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {type === "textarea" ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          disabled={isPending}
        />
      ) : type === "select" ? (
        <select
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          disabled={isPending}
        >
          {options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          disabled={isPending}
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

