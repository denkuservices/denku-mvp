import { describe, it, expect, beforeEach, vi } from "vitest";

// The service-role singleton throws at import without env; we always inject a fake db,
// so a no-op stub is sufficient (matches the repo's test convention).
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { ensureContact } from "@/lib/platform/contacts";
import { ensureConversation, appendMessage } from "@/lib/platform/conversations";

/**
 * Minimal in-memory fake of the Supabase query builder — enough to exercise the real
 * idempotency logic of the platform helpers, including the unique-constraint (23505)
 * paths. Enforces the same unique keys as the migrations:
 *   contact_identities (org_id, channel, external_id)
 *   conversations      (org_id, channel, external_thread_id)
 *   messages           (conversation_id, external_message_id)
 */

let idSeq = 0;
const uid = () => `id-${++idSeq}`;

const UNIQUE_KEYS: Record<string, string[]> = {
  contact_identities: ["org_id", "channel", "external_id"],
  conversations: ["org_id", "channel", "external_thread_id"],
  messages: ["conversation_id", "external_message_id"],
};

class FakeError extends Error {
  code: string;
  constructor(code: string, msg: string) {
    super(msg);
    this.code = code;
  }
}

function makeDb() {
  const tables: Record<string, any[]> = {
    contacts: [],
    contact_identities: [],
    conversations: [],
    messages: [],
  };

  function uniqueViolation(table: string, row: any): boolean {
    const keys = UNIQUE_KEYS[table];
    if (!keys) return false;
    // Only enforce when all key columns are non-null (partial indexes).
    if (keys.some((k) => row[k] === null || row[k] === undefined)) return false;
    return tables[table].some((r) => keys.every((k) => r[k] === row[k]));
  }

  class Builder {
    table: string;
    op: "select" | "insert" | "update" | "delete" = "select";
    filters: Array<[string, any]> = [];
    nullFilters: string[] = [];
    payload: any = null;
    constructor(table: string) {
      this.table = table;
    }
    select() {
      return this;
    }
    eq(col: string, val: any) {
      this.filters.push([col, val]);
      return this;
    }
    is(col: string, _val: null) {
      this.nullFilters.push(col);
      return this;
    }
    insert(row: any) {
      this.op = "insert";
      this.payload = row;
      return this;
    }
    update(patch: any) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    _match(r: any) {
      return (
        this.filters.every(([c, v]) => r[c] === v) &&
        this.nullFilters.every((c) => r[c] === null || r[c] === undefined)
      );
    }
    _run() {
      if (this.op === "insert") {
        if (uniqueViolation(this.table, this.payload)) {
          return { data: null, error: new FakeError("23505", "duplicate key") };
        }
        const row = { id: uid(), ...this.payload };
        tables[this.table].push(row);
        return { data: row, error: null };
      }
      if (this.op === "update") {
        for (const r of tables[this.table]) if (this._match(r)) Object.assign(r, this.payload);
        return { data: null, error: null };
      }
      if (this.op === "delete") {
        tables[this.table] = tables[this.table].filter((r) => !this._match(r));
        return { data: null, error: null };
      }
      const rows = tables[this.table].filter((r) => this._match(r));
      return { data: rows, error: null };
    }
    single() {
      const res = this._run();
      if (res.error) return Promise.resolve(res);
      const rows = Array.isArray(res.data) ? res.data : [res.data];
      return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : new FakeError("PGRST116", "no rows") });
    }
    maybeSingle() {
      const res = this._run();
      if (res.error) return Promise.resolve(res);
      const rows = Array.isArray(res.data) ? res.data : [res.data];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }
    then(resolve: (v: any) => void) {
      resolve(this._run());
    }
  }

  return {
    tables,
    from(table: string) {
      return new Builder(table);
    },
  } as any;
}

beforeEach(() => {
  idSeq = 0;
});

