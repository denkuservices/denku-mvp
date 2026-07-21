import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { purgeByIgUserId } from "./connections";

/**
 * Meta Data Deletion Request handling (Sprint 1.5 compliance). On request we
 * hard-delete the account's data and record a status row so the user can check
 * it later via the returned confirmation code + status URL.
 */

export type DeletionStatus = {
  confirmation_code: string;
  status: "received" | "completed" | "failed";
  requested_at: string;
  completed_at: string | null;
};

/** Run a deletion: purge data, record the request, return code + final status. */
export async function processDataDeletion(igUserId: string | null): Promise<{
  confirmationCode: string;
  status: "completed" | "failed";
}> {
  const confirmationCode = randomBytes(16).toString("hex");
  let orgId: string | null = null;
  let status: "completed" | "failed" = "completed";
  let detail: string | null = null;

  try {
    if (igUserId) {
      const res = await purgeByIgUserId(igUserId);
      orgId = res.orgId;
    } else {
      status = "failed";
      detail = "no user_id in signed_request";
    }
  } catch (err) {
    status = "failed";
    detail = err instanceof Error ? err.message : String(err);
  }

  // Record the request/status (never throw — the callback must respond to Meta).
  try {
    await supabaseAdmin.from("instagram_data_deletion_requests").insert({
      confirmation_code: confirmationCode,
      ig_user_id: igUserId,
      org_id: orgId,
      status,
      detail,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("[INSTAGRAM][DATA_DELETION][RECORD][FAILED]", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { confirmationCode, status };
}

/** Public status lookup by confirmation code (for the status page). */
export async function getDeletionStatus(code: string): Promise<DeletionStatus | null> {
  const { data } = await supabaseAdmin
    .from("instagram_data_deletion_requests")
    .select("confirmation_code, status, requested_at, completed_at")
    .eq("confirmation_code", code)
    .maybeSingle<DeletionStatus>();
  return data ?? null;
}
