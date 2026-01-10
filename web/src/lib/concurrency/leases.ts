import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrgPlan, getOrgConcurrencyLimit } from "@/lib/organizations/plans";

/**
 * Get count of active leases for an organization.
 * Active = released_at IS NULL AND expires_at > now()
 */
export async function getOrgActiveLeaseCount(orgId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("call_concurrency_leases")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("released_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("[CONCURRENCY] Error counting active leases:", error);
    return 0;
  }

  return count ?? 0;
}

/**
 * Atomically acquire an org-level concurrency lease.
 * 
 * Rules:
 * - Enforcement is org-level only (agent_id is stored for reporting but doesn't affect limit)
 * - Effective limit = getOrgConcurrencyLimit(orgId) (from organizations.plan/status)
 * - Uses SQL RPC function for atomicity (with advisory lock per org)
 * - ALL writes use supabaseAdmin (service role) to bypass RLS
 * 
 * Returns { ok: true } on success, or { ok: false, reason: "limit_reached" | "org_inactive", error?: string } if limit is exceeded or org is inactive.
 */
export async function acquireOrgConcurrencyLease(params: {
  orgId: string;
  agentId?: string | null;
  vapiCallId?: string | null;
  ttlMinutes?: number;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "limit_reached" | "org_inactive"; error?: string }
> {
  const { orgId, agentId, vapiCallId, ttlMinutes = 15 } = params;

  try {
    // Check org plan/status first
    const orgPlan = await getOrgPlan(orgId);
    if (!orgPlan || orgPlan.status !== "active") {
      const errorMsg = `Org plan check failed: ${!orgPlan ? "not found" : `status=${orgPlan.status}`}`;
      console.warn("[CONCURRENCY] acquireOrgConcurrencyLease - org_inactive", {
        orgId,
        agentId,
        vapiCallId,
        reason: errorMsg,
      });
      return { ok: false, reason: "org_inactive", error: errorMsg };
    }

    // Get org-level limit
    const orgLimit = await getOrgConcurrencyLimit(orgId);
    if (orgLimit <= 0) {
      const errorMsg = `Org limit is ${orgLimit} (must be > 0)`;
      console.warn("[CONCURRENCY] acquireOrgConcurrencyLease - org_inactive (limit <= 0)", {
        orgId,
        agentId,
        vapiCallId,
        orgLimit,
      });
      return { ok: false, reason: "org_inactive", error: errorMsg };
    }

    // Call SQL RPC function for atomic acquire (with advisory lock)
    // CRITICAL: Uses supabaseAdmin (service role) to bypass RLS
    const { data: success, error: rpcError } = await supabaseAdmin.rpc("acquire_org_concurrency_lease", {
      p_org_id: orgId,
      p_limit: orgLimit,
      p_agent_id: agentId ?? null,
      p_vapi_call_id: vapiCallId ?? null,
      p_ttl_minutes: ttlMinutes,
    });

    if (rpcError) {
      const errorMsg = `RPC error: ${rpcError.message} (code: ${rpcError.code})`;
      console.error("[CONCURRENCY] Error acquiring lease via RPC:", {
        orgId,
        agentId,
        vapiCallId,
        orgLimit,
        error: rpcError,
      });

      // Fallback: try manual check + insert (best-effort, may have race condition)
      // Still use supabaseAdmin for all writes
      try {
        const activeCount = await getOrgActiveLeaseCount(orgId);
        if (activeCount >= orgLimit) {
          return { ok: false, reason: "limit_reached", error: errorMsg };
        }
        // Try direct insert as fallback (using service role)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
        const { error: insertError } = await supabaseAdmin
          .from("call_concurrency_leases")
          .insert({
            org_id: orgId,
            agent_id: agentId ?? null,
            vapi_call_id: vapiCallId ?? null,
            acquired_at: new Date().toISOString(),
            released_at: null,
            expires_at: expiresAt.toISOString(),
          });

        if (insertError) {
          const insertErrorMsg = `Insert fallback failed: ${insertError.message} (code: ${insertError.code})`;
          console.error("[CONCURRENCY] Insert fallback failed:", {
            orgId,
            agentId,
            vapiCallId,
            activeCount,
            orgLimit,
            insertError,
          });
          return { ok: false, reason: "limit_reached", error: insertErrorMsg };
        }

        console.log("[CONCURRENCY] Lease acquired via fallback insert:", {
          orgId,
          agentId,
          vapiCallId,
        });
        return { ok: true };
      } catch (fallbackErr) {
        const fallbackErrorMsg = `Fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`;
        console.error("[CONCURRENCY] Fallback acquire failed:", {
          orgId,
          agentId,
          vapiCallId,
          error: fallbackErr,
        });
        return { ok: false, reason: "limit_reached", error: fallbackErrorMsg };
      }
    }

    if (success === true) {
      console.log("[CONCURRENCY] Lease acquired successfully via RPC:", {
        orgId,
        agentId,
        vapiCallId,
        orgLimit,
      });
      return { ok: true };
    } else {
      // RPC returned false - limit reached
      console.warn("[CONCURRENCY] Lease acquire rejected - limit reached", {
        orgId,
        agentId,
        vapiCallId,
        orgLimit,
      });
      return { ok: false, reason: "limit_reached", error: "RPC returned false (limit reached)" };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[CONCURRENCY] Exception acquiring lease:", {
      orgId,
      agentId,
      vapiCallId,
      error: err,
    });
    return { ok: false, reason: "limit_reached", error: errorMsg };
  }
}

