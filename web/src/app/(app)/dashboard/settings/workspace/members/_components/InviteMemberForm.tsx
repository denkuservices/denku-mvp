"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { safeErrorMessage } from "@/lib/errors/safeErrorMessage";

export function InviteMemberForm() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "owner">("admin");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toastError("Email is required");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/members/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data?.error) console.error("[MEMBERS][INVITE_FAILED]", data.error);
          toastError(safeErrorMessage(data?.error, "Failed to send invite"));
          return;
        }

        success(data.message || "Invitation sent");
        setEmail("");
        setIsOpen(false);
        router.refresh(); // Show updated member list without a full reload
      } catch (err) {
        console.error("[MEMBERS][INVITE_ERROR]", err);
        toastError(safeErrorMessage(err, "Failed to send invite"));
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-2 text-sm font-semibold text-navy-700 dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-white/5"
      >
        Invite member
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-700 dark:text-white">Invite Member</h3>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setEmail("");
          }}
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-navy-700 dark:hover:text-white"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-navy-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/15 disabled:opacity-50"
            placeholder="user@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="invite-role" className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "owner")}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 dark:border-white/20 bg-white dark:bg-navy-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/15 disabled:opacity-50"
          >
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <Button
          type="submit"
          disabled={isPending || !email.trim()}
          className="w-full"
        >
          {isPending ? "Sending..." : "Send Invite"}
        </Button>
      </form>
    </div>
  );
}

