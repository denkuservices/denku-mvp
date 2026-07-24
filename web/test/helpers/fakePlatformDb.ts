/**
 * Minimal in-memory fake of the Supabase query builder for platform-model tests.
 * Enforces the same unique keys as the Sprint 4.5 migrations so idempotency (incl. the
 * 23505 paths) is genuinely exercised without a live DB.
 */

let idSeq = 0;
export function resetFakeIds() {
  idSeq = 0;
}
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

export interface FakeDb {
  tables: Record<string, any[]>;
  from(table: string): any;
}

export function makeFakeDb(): FakeDb {
  const tables: Record<string, any[]> = {
    contacts: [],
    contact_identities: [],
    conversations: [],
    messages: [],
  };

  function uniqueViolation(table: string, row: any): boolean {
    const keys = UNIQUE_KEYS[table];
    if (!keys) return false;
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
      if (!tables[table]) tables[table] = [];
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
    order() {
      return this;
    }
    limit() {
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
      return Promise.resolve({
        data: rows[0] ?? null,
        error: rows[0] ? null : new FakeError("PGRST116", "no rows"),
      });
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
  };
}
