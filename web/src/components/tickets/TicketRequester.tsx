"use client";

import { useState, useTransition } from "react";
import { updateTicket } from "@/lib/tickets/actions";
import { useRouter } from "next/navigation";

type TicketRequesterProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  requesterName: string | null;
  requesterPhone: string | null;
  requesterEmail: string | null;
  requesterAddress: string | null;
  canMutate: boolean;
  isPaused: boolean;
};

export function TicketRequester({
  ticketId,
  orgId,
  userId,
  requesterName,
  requesterPhone,
  requesterEmail,
  requesterAddress,
  canMutate,
  isPaused,
}: TicketRequesterProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: requesterName ?? "",
    phone: requesterPhone ?? "",
    email: requesterEmail ?? "",
    address: requesterAddress ?? "",
  });

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    if (!email.trim()) return true; // Empty is valid (optional field)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleSave = () => {
    setError(null);

    // Client-side validation
    if (formData.email && !isValidEmail(formData.email)) {
      setError("Please enter a valid email address");
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTicket(orgId, userId, {
          orgId,
          ticketId,
          patch: {
            requester_name: formData.name || null,
            requester_phone: formData.phone || null,
            requester_email: formData.email || null,
            requester_address: formData.address || null,
          },
        });

        if (result?.ok === true) {
          setIsEditing(false);
          setError(null);
          router.refresh();
        } else {
          setError(result.error || "Failed to update requester details");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update requester details");
      }
    });
  };

  const handleCancel = () => {
    setFormData({
      name: requesterName ?? "",
      phone: requesterPhone ?? "",
      email: requesterEmail ?? "",
      address: requesterAddress ?? "",
    });
    setError(null);
    setIsEditing(false);
  };

  if (!canMutate || isPaused) {
    // Read-only view
    const hasAnyData = requesterName || requesterPhone || requesterEmail || requesterAddress;

    if (!hasAnyData) {
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium mb-2">Requester</p>
          <p className="text-sm text-muted-foreground">—</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <p className="text-sm font-medium">Requester</p>
        <div className="space-y-2">
          {requesterName && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Full name</p>
              <p className="text-sm">{requesterName}</p>
            </div>
          )}
          {requesterPhone && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
              <p className="text-sm">{requesterPhone}</p>
            </div>
          )}
          {requesterEmail && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Email</p>
              <p className="text-sm">{requesterEmail}</p>
            </div>
          )}
          {requesterAddress && (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Address</p>
              <p className="text-sm whitespace-pre-wrap">{requesterAddress}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Editable view
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Requester</p>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            {requesterName || requesterPhone || requesterEmail || requesterAddress ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          {/* Full name */}
          <div>
            <label htmlFor="requester-name" className="block text-xs text-muted-foreground mb-1">
              Full name
            </label>
            <input
              id="requester-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isPending}
              maxLength={200}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
              placeholder="Enter full name"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="requester-phone" className="block text-xs text-muted-foreground mb-1">
              Phone <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <input
              id="requester-phone"
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={isPending}
              maxLength={200}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
              placeholder="Enter phone number"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="requester-email" className="block text-xs text-muted-foreground mb-1">
              Email <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <input
              id="requester-email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                setError(null); // Clear error on input
              }}
              disabled={isPending}
              maxLength={200}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
              placeholder="Enter email address"
            />
          </div>

          {/* Address */}
          <div>
            <label htmlFor="requester-address" className="block text-xs text-muted-foreground mb-1">
              Address <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="requester-address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              disabled={isPending}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
              placeholder="Enter address"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Helper text */}
          <p className="text-xs text-muted-foreground">
            Used when the ticket is not linked to a lead.
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
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
      ) : (
        <div className="space-y-2">
          {requesterName ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Full name</p>
              <p className="text-sm">{requesterName}</p>
            </div>
          ) : null}
          {requesterPhone ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
              <p className="text-sm">{requesterPhone}</p>
            </div>
          ) : null}
          {requesterEmail ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Email</p>
              <p className="text-sm">{requesterEmail}</p>
            </div>
          ) : null}
          {requesterAddress ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Address</p>
              <p className="text-sm whitespace-pre-wrap">{requesterAddress}</p>
            </div>
          ) : null}
          {!requesterName && !requesterPhone && !requesterEmail && !requesterAddress && (
            <p className="text-sm text-muted-foreground">No requester information provided.</p>
          )}
        </div>
      )}
    </div>
  );
}

