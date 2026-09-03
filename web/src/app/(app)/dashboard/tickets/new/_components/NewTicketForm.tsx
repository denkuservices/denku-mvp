"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTicket } from "@/lib/tickets/actions";
import { CONTROL_CLASS } from "@/components/ui-horizon/controls";
import { horizonButtonClass } from "@/components/ui-horizon/button";
import { Notice } from "@/components/ui-horizon/notice";

interface NewTicketFormProps {
  orgId: string;
  userId: string;
}

export function NewTicketForm({ orgId, userId }: NewTicketFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    subject: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.subject.trim()) {
      setError("Subject is required");
      return;
    }

    startTransition(async () => {
      const result = await createTicket(orgId, userId, {
        orgId,
        subject: formData.subject.trim(),
        priority: formData.priority,
        description: formData.description.trim() || null,
      });

      if (result.ok) {
        router.push(`/dashboard/tickets/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error || "Failed to create ticket");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Subject */}
      <div>
        <label htmlFor="subject" className="block text-sm font-medium mb-1">
          Subject <span className="text-red-600">*</span>
        </label>
        <input
          id="subject"
          type="text"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          disabled={isPending}
          required
          maxLength={500}
          className={`${CONTROL_CLASS} w-full disabled:opacity-50`}
          placeholder="Brief description of the issue"
        />
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium mb-1">
          Priority
        </label>
        <select
          id="priority"
          value={formData.priority}
          onChange={(e) =>
            setFormData({ ...formData, priority: e.target.value as "low" | "medium" | "high" | "urgent" })
          }
          disabled={isPending}
          className={`${CONTROL_CLASS} w-full disabled:opacity-50`}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">
          Description <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          disabled={isPending}
          rows={6}
          className={`${CONTROL_CLASS} h-auto w-full py-2 disabled:opacity-50`}
          placeholder="Additional details about the ticket..."
        />
      </div>

      {/* Error */}
      {error && (
        <Notice tone="danger">{error}</Notice>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || !formData.subject.trim()}
          className={horizonButtonClass("primary")}
        >
          {isPending ? "Creating..." : "Create Ticket"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className={horizonButtonClass("secondary")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

