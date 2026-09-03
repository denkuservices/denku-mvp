import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { ensureAssistantConfig } from "@/lib/vapi/assistantConfig";
import { linkAgentToPhoneNumber } from "@/lib/vapi/agentPhoneLink";
import { resolveLanguage } from "@/lib/vapi/assistantConfig";
import { toLanguageCode } from "@/lib/language/registry";
import { logEvent } from "@/lib/observability/logEvent";
import {
  createSipTrunkCredential,
  createByoPhoneNumber,
  deleteCredential,
  deleteByoPhoneNumber,
  sipDestinationForLine,
  KNOWN_SIP_CARRIERS,
  type KnownCarrierKey,
} from "@/lib/vapi/sipTrunk";

/**
 * Connect a phone number the customer already owns, over their own SIP trunk.
 *
 * Sibling of `/api/phone-lines/purchase`, not a branch inside it: there is no Stripe step (we are
 * not renting a number), no area-code fallback, and the line starts unverified. What the two DO
 * share is the compensation discipline — Vapi credential, Vapi assistant, Vapi number and two DB
 * rows are five separate systems with no transaction between them, so every failure unwinds the
 * steps that already succeeded, in reverse, best-effort, and logged.
 *
 * One rollback rule is easy to get wrong: **a reused trunk credential must survive.** If this
 * call did not create the credential, another line is using it, and deleting it would silently
 * break that line.
 */

export interface ConnectByoInput {
  orgId: string;
  userId: string;
  /** Already normalized to E.164 by the caller (`toE164`). */
  numberE164: string;
  displayName?: string | null;
  lineType?: "support" | "sales" | "after_hours";
  /** Reuse an existing trunk… */
  trunkId?: string | null;
  /** …or create one from carrier details. */
  carrier?: {
    providerKey?: KnownCarrierKey | string | null;
    name?: string | null;
    gatewayHost: string;
    gatewayPort?: number | null;
    authUsername?: string | null;
    /** Passed to Vapi and then dropped. Never persisted, never returned. */
    authPassword?: string | null;
  } | null;
}

export interface ConnectByoResult {
  ok: boolean;
  error?: string;
  status?: number;
  lineId?: string;
  trunkId?: string;
  verificationStatus?: "pending";
  /** What the customer must configure at their carrier. */
  instructions?: {
    forwardHost: string;
    forwardPort: number;
    perCredentialUri: string;
    calledPrefix?: string;
    callerPrefix?: string;
    vapiInboundIps: string[];
  };
}

/** Vapi's inbound signalling IPs — some carriers require an explicit allowlist. */
export const VAPI_INBOUND_IPS = ["44.229.228.186", "44.238.177.138"];

/**
 * Store a language the AI can actually speak, or store English.
 *
 * A workspace can hold a language string from before the registry existed — Turkish sat in two
 * pickers with no voice behind it, which is what R-135 was. Writing that value onto a new agent
 * would recreate the same lie one row at a time: a line labelled Turkish that answers in English.
 * So the value is normalized to a supported code before it is persisted, and the substitution is
 * logged rather than made silently — someone should be able to see that a workspace asked for a
 * language Denku cannot speak yet.
 */
function normalizeLanguage(raw: string | null | undefined, orgId: string): string {
  const resolved = resolveLanguage(raw);
  const asked = (raw ?? "").trim();
  if (asked && toLanguageCode(asked) === null) {
    logEvent({
      tag: "[PHONE_LINES][CONNECT][LANGUAGE_UNSUPPORTED]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: {
        requested: asked,
        used: resolved,
        why: "no transcriber/voice for this language in lib/language/registry.ts (R-135)",
      },
    });
  }
  return resolved;
}

