import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth/permissions";
import { normalizeStoreUrl } from "@/lib/commerce/storeUrl";
import { startConnect } from "@/lib/commerce/connections";
import { ideasoftAuthorizeUrl, ideasoftRedirectUri } from "@/lib/commerce/providers/ideasoft/oauth";

export const dynamic = "force-dynamic";

/**
 * Step one of connecting a store: keep the credentials, hand back the address to approve at.
 *
 * The customer has already created an API app in their own IdeaSoft panel (Entegrasyonlar → API
 * → Ekle) with our redirect URL, and copied out the client id and secret. This route stores those
 * against their workspace with a fresh `state` nonce and returns the authorize URL. It does NOT
 * redirect: the caller is a form on our own dashboard, and returning JSON lets it show a real
 * error instead of bouncing the browser to a store page that says nothing useful.
 *
 * Nothing here is usable yet — the row is `pending` until the callback exchanges a code.
 */

const BodySchema = z.object({
  storeUrl: z.string().min(3).max(255),
  clientId: z.string().min(4).max(255),
  clientSecret: z.string().min(4).max(512),
  storeLabel: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  /**
   * `manage_channels`, not a signed-in check.
   *
   * These credentials read a business's entire catalogue and, with the same grant, its orders. A
   * viewer must not be able to point that at a store — the same reasoning that closed the billing
   * routes in the capability-matrix work (landmine #16).
   */
  const gate = await guard("manage_integrations");
  if (!gate.ok) return gate.response;
  const orgId = gate.viewer.orgId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_FAILED", message: "Fill in the store address, client ID and secret." },
      { status: 400 }
    );
  }

  // The security boundary, not formatting: everything downstream makes server-side requests to
  // whatever this returns, with a bearer token attached.
  const store = normalizeStoreUrl(parsed.data.storeUrl);
  if (!store.ok) {
    return NextResponse.json({ ok: false, error: "INVALID_STORE_URL", message: store.reason }, { status: 400 });
  }

  const started = await startConnect({
    orgId,
    provider: "ideasoft",
    storeBaseUrl: store.url,
    storeLabel: parsed.data.storeLabel?.trim() || null,
    clientId: parsed.data.clientId.trim(),
    clientSecret: parsed.data.clientSecret.trim(),
  });

  if (!started.ok) {
    return NextResponse.json({ ok: false, error: "CONNECT_FAILED", message: started.reason }, { status: 500 });
  }

  console.info("[COMMERCE][IDEASOFT][CONNECT][STARTED]", {
    org_id: orgId,
    connection_id: started.connectionId,
    store_host: store.host,
  });

  return NextResponse.json({
    ok: true,
    connectionId: started.connectionId,
    authorizeUrl: ideasoftAuthorizeUrl(store.url, parsed.data.clientId.trim(), started.state),
    // Echoed so the UI can show the customer exactly what must be registered on their side —
    // a redirect_uri mismatch is the single most common way this flow fails.
    redirectUri: ideasoftRedirectUri(),
  });
}
