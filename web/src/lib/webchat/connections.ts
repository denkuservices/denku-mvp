import "server-only";

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeAllowedOrigin } from "@/lib/webchat/origins";
import { sanitizeTheme, type WebChatTheme } from "@/lib/webchat/theme";

/**
 * Web Chat install lifecycle: create an embed, say where it may run, point it at an Employee.
 *
 * The shape mirrors `lib/telegram/connections.ts` deliberately — same lifecycle verbs, same
 * never-throw discipline, same service-role-only access — so that the two channels stay
 * readable side by side. Two things differ, and both come from the same fact: the credential
 * here is public.
 *
 *   - **Nothing is encrypted, because nothing is secret.** The site key is printed in the
 *     customer's page source. Pretending otherwise (encrypting it, hiding it behind a reveal
 *     button) would be security theatre that makes the real control — the origin allowlist —
 *     look optional.
 *   - **Creating an install is not the same as switching it on.** A connection with an empty
 *     `allowed_origins` answers nobody, by design (see the migration). The UI therefore asks
 *     for the domain in the same breath as it hands over the snippet.
 */

export interface WebChatConnection {
  id: string;
  orgId: string;
  siteKey: string;
  siteName: string | null;
  allowedOrigins: string[];
  assignedAgentId: string | null;
  displayName: string | null;
  accentColor: string | null;
  greeting: string | null;
  /** Widget colours. Always sanitized — see lib/webchat/theme.ts. */
  theme: WebChatTheme;
  status: "connected" | "disconnected" | "error";
  lastError: string | null;
  lastInboundAt: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  org_id: string;
  site_key: string;
  site_name: string | null;
  allowed_origins: string[] | null;
  assigned_agent_id: string | null;
  display_name: string | null;
  accent_color: string | null;
  greeting: string | null;
  theme: unknown;
  status: WebChatConnection["status"];
  last_error: string | null;
  last_inbound_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, org_id, site_key, site_name, allowed_origins, assigned_agent_id, display_name, accent_color, greeting, theme, status, last_error, last_inbound_at, created_at";

function toConnection(row: Row): WebChatConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    siteKey: row.site_key,
    siteName: row.site_name,
    allowedOrigins: row.allowed_origins ?? [],
    assignedAgentId: row.assigned_agent_id,
    displayName: row.display_name,
    accentColor: row.accent_color,
    greeting: row.greeting,
    theme: sanitizeTheme(row.theme),
    status: row.status,
    lastError: row.last_error,
    lastInboundAt: row.last_inbound_at,
    createdAt: row.created_at,
  };
}

/**
 * The public key that identifies one install.
 *
 * Prefixed so that a key found in a page source, a log, or a support ticket is instantly
 * recognisable for what it is — and, just as importantly, recognisable as *not* a secret. 16
 * random bytes is far more entropy than the threat model needs (guessing one buys you nothing
 * without a matching Origin), but it costs nothing and removes enumeration from the picture.
 */
export function generateSiteKey(): string {
  return `dkweb_${randomBytes(16).toString("hex")}`;
}

/**
 * `example.com` and `www.example.com`, given either one.
 *
 * A shop owner types the address they say out loud. Which of the two their server actually serves —
 * and whether it redirects to the other — is a detail they have never had to think about, and the
 * punishment for guessing wrong is a widget that silently does not load. So we cover both.
 *
 * This is not a widening: the apex and its `www` are the same DNS owner, always. A real widening
 * would be `*.example.com`, which also covers `blog.`, `staging.` and `shop.` — that stays an
 * explicit choice the customer has to make.
 *
 * Deliberately conservative about WHEN it pairs: exactly `www.<two labels>` or a bare two-label
 * host. `shop.example.com` gets no `www.shop.example.com` (noise), and `example.co.uk` gets no
 * pair either, because knowing that `co.uk` is a suffix and not a subdomain needs the public
 * suffix list. Those customers add the second line by hand — which fails safe, not broken.
 */
