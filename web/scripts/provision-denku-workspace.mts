/**
 * Make Denku a customer of Denku.
 *
 *   npx vite-node --config vitest.config.ts scripts/provision-denku-workspace.mts --dry-run
 *   npx vite-node --config vitest.config.ts scripts/provision-denku-workspace.mts
 *
 * Creates the workspace the landing page's chat widget answers on: an org marked `is_internal`,
 * its settings, an employee bound to Denku's own Vapi assistant, a Web Chat connection whose
 * allowlist is denku.io, and the activation row that lets the AI reply there.
 *
 * Idempotent by natural key, so re-running it repairs a partial run rather than making a second
 * workspace. Every step reports created / already present.
 *
 * **It deliberately does NOT create a `profiles` row.** A profile is what lets a human open that
 * workspace's Inbox — and `getActiveOrgId` picks a user's MOST RECENTLY UPDATED profile with no
 * switcher anywhere in the UI, so adding one would move whoever it names into this workspace with
 * no way back except SQL. That is a decision for the owner, not for a provisioning script. The
 * script prints the one statement that does it.
 *
 * Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment.
 */

import { createClient } from "@supabase/supabase-js";
import { generateSiteKey, normalizeOriginList } from "../src/lib/webchat/connections";

const DRY = process.argv.includes("--dry-run");

const ORG_NAME = "Denku";
const AGENT_NAME = "Denku";
const SITE_NAME = "denku.io";
/** Created by `scripts/register-denku-agent.mts`. */
const DENKU_ASSISTANT_ID = process.env.VAPI_DENKU_ASSISTANT_ID || "a7846579-78b9-451a-8821-2c5764a3fc6f";
/** The account rows are attributed to. `agents.created_by` is NOT NULL. */
const OWNER_USER_ID = process.env.DENKU_OWNER_USER_ID || "f3041e15-d190-44f4-ba92-00b6828ced9d";

const ORIGINS = ["https://denku.io", "https://www.denku.io"];

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`\n  Missing ${name}. Set it in web/.env.local and re-run.\n`);
    process.exit(1);
  }
  return v;
}

const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

function say(step: string, state: string, detail = "") {
  console.log(`  ${step.padEnd(22)} ${state.padEnd(16)} ${detail}`);
}

