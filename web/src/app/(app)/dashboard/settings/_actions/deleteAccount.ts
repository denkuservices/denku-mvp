"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { getViewer } from "@/lib/auth/permissions";
import { verifyPassword } from "@/lib/auth/reauthenticate";
import { GATE_COOKIE_NAME } from "@/lib/auth/gateCookie";
import { logAuditEvent } from "@/lib/audit/log";
import { accountHasPassword, deleteAccount, type DeletionScope } from "@/lib/account/deleteAccount";

/**
 * The one control in Settings that cannot be undone.
 *
 * Three gates stand in front of it, and each is here for a different failure:
 *
 *   1. **Type your own email address.** Not the word "DELETE": a confirmation phrase everybody
 *      types on autopilot confirms muscle memory, not intent. Their address is the one string that
 *      cannot be typed by someone who wandered into the wrong account.
 *   2. **Your current password.** `deleteUser` asks for nothing, so without this a borrowed
 *      session is enough to end a business — the same hole `changePassword` closes, and the same
 *      shared `verifyPassword` closes it. Skipped only for a Google/Facebook account, which has no
 *      Denku password to give (`accountHasPassword`).
 *   3. **The scope is re-derived on the server.** What is deleted is decided from the database at
 *      the moment of the write, never from the request — a client that claimed
 *      "workspace_and_account" must not be able to make it so.
 *
 * The scope is also reported back to the dialog beforehand, so nobody learns their colleagues lost
 * the workspace by watching it happen.
 */

const ConfirmSchema = z.object({
  confirmEmail: z.string().min(1, "Type your email address to confirm."),
  currentPassword: z.string().optional(),
});

export type DeleteAccountActionResult =
  | { ok: true; scope: DeletionScope; warnings: string[] }
  | { ok: false; error: string };

/*
 * Only one action is exported. `previewAccountDeletion` is resolved by the page instead: every
 * export in a `"use server"` file is a callable endpoint, and a read-only convenience nobody calls
 * is still surface area.
 */
export async function deleteMyAccount(input: {
  confirmEmail: string;
  currentPassword?: string;
}): Promise<DeleteAccountActionResult> {
  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  const viewer = await getViewer();
  const user = await getCachedUser();
  if (!viewer.userId || !user) return { ok: false, error: "Unauthorized" };

  const email = (viewer.email ?? user.email ?? "").trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      error: "This account has no email address, so it cannot be confirmed here. Contact support.",
    };
  }

  if (parsed.data.confirmEmail.trim().toLowerCase() !== email) {
    return { ok: false, error: "That is not the email address on this account." };
  }

  if (accountHasPassword(user)) {
    const password = parsed.data.currentPassword ?? "";
    if (!password) return { ok: false, error: "Enter your current password to confirm." };

    if (!(await verifyPassword(email, password))) {
      // A failed re-authentication in front of a delete button is what a session-borrowing attempt
      // looks like from the inside. Recorded while there is still a workspace to record it in.
      if (viewer.orgId) {
        await logAuditEvent({
          org_id: viewer.orgId,
          actor_user_id: viewer.profileId,
          action: "account.delete.reauth_failed",
          entity_type: "account",
          entity_id: viewer.orgId,
          diff: {},
        });
      }
      return { ok: false, error: "That password is not right." };
    }
  }

  // Written before the work, because the audit log is one of the tables the work deletes. For a
  // member leaving a workspace that survives them, this row is the workspace's record of it.
  if (viewer.orgId) {
    await logAuditEvent({
      org_id: viewer.orgId,
      actor_user_id: viewer.profileId,
      action: "account.delete",
      entity_type: "account",
      entity_id: viewer.profileId ?? viewer.userId,
      diff: { account: { before: email, after: null } },
    });
  }

  const result = await deleteAccount();
  if (!result.ok) return result;

  /*
   * Nothing is left to sign out OF — the user is gone — but the browser still holds its cookies,
   * and a dead session that looks alive sends someone to a dashboard that 500s instead of the
   * login page. `scope: "local"` clears them without calling an API that would now 404.
   */
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* the cookies below are the part that matters */
  }
  try {
    const jar = await cookies();
    jar.delete(GATE_COOKIE_NAME);
    // The middleware's cached ALLOW is user-id-bound, so it lets nobody in — but a signed
    // statement about a workspace that no longer exists should not outlive it either.
    for (const c of jar.getAll()) {
      if (c.name.startsWith("sb-")) jar.delete(c.name);
    }
  } catch {
    /* best-effort */
  }

  return { ok: true, scope: result.scope, warnings: result.warnings };
}
