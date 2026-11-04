/**
 * Soxta Supabase klienti — FAQAT demo rejimi (`npm run demo`, NEXT_PUBLIC_DEMO=1, productionda emas).
 * Ma'lumot brauzer xotirasida (sahifa yangilansa seed qayta yoziladi); hech qanday tarmoq so'rovi yo'q, kalit kerak emas.
 *
 * PostgREST'ning veb panel ishlatadigan qismi: select (`a, b::text, alias:jadval(a,b)`), eq/neq/in/is/gte/lte/gt/lt,
 * order, range, limit, single/maybeSingle, count (head), insert/update/delete + select.
 * Moliyaviy yozuvlar (RPC: post_sale, record_payment, ...) YO'Q: ular `demo_read_only` xatosini qaytaradi.
 * Demoda yozish mobil web ilovada (haqiqiy ledger kodi bilan) ko'rsatiladi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDemoTables, DEMO_EMAIL, DEMO_USER_ID, type Row, type Tables } from './seed';

type Err = { message: string; code: string; details: null; hint: null };
const READ_ONLY: Err = { message: 'demo_read_only', code: 'DEMO', details: null, hint: null };

/** Ustunlar ro'yxatini yuqori darajadagi vergullar bo'yicha ajratadi (qavs ichidagi vergullar bo'linmaydi) */
export function splitColumns(spec: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of spec) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: Err | null; count?: number | null }> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private cols = '*';
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from = 0;
  private to = Infinity;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private head = false;
  private wantCount = false;
  private payload: Row | Row[] | null = null;
  private returning = false;

  constructor(
    private readonly db: Tables,
    private readonly table: string,
  ) {}

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }) {
    if (this.op === 'select') this.cols = cols;
    else {
      this.returning = true;
      this.cols = cols;
    }
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = 'insert';
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.op = 'update';
    this.payload = v;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  private f(fn: Filter) {
    this.filters.push(fn);
    return this;
  }
  eq(c: string, v: unknown) {
    return this.f((r) => r[c] === v);
  }
  neq(c: string, v: unknown) {
    return this.f((r) => r[c] !== v);
  }
  in(c: string, v: readonly unknown[]) {
    return this.f((r) => v.includes(r[c]));
  }
  is(c: string, v: unknown) {
    return this.f((r) => (r[c] ?? null) === v);
  }
  gte(c: string, v: string | number) {
    return this.f((r) => (r[c] as string | number) >= v);
  }
  lte(c: string, v: string | number) {
    return this.f((r) => (r[c] as string | number) <= v);
  }
  gt(c: string, v: string | number) {
    return this.f((r) => (r[c] as string | number) > v);
  }
  lt(c: string, v: string | number) {
    return this.f((r) => (r[c] as string | number) < v);
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }
  limit(n: number) {
    this.from = 0;
    this.to = n - 1;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  /** `a`, `a::text`, `alias:jadval(x, y)` ustunlarini qatordan olib, so'ralgan shaklga keltiradi */
  private project(row: Row): Row {
    if (this.cols.trim() === '*') return { ...row };
    const out: Row = {};
    for (const spec of splitColumns(this.cols)) {
      const embed = /^(\w+):(\w+)\((.*)\)$/.exec(spec);
      if (embed) {
        const [, alias, tbl, sub] = embed as unknown as [string, string, string, string];
        const fk = `${tbl.replace(/s$/, '')}_id`;
        const target = (this.db[tbl] ?? []).find((t) => t.id === row[fk]);
        out[alias] = target ? new Query(this.db, tbl).projectWith(target, sub) : null;
        continue;
      }
      const name = spec.split('::')[0]!.trim();
      if (!(name in row)) throw Object.assign(new Error(`column ${this.table}.${name} does not exist`), { code: '42703' });
      out[name] = row[name];
    }
    return out;
  }
  private projectWith(row: Row, cols: string): Row {
    this.cols = cols;
    return this.project(row);
  }

  private run(): { data: unknown; error: Err | null; count?: number | null } {
    try {
      const rows = this.db[this.table];
      if (!rows) return { data: null, error: { message: `relation ${this.table} does not exist`, code: '42P01', details: null, hint: null } };
      const match = (r: Row) => this.filters.every((fn) => fn(r));

      if (this.op === 'insert') {
        const now = new Date().toISOString();
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((p) => ({
          is_active: true, source: 'app', created_at: now, updated_at: now, ...p,
        }));
        rows.push(...items);
        const shaped = items.map((r) => this.project(r));
        return this.finish(this.returning ? shaped : null, shaped.length);
      }
      if (this.op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
        return this.finish(this.returning ? hit.map((r) => this.project(r)) : null, hit.length);
      }
      if (this.op === 'delete') {
        const hit = rows.filter(match);
        this.db[this.table] = rows.filter((r) => !hit.includes(r));
        return this.finish(this.returning ? hit.map((r) => this.project(r)) : null, hit.length);
      }

      let hit = rows.filter(match);
      const total = hit.length;
      for (const o of [...this.orders].reverse()) {
        hit = [...hit].sort((a, b) => {
          const x = a[o.col] as string | number | null;
          const y = b[o.col] as string | number | null;
          if (x === y) return 0;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          // bigint matn ustunlari uzunligi bo'yicha, keyin leksikografik (raqamli matn)
          const cmp = typeof x === 'string' && typeof y === 'string' && /^\d+$/.test(x) && /^\d+$/.test(y) ? (x.length - y.length || (x < y ? -1 : 1)) : x < y ? -1 : 1;
          return o.asc ? cmp : -cmp;
        });
      }
      hit = hit.slice(this.from, this.to === Infinity ? undefined : this.to + 1);
      const shaped = hit.map((r) => this.project(r));
      return { data: this.head ? null : shaped, error: null, count: this.wantCount ? total : null, ...this.single_(shaped) };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? 'demo xato', code: err.code ?? 'DEMO', details: null, hint: null } };
    }
  }

  private single_(shaped: Row[]): { data?: unknown; error?: Err } {
    if (this.head) return {};
    if (this.mode === 'many') return {};
    if (shaped.length === 1) return { data: shaped[0] };
    if (shaped.length === 0 && this.mode === 'maybe') return { data: null };
    return { error: { message: shaped.length === 0 ? 'no rows' : 'multiple rows', code: 'PGRST116', details: null, hint: null } };
  }

  private finish(rows: Row[] | null, count: number) {
    if (rows && this.mode !== 'many') {
      const s = this.single_(rows);
      return { data: s.data ?? null, error: s.error ?? null, count };
    }
    return { data: rows, error: null, count };
  }

  then<R1 = { data: unknown; error: Err | null; count?: number | null }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: Err | null; count?: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const DEMO_USER = {
  id: DEMO_USER_ID,
  email: DEMO_EMAIL,
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: { full_name: 'Demo savdogar' },
  created_at: new Date(0).toISOString(),
};

const session = { access_token: 'demo', refresh_token: 'demo', expires_in: 3600, token_type: 'bearer', user: DEMO_USER };

export function createFakeSupabase(db: Tables = buildDemoTables()): SupabaseClient {
  const readOnly = async () => ({ data: null, error: READ_ONLY });
  const fake = {
    from: (table: string) => new Query(db, table),
    // Hamma RPC (post_sale, record_payment, accept_agent_draft, ...) demoda yopiq
    rpc: readOnly,
    auth: {
      getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (cb: (event: string, s: typeof session | null) => void) => {
        queueMicrotask(() => cb('INITIAL_SESSION', session));
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: DEMO_USER, session }, error: null }),
      updateUser: readOnly,
      signUp: readOnly,
      resend: readOnly,
      resetPasswordForEmail: readOnly,
      verifyOtp: readOnly,
      exchangeCodeForSession: readOnly,
      signInWithOAuth: readOnly,
      oauth: { listGrants: async () => ({ data: [], error: null }), getAuthorizationDetails: readOnly },
    },
  };
  return fake as unknown as SupabaseClient;
}