async function main() {
  console.log(`\nDenku workspace${DRY ? " (dry run — nothing is written)" : ""}\n`);

  // ── org ────────────────────────────────────────────────────────────────────────────────────
  const existingOrg = await db.from("orgs").select("id, name, is_internal").eq("name", ORG_NAME).maybeSingle();
  if (existingOrg.error) throw new Error(`orgs read: ${existingOrg.error.message}`);

  let orgId: string;
  if (existingOrg.data) {
    orgId = existingOrg.data.id as string;
    say("org", "exists", orgId);
    if (!existingOrg.data.is_internal && !DRY) {
      await db.from("orgs").update({ is_internal: true }).eq("id", orgId);
      say("org.is_internal", "set true");
    }
  } else if (DRY) {
    orgId = "<new>";
    say("org", "would create", ORG_NAME);
  } else {
    const created = await db
      .from("orgs")
      // `created_by` is NOT NULL on this table, unlike most — every org so far was made by a
      // signup, so nothing had ever inserted one without a user behind it.
      .insert({ name: ORG_NAME, is_internal: true, created_by: OWNER_USER_ID })
      .select("id")
      .single();
    if (created.error) throw new Error(`orgs insert: ${created.error.message}`);
    orgId = created.data.id as string;
    say("org", "CREATED", orgId);
  }

  // ── settings ───────────────────────────────────────────────────────────────────────────────
  if (!DRY) {
    const s = await db.from("organization_settings").select("org_id").eq("org_id", orgId).maybeSingle();
    if (!s.data) {
      const { error } = await db.from("organization_settings").insert({
        org_id: orgId,
        name: ORG_NAME,
        default_language: "en",
        default_timezone: "Europe/Istanbul",
        // 6 = live. This workspace never goes through onboarding: it has no plan to buy and no
        // number to provision, and a half-finished step would gate the dashboard for anyone
        // later given access to it.
        onboarding_step: 6,
        onboarding_completed_at: new Date().toISOString(),
        // Denku's own enquiries should not email Denku on every artifact — the Inbox is the
        // surface, and the notification address would be a Denku address, which is exactly the
        // self-feeding loop the email channel guards against.
        notify_on_artifacts: false,
      });
      if (error) throw new Error(`organization_settings: ${error.message}`);
      say("settings", "CREATED", "onboarding_step=6");
    } else {
      say("settings", "exists");
    }
  } else {
    say("settings", "would create", "onboarding_step=6");
  }

  // ── employee ───────────────────────────────────────────────────────────────────────────────
  let agentId: string | null = null;
  if (!DRY) {
    const a = await db
      .from("agents")
      .select("id, vapi_assistant_id")
      .eq("org_id", orgId)
      .eq("name", AGENT_NAME)
      .maybeSingle();

    if (a.data) {
      agentId = a.data.id as string;
      say("employee", "exists", agentId);
      if (a.data.vapi_assistant_id !== DENKU_ASSISTANT_ID) {
        await db.from("agents").update({ vapi_assistant_id: DENKU_ASSISTANT_ID }).eq("id", agentId);
        say("employee.assistant", "repointed", DENKU_ASSISTANT_ID);
      }
    } else {
      const created = await db
        .from("agents")
        .insert({
          org_id: orgId,
          name: AGENT_NAME,
          language: "en",
          // Denku's own site is read in four languages, and a visitor should be answered in the
          // one they are reading.
          additional_languages: ["es", "de", "tr"],
          timezone: "Europe/Istanbul",
          created_by: OWNER_USER_ID,
          vapi_assistant_id: DENKU_ASSISTANT_ID,
          behavior_preset: "concierge",
        })
        .select("id")
        .single();
      if (created.error) throw new Error(`agents insert: ${created.error.message}`);
      agentId = created.data.id as string;
      say("employee", "CREATED", agentId);
    }
  } else {
    say("employee", "would create", `assistant ${DENKU_ASSISTANT_ID}`);
  }

  // ── web chat connection ────────────────────────────────────────────────────────────────────
  let siteKey = "<new>";
  if (!DRY) {
    const c = await db
      .from("web_chat_connections")
      .select("id, site_key, allowed_origins")
      .eq("org_id", orgId)
      .maybeSingle();

    if (c.data) {
      siteKey = c.data.site_key as string;
      say("web chat", "exists", siteKey);
      const want = normalizeOriginList(ORIGINS);
      const have = (c.data.allowed_origins ?? []) as string[];
      if (want.some((o) => !have.includes(o))) {
        await db
          .from("web_chat_connections")
          .update({ allowed_origins: want })
          .eq("id", c.data.id as string);
        say("web chat origins", "updated", want.join(", "));
      }
    } else {
      siteKey = generateSiteKey();
      const { error } = await db.from("web_chat_connections").insert({
        org_id: orgId,
        site_key: siteKey,
        site_name: SITE_NAME,
        // The allowlist is this channel's entire access model, and an empty one refuses
        // everywhere. Both hosts, because denku.io redirects to www but a browser sends the
        // Referer of the page it is actually on.
        allowed_origins: normalizeOriginList(ORIGINS),
        assigned_agent_id: agentId,
        display_name: "Denku",
        status: "connected",
        created_by: OWNER_USER_ID,
      });
      if (error) throw new Error(`web_chat_connections: ${error.message}`);
      say("web chat", "CREATED", siteKey);
    }
  } else {
    say("web chat", "would create", ORIGINS.join(", "));
  }

  // ── activation ─────────────────────────────────────────────────────────────────────────────
  if (!DRY) {
    const { error } = await db
      .from("org_active_channels")
      .upsert({ org_id: orgId, channel: "web", activated_by: OWNER_USER_ID }, { onConflict: "org_id,channel" });
    if (error) throw new Error(`org_active_channels: ${error.message}`);
    say("channel 'web'", "active");
  } else {
    say("channel 'web'", "would activate");
  }

  console.log(`\n  DENKU_SELF_ORG_ID=${orgId}`);
  console.log(`  site key:        ${siteKey}\n`);
  console.log("  Giving a person access to this workspace's Inbox is an UPDATE, never an");
  console.log("  INSERT:\n");
  console.log(`    update profiles set org_id = '${orgId}', updated_at = now()`);
  console.log(`    where id = '${OWNER_USER_ID}';\n`);
  console.log("  A SECOND profiles row would split the two resolvers and authorize against");
  console.log("  the WRONG workspace: getViewer() matches on `id` first and would keep");
  console.log("  finding the old row, while getActiveOrgId() matches on `auth_user_id`");
  console.log("  ordered by updated_at and would find the new one. CLAUDE.md landmine #16.");
  console.log("  It MOVES that person - there is no workspace switcher in the UI - and it");
  console.log("  is reversed by setting org_id back.\n");
}

main().catch((err) => {
  console.error("\n  FAILED:", err instanceof Error ? err.message : String(err), "\n");
  process.exit(1);
});
