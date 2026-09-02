import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/auth/permissions";
import { deleteConnection, getConnection, listConnections } from "@/lib/commerce/connections";
import { readerFor } from "@/lib/commerce/registry";
import { invalidateConnectionCache } from "@/lib/commerce/providers/ideasoft/http";

export const dynamic = "force-dynamic";

/**
 * The connection's own endpoints: check it, and drop it.
 *
 * `POST` runs a live read against the store — the same one the AI's tools make — and reports what
 * came back. It exists because "connected" is a claim about the past: a token can be revoked in
 * the store's panel, or the app's permissions narrowed, and nothing tells us until a customer asks
 * a question we then cannot answer. A button that says *right now* is worth more than a status
 * column.
 *
 * `DELETE` removes the row, and with it both credentials. There is nothing worth keeping: the
 * client secret cannot be reused without the store's grant, and the refresh token is dead the
 * moment the owner revokes the app.
 */

const TestSchema = z.object({ connectionId: z.string().uuid() });

export async function GET() {
  const gate = await guard("manage_integrations");
  if (!gate.ok) return gate.response;

  const connections = await listConnections(gate.viewer.orgId);
  return NextResponse.json({ ok: true, connections });
}

export async function POST(request: NextRequest) {
  const gate = await guard("manage_integrations");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 400 });

  // Scoped by org: a connection id from another workspace resolves to nothing.
  const connection = await getConnection(gate.viewer.orgId, parsed.data.connectionId);
  if (!connection) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  if (connection.status === "pending") {
    return NextResponse.json({
      ok: false,
      error: "NOT_AUTHORIZED",
      message: "This store has not been approved yet. Finish the approval in your IdeaSoft panel.",
    });
  }

  // A test that reads a cached answer tests nothing.
  invalidateConnectionCache(connection.id);

  try {
    const result = await readerFor(connection).verify();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: "VERIFY_FAILED", message: result.reason });
    }
    return NextResponse.json({ ok: true, message: "The store answered. Your AI can read the catalogue." });
  } catch (err) {
    console.error("[COMMERCE][IDEASOFT][TEST][ERROR]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "VERIFY_FAILED", message: "The store could not be reached." });
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await guard("manage_integrations");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 400 });

  invalidateConnectionCache(parsed.data.connectionId);
  const removed = await deleteConnection(gate.viewer.orgId, parsed.data.connectionId);
  if (!removed) return NextResponse.json({ ok: false, error: "DELETE_FAILED" }, { status: 500 });

  console.info("[COMMERCE][IDEASOFT][DISCONNECTED]", {
    org_id: gate.viewer.orgId,
    connection_id: parsed.data.connectionId,
  });
  return NextResponse.json({ ok: true });
}
