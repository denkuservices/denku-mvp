"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLead } from "../actions";

interface NewLeadFormProps {
  orgId: string;
  userId: string;
}

export function NewLeadForm({ orgId, userId }: NewLeadFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    source: "manual",
    status: "new" as "new" | "contacted" | "qualified" | "unqualified",
    notes: "",
  });

  const validateForm = (): string | null => {
    // Name validation
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      return "Name is required and must be at least 2 characters";
    }

    // Email validation (if provided)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        return "Invalid email format";
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      const result = await createLead(orgId, userId, {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        source: formData.source,
        status: formData.status,
        notes: formData.notes.trim() || null,
      });

      if (result.ok) {
        router.push(`/dashboard/leads/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error || "Failed to create lead");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name - Required */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Name <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={isPending}
          required
          minLength={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
          placeholder="Enter lead name"
        />
      </div>

      {/* Phone - Optional */}
      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          disabled={isPending}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
          placeholder="Enter phone number"
        />
      </div>

      {/* Email - Optional */}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          disabled={isPending}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
          placeholder="Enter email address"
        />
      </div>

      {/* Source - Optional, default "manual" */}
      <div className="space-y-2">
        <label htmlFor="source" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Source
        </label>
        <select
          id="source"
          value={formData.source}
          onChange={(e) => setFormData({ ...formData, source: e.target.value })}
          disabled={isPending}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
        >
          <option value="manual">Manual</option>
          <option value="web">Web</option>
          <option value="inbound_call">Inbound Call</option>
          <option value="referral">Referral</option>
          <option value="import">Import</option>
          <option value="vapi">Vapi</option>
        </select>
      </div>

      {/* Status - Optional, default "new" */}
      <div className="space-y-2">
        <label htmlFor="status" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Status
        </label>
        <select
          id="status"
          value={formData.status}
          onChange={(e) =>
            setFormData({ ...formData, status: e.target.value as "new" | "contacted" | "qualified" | "unqualified" })
          }
          disabled={isPending}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="unqualified">Unqualified</option>
        </select>
      </div>

      {/* Notes - Optional */}
      <div className="space-y-2">
        <label htmlFor="notes" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          disabled={isPending}
          rows={4}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-navy-700 dark:text-white disabled:opacity-50"
          placeholder="Additional notes about the lead..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={isPending || !formData.name.trim() || formData.name.trim().length < 2}
          className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-[11px] font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Creating..." : "Create Lead"}
        </button>
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600 disabled:opacity-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
