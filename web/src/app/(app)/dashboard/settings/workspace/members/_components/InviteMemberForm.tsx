"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Send, ShieldCheck, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { safeErrorMessage } from "@/lib/errors/safeErrorMessage";
import {
  FieldLabel,
  INPUT_WITH_ICON_CLASS,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";

/**
 * Invite a member.
 *
 * Was an inline disclosure: a button that replaced itself with a grey box pushed onto the bottom
 * of the roster, so inviting someone made the list jump and the form appeared furthest from the
 * control that opened it. It is a dialog now — the same one plan changes and workspace pauses use,
 * so "a decision that needs confirming" has one shape across Settings — and the roles are
 * described rather than merely named. "Admin" and "Owner" are not self-explanatory to the person
 * choosing between them.
 */
const ROLES = [
  { value: "viewer", label: "Viewer", hint: "Reads conversations and reports. Changes nothing." },
  { value: "admin", label: "Admin", hint: "Manages settings, members, channels and billing." },
  { value: "owner", label: "Owner", hint: "Full control, including billing and ownership." },
] as const;

type InviteRole = (typeof ROLES)[number]["value"];

/**
 * `canInviteOwner` is passed in rather than assumed: only the workspace OWNER may create another
 * owner, and an admin who was offered the option would be told no after typing the address. The
 * server refuses either way — this only stops the UI from promising something it cannot deliver.
 */
export function InviteMemberForm({ canInviteOwner = false }: { canInviteOwner?: boolean }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("admin");
  const [isPending, startTransition] = useTransition();

  const close = () => {
    if (isPending) return;
    setIsOpen(false);
    setEmail("");
  };

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

  return (
    <>
      <SettingsButton type="button" variant="primary" onClick={() => setIsOpen(true)}>
        <UserPlus />
        Invite member
      </SettingsButton>

      <Dialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : close())}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-brand-500" />
              Invite a member
            </DialogTitle>
            <DialogDescription>
              They get an email with a link to join this workspace.
            </DialogDescription>
          </DialogHeader>

          <form id="invite-member" onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="invite-email" icon={Mail} required>
                Email
              </FieldLabel>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                  className={INPUT_WITH_ICON_CLASS}
                  placeholder="teammate@yourbusiness.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel icon={ShieldCheck}>Role</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger
                  aria-label="Role"
                  disabled={isPending}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-navy-900"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.value !== "owner" || canInviteOwner).map((r) => (
                    <SelectItem key={r.value} value={r.value} className="py-2">
                      <span className="font-medium">{r.label}</span>
                      <span className="ml-2 text-xs text-gray-500">{r.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>

          <DialogFooter>
            <SettingsButton type="button" variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </SettingsButton>
            <SettingsButton
              type="submit"
              form="invite-member"
              variant="primary"
              disabled={isPending || !email.trim()}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {isPending ? "Sending…" : "Send invite"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