describe("ensureContact (idempotent identity resolution)", () => {
  it("creates a contact + identity on first sight, reuses it on repeat", async () => {
    const db = makeDb();
    const a = await ensureContact({ orgId: "o1", channel: "voice", externalId: "+13215551234", displayName: "Jane" }, db);
    const b = await ensureContact({ orgId: "o1", channel: "voice", externalId: "+13215551234" }, db);
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(db.tables.contacts.length).toBe(1);
    expect(db.tables.contact_identities.length).toBe(1);
  });

  it("same external id under a different channel is a different identity", async () => {
    const db = makeDb();
    await ensureContact({ orgId: "o1", channel: "voice", externalId: "x" }, db);
    await ensureContact({ orgId: "o1", channel: "instagram", externalId: "x" }, db);
    expect(db.tables.contact_identities.length).toBe(2);
  });

  it("is org-scoped — same identity in another org is separate", async () => {
    const db = makeDb();
    const a = await ensureContact({ orgId: "o1", channel: "voice", externalId: "+1" }, db);
    const b = await ensureContact({ orgId: "o2", channel: "voice", externalId: "+1" }, db);
    expect(a).not.toBe(b);
    expect(db.tables.contacts.length).toBe(2);
  });

  it("returns null on missing inputs (no throw)", async () => {
    const db = makeDb();
    expect(await ensureContact({ orgId: "", channel: "voice", externalId: "x" }, db)).toBeNull();
    expect(await ensureContact({ orgId: "o1", channel: "voice", externalId: "" }, db)).toBeNull();
  });
});

describe("ensureConversation (idempotent per channel thread)", () => {
  it("one conversation per (org, channel, thread); repeat resolves to same id", async () => {
    const db = makeDb();
    const a = await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-1", agentId: "ag1" }, db);
    const b = await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-1" }, db);
    expect(a).toBe(b);
    expect(db.tables.conversations.length).toBe(1);
  });

  it("backfills contact_id when it becomes known later", async () => {
    const db = makeDb();
    const id = await ensureConversation({ orgId: "o1", channel: "instagram", externalThreadId: "t1" }, db);
    await ensureConversation({ orgId: "o1", channel: "instagram", externalThreadId: "t1", contactId: "c9" }, db);
    const row = db.tables.conversations.find((r: any) => r.id === id);
    expect(row.contact_id).toBe("c9");
  });

  it("different threads → different conversations", async () => {
    const db = makeDb();
    await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-1" }, db);
    await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-2" }, db);
    expect(db.tables.conversations.length).toBe(2);
  });
});

describe("appendMessage (idempotent by external_message_id)", () => {
  it("appends and advances conversation recency", async () => {
    const db = makeDb();
    const conv = await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-1" }, db);
    const m = await appendMessage(
      { orgId: "o1", conversationId: conv!, role: "user", content: "hi", externalMessageId: "mid-1", createdAt: "2026-07-24T00:00:00Z" },
      db
    );
    expect(m).toBeTruthy();
    expect(db.tables.messages.length).toBe(1);
    const row = db.tables.conversations.find((r: any) => r.id === conv);
    expect(row.last_message_at).toBe("2026-07-24T00:00:00Z");
  });

  it("does not double-insert the same channel message; returns existing id", async () => {
    const db = makeDb();
    const conv = await ensureConversation({ orgId: "o1", channel: "instagram", externalThreadId: "t1" }, db);
    const first = await appendMessage({ orgId: "o1", conversationId: conv!, role: "user", content: "hi", externalMessageId: "mid-9" }, db);
    const again = await appendMessage({ orgId: "o1", conversationId: conv!, role: "user", content: "hi", externalMessageId: "mid-9" }, db);
    expect(again).toBe(first);
    expect(db.tables.messages.length).toBe(1);
  });

  it("messages without external id are always appended (synthetic turns)", async () => {
    const db = makeDb();
    const conv = await ensureConversation({ orgId: "o1", channel: "voice", externalThreadId: "call-1" }, db);
    await appendMessage({ orgId: "o1", conversationId: conv!, role: "assistant", content: "a" }, db);
    await appendMessage({ orgId: "o1", conversationId: conv!, role: "assistant", content: "b" }, db);
    expect(db.tables.messages.length).toBe(2);
  });
});