/**
 * Release an org-level concurrency lease by vapi_call_id.
 * Can be called multiple times safely (idempotent).
 * 
 * CRITICAL: Uses supabaseAdmin (service role) to bypass RLS for updates.
 */
export async function releaseOrgConcurrencyLease(params: {
  orgId: string;
  vapiCallId?: string | null;
}): Promise<void> {
  const { orgId, vapiCallId } = params;

  if (!vapiCallId) {
    // Nothing to release if no vapi_call_id
    console.log("[CONCURRENCY] releaseOrgConcurrencyLease skipped - no vapiCallId", { orgId });
    return;
  }

  try {
    // Try RPC function first (uses service role internally)
    const { error: rpcError } = await supabaseAdmin.rpc("release_org_concurrency_lease", {
      p_org_id: orgId,
      p_vapi_call_id: vapiCallId,
    });

    if (rpcError) {
      console.warn("[CONCURRENCY] RPC release failed, trying manual update:", {
        orgId,
        vapiCallId,
        error: rpcError,
      });
      // Fallback: manual update (using service role)
      const { error: updateError } = await supabaseAdmin
        .from("call_concurrency_leases")
        .update({ released_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("vapi_call_id", vapiCallId)
        .is("released_at", null);

      if (updateError) {
        console.error("[CONCURRENCY] Error releasing lease (manual update):", {
          orgId,
          vapiCallId,
          error: updateError,
        });
        throw updateError; // Throw to be caught by outer catch
      } else {
        console.log("[CONCURRENCY] Lease released via manual update:", {
          orgId,
          vapiCallId,
        });
      }
    } else {
      console.log("[CONCURRENCY] Lease released via RPC:", { orgId, vapiCallId });
    }
  } catch (err) {
    console.error("[CONCURRENCY] Exception releasing lease:", {
      orgId,
      vapiCallId,
      error: err,
    });
    // Don't throw - release is best-effort cleanup, but log for visibility
  }
}

/**
 * Release all expired leases (cleanup function).
 * Can be called periodically or on-demand.
 * 
 * CRITICAL: Uses supabaseAdmin (service role) to bypass RLS for updates.
 */
export async function releaseExpiredLeases(): Promise<number> {
  try {
    const { data: count, error } = await supabaseAdmin.rpc("release_expired_concurrency_leases");

    if (error) {
      console.warn("[CONCURRENCY] RPC release_expired_concurrency_leases failed, trying manual update:", error);
      // Fallback: manual update if function doesn't exist yet (using service role)
      const { error: updateError } = await supabaseAdmin
        .from("call_concurrency_leases")
        .update({ released_at: new Date().toISOString() })
        .is("released_at", null)
        .lt("expires_at", new Date().toISOString());

      if (updateError) {
        console.error("[CONCURRENCY] Manual expired lease cleanup failed:", updateError);
        return 0;
      }

      // Note: We can't easily get the count from an update query, but the update succeeded
      console.log("[CONCURRENCY] Released expired lease(s) via manual update");
      return 1; // Return 1 to indicate cleanup was attempted (actual count unknown)
    }

    // If RPC returns count, use it; otherwise return 0
    const releasedCount = typeof count === "number" ? count : 0;
    if (releasedCount > 0) {
      console.log(`[CONCURRENCY] Released ${releasedCount} expired lease(s) via RPC`);
    }
    return releasedCount;
  } catch (err) {
    console.error("[CONCURRENCY] Exception releasing expired leases:", err);
    return 0;
  }
}
