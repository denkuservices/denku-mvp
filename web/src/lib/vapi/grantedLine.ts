import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { ensureAssistantConfig } from "@/lib/vapi/assistantConfig";
import { resolveWorkspaceLineDefaults } from "@/lib/phone-lines/connectByo";
import { defaultGreeting } from "@/lib/language/greeting";
import { linkAgentToPhoneNumber } from "@/lib/vapi/agentPhoneLink";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Provisioning and releasing a phone line that Denku is PAYING FOR on a customer's behalf.
 *
 * `/api/phone-lines/purchase` does the same Vapi work, wrapped in a Stripe transaction with
 * compensating rollbacks at every step. This is that flow with the money half removed: the operator
 * has decided to eat the cost of a trial number, so there is no add-on to increment and nothing to
 * refund — but the Vapi steps, and their rollbacks, still have to be right, because a half-created
 * line leaves a rented number nobody knows about, billing monthly, forever.
 *
 * **Why this is a second implementation and not a refactor of the purchase route.** That route is
 * 795 lines whose rollback blocks CLAUDE.md explicitly warns must be kept in sync, and rewriting it
 * to serve a transaction it was not built for is a larger and riskier change than the feature
 * asked for. The duplication is real and is filed rather than hidden — see R-161. What is NOT
 * duplicated is the part that has bitten production before: tools and the webhook URL are attached
 * through `ensureAssistantConfig` (landmine #6) and the agent is linked to its number so workspace
 * pause can find it (the omission that made pause a no-op for a line, fixed in R-140).
 *
 * ⚠️ Provisioning here spends real money — a Vapi number rental, billed monthly until released.
 * Every caller must have a human behind it, and the release path must actually run.
 */

const DEFAULT_AREA_CODE = "321";

type VapiPhoneNumber = { id: string; number?: string; phoneNumber?: string; status?: string };

export interface ProvisionGrantedLineInput {
  orgId: string;
  /** The grant this line belongs to. Release follows this link; without it the number leaks. */
  grantId: string;
  /** The operator's profile id, recorded as the agent's creator. */
  createdBy: string;
  preferredAreaCode?: string | null;
}

export interface ProvisionGrantedLineResult {
  ok: boolean;
  lineId?: string;
  phoneNumberE164?: string | null;
  vapiPhoneNumberId?: string;
  error?: string;
}

/**
 * Buy a US number from Vapi, back it with an assistant, and record it as grant-owned.
 *
 * Rollback is explicit at each step because there is no transaction spanning Vapi and Postgres:
 * a failure after the number exists deletes the number, and a failure after the assistant exists
 * deletes the assistant. The one thing never rolled back is a successful Vapi purchase whose DB row
 * also landed — at that point the line is real and the operator can release it deliberately.
 */
export async function provisionGrantedLine(
  input: ProvisionGrantedLineInput
): Promise<ProvisionGrantedLineResult> {
  const { orgId, grantId, createdBy } = input;
  const preferred =
    input.preferredAreaCode && /^\d{3}$/.test(input.preferredAreaCode.trim())
      ? input.preferredAreaCode.trim()
      : null;

  let assistantId: string | null = null;
  let vapiPhoneNumberId: string | null = null;
  let agentId: string | null = null;

  const cleanup = async () => {
    // Best-effort, in reverse order of creation. Each failure is logged loudly rather than
    // swallowed: an orphaned Vapi number is a recurring charge, and the log is the only place
    // anybody will ever find out about it.
    if (vapiPhoneNumberId) {
      try {
        await vapiFetch(`/phone-number/${vapiPhoneNumberId}`, { method: "DELETE" });
      } catch (err) {
        logEvent({
          tag: "[GRANT][LINE][ROLLBACK][NUMBER_ORPHANED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: { vapi_phone_number_id: vapiPhoneNumberId, error: String(err) },
        });
      }
    }
    if (agentId) {
      await supabaseAdmin.from("agents").delete().eq("id", agentId).eq("org_id", orgId);
    }
    if (assistantId) {
      try {
        await vapiFetch(`/assistant/${assistantId}`, { method: "DELETE" });
      } catch {
        // An orphaned assistant costs nothing and answers no number. Not worth an alarm.
      }
    }
  };

  /*
   * A trial line is still this business's line — it inherits the workspace's language, voice and
   * timezone rather than being born English. Same rule as the BYON path and the purchase route.
   */
  const lineDefaults = await resolveWorkspaceLineDefaults(orgId);

  try {
    // 1) The assistant that will answer this number.
    const assistant = await vapiFetch<{ id: string }>("/assistant", {
      method: "POST",
      body: JSON.stringify({
        name: `TRIAL ${orgId.slice(0, 4)} ${Date.now().toString().slice(-6)}`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful customer support voice assistant. Be friendly, professional, and focused on resolving customer inquiries.",
            },
          ],
        },
        firstMessage: defaultGreeting(lineDefaults.language),
        // No top-level `tools` — Vapi rejects it on create. They are merged in below.
      }),
    });
    assistantId = assistant?.id ?? null;
    if (!assistantId) throw new Error("Vapi returned no assistant id");

    // Tools + the canonical webhook URL. Non-fatal, exactly as the purchase route treats it: a
    // line whose tool merge hiccups still gets the deterministic post-call artifact fallback.
    const config = await ensureAssistantConfig({
      assistantId,
      language: lineDefaults.language,
      additionalLanguages: lineDefaults.additionalLanguages,
      voiceId: lineDefaults.voice,
    });
    if (!config.ok) {
      logEvent({
        tag: "[GRANT][LINE][ASSISTANT_CONFIG][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "warn",
        details: { assistant_id: assistantId, error: config.error },
      });
    }

    // 2) The agent row the rest of the product reasons about.
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .insert({
        org_id: orgId,
        name: "Trial Phone Line Agent",
        created_by: createdBy,
        language: lineDefaults.language,
        voice: lineDefaults.voice,
        timezone: lineDefaults.timezone,
        vapi_assistant_id: assistantId,
        behavior_preset: "friendly-support",
        agent_type: "phone_line_backing",
      })
      .select("id")
      .single<{ id: string }>();

    if (agentErr || !agent) throw new Error(`Agent insert failed: ${agentErr?.message ?? "no row"}`);
    agentId = agent.id;

    // 3) The number itself. Preferred area code first, then the house fallback.
    const areaCodes = preferred && preferred !== DEFAULT_AREA_CODE ? [preferred, DEFAULT_AREA_CODE] : [DEFAULT_AREA_CODE];
    let phone: VapiPhoneNumber | null = null;
    let lastError = "";

    for (const areaCode of areaCodes) {
      try {
        phone = await vapiFetch<VapiPhoneNumber>("/phone-number", {
          method: "POST",
          body: JSON.stringify({ provider: "vapi", assistantId, numberDesiredAreaCode: areaCode }),
        });
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!phone?.id) throw new Error(lastError || "Vapi returned no phone number id");
    vapiPhoneNumberId = phone.id;

    // 4) Vapi mints the number asynchronously; poll briefly for the E.164 form.
    let e164 = phone.number ?? phone.phoneNumber ?? null;
    for (let attempt = 0; !e164 && attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const details = await vapiFetch<VapiPhoneNumber>(`/phone-number/${phone.id}`);
        e164 = details.number ?? details.phoneNumber ?? null;
      } catch {
        // Keep polling; a missing E.164 is recoverable, a missing number is not.
      }
    }

    /*
     * 5) Link the agent to its number.
     *
     * REQUIRED for enforcement, not bookkeeping: `unbindOrgPhoneNumbers` selects agents having BOTH
     * ids, so without this write the trial line is invisible to workspace pause — and a trial line
     * that survives its own minute cap is the exact failure this whole feature exists to prevent.
     */
    const link = await linkAgentToPhoneNumber({ orgId, agentId, vapiPhoneNumberId });
    if (!link.ok) throw new Error(`Agent/number link failed: ${link.error ?? "unknown"}`);

    // 6) The row that makes it a line, tagged with the grant that pays for it.
    const now = new Date().toISOString();
    const { data: line, error: lineErr } = await supabaseAdmin
      .from("phone_lines")
      .insert({
        org_id: orgId,
        vapi_phone_number_id: vapiPhoneNumberId,
        phone_number_e164: e164,
        status: "live",
        line_type: "support",
        assigned_agent_id: agentId,
        grant_id: grantId,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single<{ id: string }>();

    if (lineErr || !line) throw new Error(`Phone line insert failed: ${lineErr?.message ?? "no row"}`);

    logEvent({
      tag: "[GRANT][LINE][PROVISIONED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: { grant_id: grantId, line_id: line.id, vapi_phone_number_id: vapiPhoneNumberId },
    });

    return { ok: true, lineId: line.id, phoneNumberE164: e164, vapiPhoneNumberId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await cleanup();
    logEvent({
      tag: "[GRANT][LINE][PROVISION_FAILED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: { grant_id: grantId, error: message },
    });
    return { ok: false, error: message };
  }
}

export interface ReleaseGrantedLineResult {
  ok: boolean;
  error?: string;
}

/**
 * Hand a granted number back to Vapi and forget it.
 *
 * Deleting the Vapi number is what stops the monthly rental, so it happens FIRST and a failure
 * there aborts: a DB row deleted while the number lives on is a charge with no record of what it is
 * for. The assistant and agent row go afterwards, best-effort — they cost nothing and their
 * leftovers are tidy-up, not money.
 *
 * Refuses to touch a line without a `grant_id`. Those belong to the customer, who paid for them.
 */
export async function releaseGrantedLine(input: {
  orgId: string;
  lineId: string;
}): Promise<ReleaseGrantedLineResult> {
  const { orgId, lineId } = input;

  const { data: line, error } = await supabaseAdmin
    .from("phone_lines")
    .select("id, vapi_phone_number_id, assigned_agent_id, grant_id")
    .eq("id", lineId)
    .eq("org_id", orgId)
    .maybeSingle<{
      id: string;
      vapi_phone_number_id: string | null;
      assigned_agent_id: string | null;
      grant_id: string | null;
    }>();

  if (error || !line) return { ok: false, error: "line_not_found" };
  if (!line.grant_id) return { ok: false, error: "not_a_granted_line" };

  if (line.vapi_phone_number_id) {
    try {
      await vapiFetch(`/phone-number/${line.vapi_phone_number_id}`, { method: "DELETE" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A 404 means Vapi has already let it go — that is the outcome we wanted, so carry on.
      if (!/404/.test(message)) {
        logEvent({
          tag: "[GRANT][LINE][RELEASE][VAPI_FAILED]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: { line_id: lineId, error: message },
        });
        return { ok: false, error: message };
      }
    }
  }

  if (line.assigned_agent_id) {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("vapi_assistant_id")
      .eq("id", line.assigned_agent_id)
      .eq("org_id", orgId)
      .maybeSingle<{ vapi_assistant_id: string | null }>();

    if (agent?.vapi_assistant_id) {
      try {
        await vapiFetch(`/assistant/${agent.vapi_assistant_id}`, { method: "DELETE" });
      } catch {
        // Costs nothing to leave behind.
      }
    }
    await supabaseAdmin.from("agents").delete().eq("id", line.assigned_agent_id).eq("org_id", orgId);
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("phone_lines")
    .delete()
    .eq("id", lineId)
    .eq("org_id", orgId);

  if (deleteErr) return { ok: false, error: deleteErr.message };

  logEvent({
    tag: "[GRANT][LINE][RELEASED]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: { line_id: lineId, grant_id: line.grant_id },
  });

  return { ok: true };
}
