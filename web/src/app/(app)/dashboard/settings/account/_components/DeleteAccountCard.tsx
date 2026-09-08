"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  PhoneCall,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FieldLabel,
  INPUT_CLASS,
  INPUT_WITH_ICON_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { deleteMyAccount } from "../../_actions/deleteAccount";
import type { AccountDeletionPreview } from "@/lib/account/deleteAccount";

/**
 * The bottom of Settings.
 *
 * **Why it says what it says.** "Delete account" means two genuinely different things here and
 * getting the wrong one is unrecoverable, so the card names which one applies to *this* person
 * before they open the dialog: the last owner deletes the business, everybody else deletes only
 * themselves. The scope comes from the server (`previewAccountDeletion`) and is re-derived there
 * again at the moment of the write — nothing about it is decided in the browser.
 *
 * **Why the inventory.** A confirmation that says "this cannot be undone" tells someone the
 * severity and not the content. The list is what they are actually about to lose, counted from
 * their own workspace: the conversations, the calls, the customers, the numbers that get released,
 * the colleagues who lose access. It is the difference between agreeing and knowing.
 *
 * **Why typing the email.** Every product uses "type DELETE to confirm" and everybody types it
 * without reading. Their own address is the one string a person in the wrong account cannot
 * produce from muscle memory.
 */
export function DeleteAccountCard({ preview }: { preview: AccountDeletionPreview }) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deletesWorkspace = preview.scope === "workspace_and_account";
  const email = preview.email ?? "";

  const emailMatches = useMemo(
    () => confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && email.length > 0,
    [confirmEmail, email]
  );
  const passwordReady = !preview.requiresPassword || password.length > 0;
  const canSubmit = emailMatches && passwordReady && !isPending;

  const close = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setConfirmEmail("");
      setPassword("");
      setError(null);
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccount({
        confirmEmail,
        currentPassword: preview.requiresPassword ? password : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      /*
       * A hard navigation, not `router.push`. The session this tab holds belongs to a user that no
       * longer exists, and every cached RSC payload in memory was rendered for a workspace that is
       * gone — a soft navigation would render one of them.
       */
      window.location.assign("/login");
    });
  };

  const items: Array<{ icon: typeof MessageSquare; label: string; value: string }> = [];
  if (deletesWorkspace) {
    items.push(
      {
        icon: MessageSquare,
        label: "Conversations and messages",
        value: String(preview.counts.conversations),
      },
      { icon: PhoneCall, label: "Calls and transcripts", value: String(preview.counts.calls) },
      { icon: Ticket, label: "Requests", value: String(preview.counts.tickets) },
      { icon: CalendarClock, label: "Appointments", value: String(preview.counts.appointments) },
      { icon: Users, label: "Customer records", value: String(preview.counts.contacts) }
    );
    if (preview.phoneNumbers.length > 0) {
      items.push({
        icon: Phone,
        label: "Phone numbers released",
        value: preview.phoneNumbers.join(", "),
      });
    }
    if (preview.otherMembers > 0) {
      items.push({
        icon: Users,
        label: "Team members who lose access",
        value: String(preview.otherMembers),
      });
    }
    if (preview.hasBilling) {
      items.push({ icon: CreditCard, label: "Subscription", value: "Cancelled immediately" });
    }
  }

  return (
    <Panel tone="critical">
      <PanelHeader
        icon={Trash2}
        tone="critical"
        title="Delete entire account"
        description={
          deletesWorkspace
            ? "Closes your sign-in and deletes this workspace with everything in it. Your subscription is cancelled and your phone numbers are released. This cannot be undone."
            : "Closes your sign-in and removes you from this workspace. The workspace and its data stay with the rest of your team. This cannot be undone."
        }
        action={
          <SettingsButton type="button" variant="danger" onClick={() => setOpen(true)}>
            <Trash2 />
            Delete entire account
          </SettingsButton>
        }
      />

      {items.length > 0 ? (
        <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 border-b border-red-100 py-1.5 text-sm last:border-0 dark:border-red-500/10"
            >
              <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-400">
                <item.icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-navy-700 dark:text-white">
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete entire account?
            </DialogTitle>
            <DialogDescription>
              {deletesWorkspace
                ? "Your workspace, its conversations, calls, customers and settings are permanently deleted. Neither you nor support can bring them back."
                : "Your sign-in is permanently deleted and you lose access to this workspace. Neither you nor support can bring it back."}
            </DialogDescription>
          </DialogHeader>

          {deletesWorkspace && preview.otherMembers > 0 ? (
            <Notice tone="warn" icon={Users} title="Other people use this workspace">
              They lose access the moment you confirm. If the business should continue without you,
              make someone else an owner first — then delete your account.
            </Notice>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="delete-confirm-email" required>
                Type your email address to confirm
              </FieldLabel>
              <input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                placeholder={email}
                value={confirmEmail}
                onChange={(e) => {
                  setConfirmEmail(e.target.value);
                  setError(null);
                }}
                disabled={isPending}
                className={INPUT_CLASS}
              />
            </div>

            {preview.requiresPassword ? (
              <div className="space-y-2">
                <FieldLabel htmlFor="delete-confirm-password" icon={Lock} required>
                  Current password
                </FieldLabel>
                <div className="relative">
                  <Lock
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    id="delete-confirm-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    disabled={isPending}
                    className={INPUT_WITH_ICON_CLASS}
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <Notice tone="critical" icon={AlertCircle}>
                {error}
              </Notice>
            ) : null}
          </div>

          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => close(false)}
              disabled={isPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton type="button" variant="danger" onClick={submit} disabled={!canSubmit}>
              {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isPending ? "Deleting…" : "Delete everything"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
