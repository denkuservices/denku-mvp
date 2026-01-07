"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function InviteMemberForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "owner">("admin");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/members/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to send invite");
          return;
        }

        setSuccess(data.message || "Invite sent successfully");
        setEmail("");
        setIsOpen(false);
        // Refresh page after a short delay to show updated member list
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send invite");
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
      >
        Invite member
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Invite Member</h3>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setEmail("");
            setError(null);
            setSuccess(null);
          }}
          className="text-xs text-zinc-600 hover:text-zinc-900"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="block text-xs font-medium text-zinc-700 mb-1">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
            placeholder="user@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="invite-role" className="block text-xs font-medium text-zinc-700 mb-1">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "owner")}
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
          >
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 p-2">
            <p className="text-xs text-green-600">{success}</p>
          </div>
        )}

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