function originSibling(origin: string): string | null {
  const sep = origin.indexOf("//") + 2;
  const host = origin.slice(sep);
  if (host.startsWith("*.")) return null;

  if (host.startsWith("www.")) {
    const bare = host.slice(4);
    return bare.split(".").length === 2 ? `${origin.slice(0, sep)}${bare}` : null;
  }
  return host.split(".").length === 2 ? `${origin.slice(0, sep)}www.${host}` : null;
}

/**
 * Clean a customer-entered domain list into stored origins. Invalid entries are dropped, and the
 * apex/www sibling of each entry is added so the customer does not have to know which one their
 * own site serves.
 */
export function normalizeOriginList(input: string[] | string): string[] {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(/[\s,\n]+/);
  const out: string[] = [];
  const add = (value: string | null) => {
    if (value && !out.includes(value)) out.push(value);
  };

  for (const part of parts) {
    const normalized = normalizeAllowedOrigin(String(part ?? ""));
    if (!normalized) continue;
    add(normalized);
    add(originSibling(normalized));
  }
  return out;
}

/** Inbound resolution for the public endpoints. Never throws. */
export async function getConnectionBySiteKey(siteKey: string): Promise<WebChatConnection | null> {
  if (!siteKey) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("web_chat_connections")
      .select(COLUMNS)
      .eq("site_key", siteKey)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[WEBCHAT][CONNECTION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getConnectionById(connectionId: string): Promise<WebChatConnection | null> {
  if (!connectionId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("web_chat_connections")
      .select(COLUMNS)
      .eq("id", connectionId)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[WEBCHAT][CONNECTION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function listConnections(orgId: string): Promise<WebChatConnection[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("web_chat_connections")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Row[]).map(toConnection);
  } catch (err) {
    console.error("[WEBCHAT][CONNECTION][LIST][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export interface CreateResult {
  ok: boolean;
  connection?: WebChatConnection;
  /** A sentence a shop owner can act on — shown in the UI verbatim. */
  error?: string;
}

export async function createConnection(input: {
  orgId: string;
  siteName?: string | null;
  allowedOrigins?: string[] | string;
  assignedAgentId?: string | null;
  createdBy?: string | null;
}): Promise<CreateResult> {
  const { orgId } = input;
  if (!orgId) return { ok: false, error: "No workspace." };

  /**
   * One install per workspace unless someone deliberately asks for more.
   *
   * The table allows several (a group with three brand sites), but the common case is one
   * website, and a customer who clicks "Create" twice means "show me the snippet again", not
   * "give me a second install whose messages I will then wonder about".
   */
  const existing = await listConnections(orgId);
  if (existing.length > 0) return { ok: true, connection: existing[0] };

  // One employee in the workspace means there is no choice to make — so we make it. Same rule
  // as Telegram: an unassigned channel receives messages and answers none of them.
  let assignedAgentId = input.assignedAgentId ?? null;
  if (!assignedAgentId) {
    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(2);
    if (agents?.length === 1) assignedAgentId = agents[0].id as string;
  }

  const row = {
    org_id: orgId,
    site_key: generateSiteKey(),
    site_name: input.siteName?.trim() || null,
    allowed_origins: normalizeOriginList(input.allowedOrigins ?? []),
    assigned_agent_id: assignedAgentId,
    created_by: input.createdBy ?? null,
    status: "connected" as const,
  };

  const saved = await supabaseAdmin.from("web_chat_connections").insert(row).select(COLUMNS).single<Row>();
  if (saved.error || !saved.data) {
    console.error("[WEBCHAT][CREATE][FAILED]", saved.error?.message);
    return { ok: false, error: "Could not create the chat widget. Try again." };
  }

  console.info("[WEBCHAT][CREATE][OK]", { org_id: orgId, connection_id: saved.data.id });
  return { ok: true, connection: toConnection(saved.data) };
}

export interface UpdateInput {
  siteName?: string | null;
  allowedOrigins?: string[] | string;
  assignedAgentId?: string | null;
  displayName?: string | null;
  accentColor?: string | null;
  greeting?: string | null;
  theme?: unknown;
  status?: WebChatConnection["status"];
}

/** Every write is scoped by org_id: there is no RLS safety net under the service-role client. */
export async function updateConnection(
  orgId: string,
  connectionId: string,
  patch: UpdateInput
): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !connectionId) return { ok: false, error: "Missing connection." };

  const row: Record<string, unknown> = {};
  if (patch.siteName !== undefined) row.site_name = patch.siteName?.trim() || null;
  if (patch.allowedOrigins !== undefined) row.allowed_origins = normalizeOriginList(patch.allowedOrigins);
  if (patch.assignedAgentId !== undefined) row.assigned_agent_id = patch.assignedAgentId;
  if (patch.displayName !== undefined) row.display_name = patch.displayName?.trim() || null;
  if (patch.accentColor !== undefined) row.accent_color = patch.accentColor?.trim() || null;
  if (patch.greeting !== undefined) row.greeting = patch.greeting?.trim() || null;
  // Sanitized on the way in, so a bad colour can never reach a visitor's browser even if it
  // reached the database some other way.
  if (patch.theme !== undefined) row.theme = sanitizeTheme(patch.theme);
  if (patch.status !== undefined) {
    row.status = patch.status;
    // Re-enabling clears the stale error that put the card in "needs attention"; leaving it
    // would make a fixed install look permanently broken.
    if (patch.status === "connected") row.last_error = null;
  }

  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from("web_chat_connections")
    .update(row)
    .eq("id", connectionId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[WEBCHAT][UPDATE][FAILED]", error.message);
    return { ok: false, error: "Could not save those settings. Try again." };
  }
  return { ok: true };
}

/**
 * Issue a new site key and invalidate the old one.
 *
 * The one real remedy this channel has. A site key cannot be "stolen" in the usual sense — it
 * is public — but a snippet outlives the site it was pasted into, and rotating is how a
 * customer stops an install they no longer control. Existing conversations are untouched: they
 * belong to the connection id, not to the key.
 */
export async function rotateSiteKey(
  orgId: string,
  connectionId: string
): Promise<{ ok: boolean; siteKey?: string; error?: string }> {
  if (!orgId || !connectionId) return { ok: false, error: "Missing connection." };
  const siteKey = generateSiteKey();

  const { error } = await supabaseAdmin
    .from("web_chat_connections")
    .update({ site_key: siteKey })
    .eq("id", connectionId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[WEBCHAT][ROTATE][FAILED]", error.message);
    return { ok: false, error: "Could not issue a new key. Try again." };
  }
  console.info("[WEBCHAT][ROTATE][OK]", { org_id: orgId, connection_id: connectionId });
  return { ok: true, siteKey };
}

/** Remove the install. Sessions cascade; the conversations they produced survive. */
export async function deleteConnection(
  orgId: string,
  connectionId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !connectionId) return { ok: false, error: "Missing connection." };
  const { error } = await supabaseAdmin
    .from("web_chat_connections")
    .delete()
    .eq("id", connectionId)
    .eq("org_id", orgId);
  if (error) {
    console.error("[WEBCHAT][DELETE][FAILED]", error.message);
    return { ok: false, error: "Could not remove the widget. Try again." };
  }
  console.info("[WEBCHAT][DELETE][OK]", { connection_id: connectionId });
  return { ok: true };
}

/** Record a problem so the Channels card can surface it (connectionHealth). Never throws. */
export async function markError(connectionId: string, message: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("web_chat_connections")
      .update({ status: "error", last_error: message.slice(0, 500) })
      .eq("id", connectionId);
  } catch {
    /* health reporting must never be the thing that fails */
  }
}

/** Touch on successful inbound — the difference between "installed" and "actually working". */
export async function markInbound(connectionId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("web_chat_connections")
      .update({ last_inbound_at: new Date().toISOString(), last_error: null })
      .eq("id", connectionId);
  } catch {
    /* never fail a delivery over a timestamp */
  }
}
