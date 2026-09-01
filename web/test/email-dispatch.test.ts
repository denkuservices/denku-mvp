import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The send-exactly-once protocol.
 *
 * Every email added in this sprint hangs off something that fires twice — Stripe
 * redelivers webhooks, activation resumes from partial, crons re-run. The claim ledger is
 * the only thing between that and a customer receiving the same receipt three times, so
 * its three states are pinned here: claim → send, duplicate → silence, failure → release
 * so a retry can still deliver.
 */

const insert = vi.fn();
const del = vi.fn();
const send = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (_table: string) => ({
      insert: (row: unknown) => insert(row),
      delete: () => ({
        eq: () => ({
          eq: () => del(),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/email/resend", () => ({
  resend: { emails: { send: (args: unknown) => send(args) } },
  RESEND_API_KEY: "test",
}));

import { sendOnce } from "@/lib/email/dispatch";

const mail = {
  kind: "payment_receipt" as const,
  dedupeKey: "in_123",
  to: "owner@acme.com",
  subject: "Payment received — $399.00",
  html: "<p>hi</p>",
  orgId: "org-1",
};

beforeEach(() => {
  insert.mockReset();
  del.mockReset();
  send.mockReset();
});

describe("sendOnce", () => {
  it("claims, then sends", async () => {
    insert.mockResolvedValue({ error: null });
    send.mockResolvedValue({ error: null });

    const result = await sendOnce(mail);

    expect(result).toEqual({ ok: true, sent: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "payment_receipt", dedupe_key: "in_123", org_id: "org-1" })
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });

  it("stays silent when the same event is delivered twice", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } });

    const result = await sendOnce(mail);

    expect(result).toEqual({ ok: true, sent: false, reason: "duplicate" });
    expect(send).not.toHaveBeenCalled();
  });

  it("gives the claim back when the send fails, so a retry can deliver", async () => {
    insert.mockResolvedValue({ error: null });
    send.mockResolvedValue({ error: { message: "422 validation_error" } });
    del.mockResolvedValue({ error: null });

    const result = await sendOnce(mail);

    expect(result).toEqual({ ok: false, sent: false, error: "422 validation_error" });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("refuses to send when the claim cannot be recorded — silence beats a duplicate receipt", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });

    const result = await sendOnce(mail);

    expect(result.sent).toBe(false);
    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("never throws when the ledger blows up mid-flight", async () => {
    insert.mockRejectedValue(new Error("connection reset"));
    del.mockResolvedValue({ error: null });

    await expect(sendOnce(mail)).resolves.toMatchObject({ ok: false, sent: false });
  });

  it("does nothing without a recipient", async () => {
    const result = await sendOnce({ ...mail, to: "  " });
    expect(result).toEqual({ ok: true, sent: false, reason: "no_recipient" });
    expect(insert).not.toHaveBeenCalled();
  });
});