/** Extra languages, kept only where Denku has an ear and a mouth, and never repeating the primary. */
function normalizeExtras(extras: string[] | null | undefined, primary: string | null | undefined): string[] {
  const primaryCode = resolveLanguage(primary);
  const out: string[] = [];
  for (const e of extras ?? []) {
    const code = toLanguageCode(e);
    if (code && code !== primaryCode && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * What language, voice and timezone should a newly connected line be born with?
 *
 * Hardcoding English here was wrong in an obvious way: a workspace whose employee already speaks
 * Spanish would connect its own number and get an AI that answers in English. A line is another
 * mouth for the SAME business, so it inherits the business's settings rather than inventing its
 * own.
 *
 * Order of truth: the workspace's main employee first (it is the one an owner has actually
 * configured — language, extra languages, timezone), then the workspace defaults recorded during
 * onboarding, then English. Never throws; a lookup failure just means the caller gets defaults.
 *
 * NOTE ON THE LIMIT: `resolveLanguage` only knows the languages in `lib/language/registry.ts`,
 * and that registry is deliberately the honest boundary — a language with no ear and no mouth
 * behind it must not be offered (R-135). A workspace holding an unsupported language therefore
 * still resolves to English here, on purpose. The fix for that is adding the language to the
 * registry with a verified transcriber and voice, not widening this function.
 */
export async function resolveWorkspaceLineDefaults(orgId: string): Promise<{
  language: string;
  additionalLanguages: string[];
  timezone: string;
  voice: string;
}> {
  const fallback = {
    language: "en",
    additionalLanguages: [] as string[],
    timezone: "America/New_York",
    voice: "jennifer",
  };

  try {
    const { data: settings } = await supabaseAdmin
      .from("organization_settings")
      .select("main_agent_id, default_language, onboarding_language, default_timezone")
      .eq("org_id", orgId)
      .maybeSingle<{
        main_agent_id: string | null;
        default_language: string | null;
        onboarding_language: string | null;
        default_timezone: string | null;
      }>();

    if (settings?.main_agent_id) {
      const { data: main } = await supabaseAdmin
        .from("agents")
        .select("language, additional_languages, timezone, voice")
        .eq("org_id", orgId)
        .eq("id", settings.main_agent_id)
        .maybeSingle<{
          language: string | null;
          additional_languages: string[] | null;
          timezone: string | null;
          voice: string | null;
        }>();

      if (main?.language) {
        return {
          language: normalizeLanguage(main.language, orgId),
          additionalLanguages: normalizeExtras(main.additional_languages, main.language),
          timezone: main.timezone || settings.default_timezone || fallback.timezone,
          voice: main.voice || fallback.voice,
        };
      }
    }

    const raw = settings?.default_language || settings?.onboarding_language || fallback.language;
    return {
      language: normalizeLanguage(raw, orgId),
      additionalLanguages: [],
      timezone: settings?.default_timezone || fallback.timezone,
      voice: fallback.voice,
    };
  } catch {
    return fallback;
  }
}

export async function connectByoNumber(input: ConnectByoInput): Promise<ConnectByoResult> {
  const { orgId, userId, numberE164 } = input;
  const lineType = input.lineType ?? "support";

  // What we created here, so rollback only undoes OUR work.
  let createdCredentialId: string | null = null;
  let trunkRowId: string | null = input.trunkId ?? null;
  let createdTrunkRow = false;
  let assistantId: string | null = null;
  let agentRowId: string | null = null;
  let vapiPhoneNumberId: string | null = null;

  const rollback = async (stage: string, reason: string) => {
    logEvent({
      tag: "[PHONE_LINES][CONNECT][ROLLBACK]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: { stage, reason, number: maskNumber(numberE164) },
    });
    if (vapiPhoneNumberId) {
      await deleteByoPhoneNumber(vapiPhoneNumberId).catch(() => {});
    }
    if (agentRowId) {
      await supabaseAdmin.from("agents").delete().eq("org_id", orgId).eq("id", agentRowId);
    }
    if (assistantId) {
      await vapiFetch(`/assistant/${assistantId}`, { method: "DELETE" }).catch(() => {});
    }
    if (createdTrunkRow && trunkRowId) {
      await supabaseAdmin.from("sip_trunks").delete().eq("org_id", orgId).eq("id", trunkRowId);
    }
    // Only if THIS call created it — a reused trunk belongs to another line.
    if (createdCredentialId) {
      await deleteCredential(createdCredentialId).catch(() => {});
    }
  };

  try {
    // 1) Trunk: reuse the one named, or create a credential + row.
    let credentialId: string;
    let carrierKey: string | null = null;

    if (input.trunkId) {
      const { data: trunk, error } = await supabaseAdmin
        .from("sip_trunks")
        .select("id, vapi_credential_id, provider_key, status")
        .eq("org_id", orgId)
        .eq("id", input.trunkId)
        .maybeSingle<{ id: string; vapi_credential_id: string; provider_key: string | null; status: string }>();

      if (error || !trunk) return fail("Trunk not found", 404);
      if (trunk.status !== "active") return fail("This SIP trunk is not active", 409);

      credentialId = trunk.vapi_credential_id;
      carrierKey = trunk.provider_key;
      trunkRowId = trunk.id;
    } else {
      const carrier = input.carrier;
      if (!carrier?.gatewayHost) return fail("SIP gateway host is required", 400);

      carrierKey = carrier.providerKey ?? null;

      /*
       * Trust every address the carrier is KNOWN to send from, not just the one in the form.
       *
       * The form collects one IP because that is all a customer can find in their panel. Vapi
       * matches the SOURCE address of the carrier's INVITE, so a carrier with a second egress
       * host is refused there — and refused invisibly: no call record at Vapi, and a busy tone
       * for the caller, which is indistinguishable from the customer's own line being broken.
       * Netgsm proved it on the first live line (see `KNOWN_SIP_CARRIERS`), so a known carrier's
       * full published list is merged in here rather than left to whoever fills in the form.
       */
      const knownCarrier =
        carrierKey && carrierKey in KNOWN_SIP_CARRIERS
          ? KNOWN_SIP_CARRIERS[carrierKey as KnownCarrierKey]
          : null;
      const extraGateways =
        knownCarrier && "additionalGatewayHosts" in knownCarrier
          ? (knownCarrier.additionalGatewayHosts as readonly string[])
          : [];

      const credential = await createSipTrunkCredential({
        name: carrier.name || `${carrierKey ?? "SIP"} trunk`,
        gatewayHost: carrier.gatewayHost,
        additionalGatewayHosts: extraGateways,
        gatewayPort: carrier.gatewayPort ?? null,
        authUsername: carrier.authUsername ?? null,
        authPassword: carrier.authPassword ?? null,
      });

      if (!credential?.id) return fail("The SIP provider credential was not created", 502);
      createdCredentialId = credential.id;
      credentialId = credential.id;

      // The password is NOT written here, on purpose — see the migration's note.
      const { data: trunkRow, error: trunkErr } = await supabaseAdmin
        .from("sip_trunks")
        .insert({
          org_id: orgId,
          name: carrier.name || `${carrierKey ?? "SIP"} trunk`,
          provider_key: carrierKey,
          vapi_credential_id: credential.id,
          gateway_host: carrier.gatewayHost,
          gateway_port: carrier.gatewayPort ?? null,
          auth_username: carrier.authUsername ?? null,
          connected_by: userId,
        })
        .select("id")
        .single<{ id: string }>();

      if (trunkErr || !trunkRow) {
        await rollback("trunk_row", trunkErr?.message ?? "no row");
        return fail("Could not save the SIP trunk", 500);
      }
      trunkRowId = trunkRow.id;
      createdTrunkRow = true;
    }

    // 2) Backing assistant, born speaking whatever the business already speaks.
    //    Tools and the canonical webhook server.url are attached afterwards, because Vapi rejects
    //    a top-level `tools` on create.
    const defaults = await resolveWorkspaceLineDefaults(orgId);
    const assistantName = `BYO ${orgId.slice(0, 4)} ${Date.now().toString().slice(-6)}`;
    const assistant = await vapiFetch<{ id: string }>("/assistant", {
      method: "POST",
      body: JSON.stringify({
        name: assistantName,
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
        firstMessage: "Hi, thanks for calling. How can I help you today?",
      }),
    });

    if (!assistant?.id) {
      await rollback("assistant", "no id returned");
      return fail("Could not create the AI for this line", 502);
    }
    assistantId = assistant.id;

    // Language belongs in the shared helper, not in the create call: it is what decides the
    // transcriber model and the voice, and `buildAssistantConfigPatch` is the one place that
    // knows how those two follow from a language.
    const config = await ensureAssistantConfig({
      assistantId: assistant.id,
      language: defaults.language,
      additionalLanguages: defaults.additionalLanguages,
    });
    if (!config.ok) {
      // Non-fatal, exactly as in the purchase path: the deterministic post-call fallback still
      // produces an artifact, and the reconcile endpoint can re-apply the config.
      console.error("[connectByo] ensureAssistantConfig failed (non-fatal):", config.error);
    }

    // 3) Agent row.
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .insert({
        org_id: orgId,
        name: input.displayName?.trim() || "Connected Line AI",
        created_by: userId,
        language: defaults.language,
        additional_languages: defaults.additionalLanguages,
        timezone: defaults.timezone,
        voice: defaults.voice,
        vapi_assistant_id: assistant.id,
        behavior_preset: "friendly-support",
        agent_type: "phone_line_backing",
      })
      .select("id")
      .single<{ id: string }>();

    if (agentErr || !agent) {
      await rollback("agent_row", agentErr?.message ?? "no row");
      return fail("Could not save the AI for this line", 500);
    }
    agentRowId = agent.id;

    // 4) The number itself, bound to the assistant at create time.
    const phone = await createByoPhoneNumber({
      number: numberE164,
      name: input.displayName?.trim() || numberE164,
      credentialId,
      assistantId: assistant.id,
    });

    if (!phone?.id) {
      await rollback("vapi_number", "no id returned");
      return fail("The provider did not accept this number", 502);
    }
    vapiPhoneNumberId = phone.id;

    // 5) The line — 'pending' until a real call proves the tenant controls the number.
    const { data: line, error: lineErr } = await supabaseAdmin
      .from("phone_lines")
      .insert({
        org_id: orgId,
        vapi_phone_number_id: phone.id,
        phone_number_e164: numberE164,
        status: "live",
        line_type: lineType,
        assigned_agent_id: agent.id,
        provider: "byo_sip",
        sip_trunk_id: trunkRowId,
        verification_status: "pending",
        connected_by: userId,
      })
      .select("id")
      .single<{ id: string }>();

    if (lineErr || !line) {
      // A unique violation here means the number is already claimed — by this org or another.
      const claimed = lineErr?.code === "23505";
      await rollback("phone_line_row", lineErr?.message ?? "no row");
      return claimed
        ? fail("This number is already connected to a workspace", 409)
        : fail("Could not save the phone line", 500);
    }

    // 6) The link workspace pause depends on (R-140). Non-fatal by the same reasoning as the
    //    purchase path, but logged loudly — an unlinked line cannot be paused.
    const link = await linkAgentToPhoneNumber({
      orgId,
      agentId: agent.id,
      vapiPhoneNumberId: phone.id,
    });
    if (!link.ok) {
      console.error("[connectByo] agent↔number link failed (non-fatal):", link.error);
    }

    const dest = sipDestinationForLine(numberE164, credentialId);
    const known =
      carrierKey && carrierKey in KNOWN_SIP_CARRIERS
        ? KNOWN_SIP_CARRIERS[carrierKey as KnownCarrierKey]
        : null;

    logEvent({
      tag: "[PHONE_LINES][CONNECT][SUCCESS]",
      ts: Date.now(),
      stage: "CALL",
      source: "system",
      org_id: orgId,
      severity: "info",
      details: {
        line_id: line.id,
        trunk_id: trunkRowId,
        carrier: carrierKey,
        number: maskNumber(numberE164),
        verification: "pending",
      },
    });

    return {
      ok: true,
      lineId: line.id,
      trunkId: trunkRowId ?? undefined,
      verificationStatus: "pending",
      instructions: {
        forwardHost: dest.host,
        forwardPort: dest.port,
        perCredentialUri: dest.perCredentialUri,
        calledPrefix: known?.calledPrefix,
        callerPrefix: known?.callerPrefix,
        vapiInboundIps: VAPI_INBOUND_IPS,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await rollback("unexpected", message);
    const status = /Vapi error 4\d\d:/.test(message) ? 400 : 502;
    return fail(message.replace(/^Vapi error \d+: /, "").trim() || "Could not connect this number", status);
  }
}

function fail(error: string, status: number): ConnectByoResult {
  return { ok: false, error, status };
}

/** Same masking convention as the rest of the codebase: first 4 + last 4. */
function maskNumber(n: string): string {
  return n.length <= 8 ? n : `${n.slice(0, 4)}…${n.slice(-4)}`;
}
