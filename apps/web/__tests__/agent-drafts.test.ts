import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { clientLabel, integrityError, toAgentDraft, warningCount, type AgentDraftRow } from '@/lib/data/agentDrafts';
import { acceptAgentDraft, listAgentDrafts, listOAuthClientNames, rejectAgentDraft } from '@/lib/data/api';
import { AppError, toAppError } from '@/lib/errors';

const SHOP = '11111111-1111-4111-8111-111111111111';
const ID = 'd3d3d3d3-0000-4000-8000-000000000001';

/** 10×13 000 + 5×15 000 + 20×9 000 = 385 000 */
const SALE_PAYLOAD = {
  raw_input: 'chirmoq 10 ta 13 ming...',
  lines: [
    { product_name: 'chirmoq', qty_milli: '10000', unit: 'dona', unit_price: '13000', line_total: '130000', raw_text: 'chirmoq 10 ta 13 ming', warnings: ['narx odatdagidan farq qiladi'] },
    { product_name: 'yurak', qty_milli: '5000', unit: 'dona', unit_price: '15000', line_total: '75000', raw_text: null, warnings: [] },
    { product_name: 'momiq', qty_milli: '20000', unit: 'dona', unit_price: '9000', line_total: '180000', raw_text: null, warnings: [] },
  ],
};

const row = (over: Partial<AgentDraftRow> = {}): AgentDraftRow => ({
  id: ID, kind: 'sale', status: 'draft', customer_id: null, total: '385000', payload: SALE_PAYLOAD,
  client_id: 'c1c1c1c1-0000-4000-8000-000000000001', created_by: 'a2a2a2a2-0000-0000-0000-000000000001',
  created_at: '2026-11-02T10:00:00Z', decided_at: null, reject_reason: null, ...over,
});

describe('toAgentDraft / integrityError', () => {
  it('385 000 qoralama o\'qiladi va core formulasi bilan mos keladi', () => {
    const d = toAgentDraft(row());
    expect(d.total).toBe(385000n);
    expect(d.detail.kind).toBe('sale');
    if (d.detail.kind === 'sale') {
      expect(d.detail.lines.map((l) => l.line_total)).toEqual([130000n, 75000n, 180000n]);
      expect(d.detail.lines[0]!.qty_milli).toBe(10000n);
    }
    expect(integrityError(d)).toBeNull();
    expect(warningCount(d)).toBe(1);
  });

  it('jami qatorlar yig\'indisiga mos kelmasa tasdiqlab bo\'lmaydi', () => {
    expect(integrityError(toAgentDraft(row({ total: '385001' })))).toMatch(/mos kelmadi/);
  });

  it('qator summasi core formulasiga mos kelmasa xato (yaxlitlash qoidasi)', () => {
    const bad = { ...SALE_PAYLOAD, lines: [{ ...SALE_PAYLOAD.lines[0]!, line_total: '130001' }, ...SALE_PAYLOAD.lines.slice(1)] };
    expect(integrityError(toAgentDraft(row({ payload: bad })))).toBe('1-qator summasi mos kelmadi');
  });

  it('kasr miqdor: 2,5 × 4 000 = 10 000, 0,333 × 1 000 = 333 yaxlitlanadi', () => {
    const p = { lines: [
      { product_name: 'un', qty_milli: '2500', unit: 'kg', unit_price: '4000', line_total: '10000' },
      { product_name: 'tuz', qty_milli: '333', unit: 'kg', unit_price: '1000', line_total: '333' },
    ] };
    expect(integrityError(toAgentDraft(row({ payload: p, total: '10333' })))).toBeNull();
  });

  it('buzilgan yoki begona shakldagi payload ilovani yiqitmaydi: unreadable', () => {
    for (const payload of [null, 'matn', {}, { lines: [] }, { lines: [{ product_name: '', qty_milli: 'x' }] }, { lines: [{ ...SALE_PAYLOAD.lines[0], qty_milli: '-5' }] }]) {
      const d = toAgentDraft(row({ payload }));
      expect(d.detail.kind).toBe('unreadable');
      expect(integrityError(d)).not.toBeNull();
    }
    expect(toAgentDraft(row({ kind: 'noma\'lum' })).detail.kind).toBe('unreadable');
  });

  it('to\'lov qoralamasi', () => {
    const d = toAgentDraft(row({ kind: 'payment', total: '50000', payload: { method: 'naqd', note: 'nasiya qaytdi' }, customer_id: 'c2c2c2c2-0000-4000-8000-000000000001' }));
    expect(d.detail).toEqual({ kind: 'payment', method: 'naqd', note: 'nasiya qaytdi' });
    expect(integrityError(d)).toBeNull();
    expect(integrityError(toAgentDraft(row({ kind: 'payment', total: '0', payload: { method: 'naqd' } })))).not.toBeNull();
    expect(toAgentDraft(row({ kind: 'payment', payload: { method: 'bitkoin' } })).detail.kind).toBe('unreadable');
  });

  it('accepted va rejected holatlar saqlanadi', () => {
    expect(toAgentDraft(row({ status: 'accepted' })).status).toBe('accepted');
    expect(toAgentDraft(row({ status: 'rejected' })).status).toBe('rejected');
  });
});

describe('clientLabel', () => {
  it('nom, birinchi tomon, qisqa ID', () => {
    const names = new Map([['c1c1c1c1-0000-4000-8000-000000000001', 'Claude']]);
    expect(clientLabel('c1c1c1c1-0000-4000-8000-000000000001', names)).toBe('Claude');
    expect(clientLabel('f9f9f9f9-0000-4000-8000-000000000009', names)).toBe('Agent f9f9f9f9');
    expect(clientLabel('first_party', names)).toBe('Hisobchi Go ilovasi');
  });
});

/** Soxta Supabase klienti: RPC va so'rovlarni yozib oladi */
function fake(opts: { rpcError?: { message: string }; tables?: Record<string, unknown>; grants?: unknown; grantsThrow?: boolean } = {}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const eqs: [string, unknown][] = [];
  const chain = (result: { data: unknown; error: unknown }) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (col: string, v: unknown) => (eqs.push([col, v]), c);
    c.order = () => c;
    c.limit = () => c;
    c.maybeSingle = async () => result;
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return c;
  };
  const sb = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: opts.rpcError ? null : ID, error: opts.rpcError ?? null };
    },
    from: (t: string) => chain({ data: opts.tables?.[t] ?? null, error: null }),
    auth: {
      oauth: {
        listGrants: async () => {
          if (opts.grantsThrow) throw new Error('tarmoq');
          return opts.grants ?? { data: [], error: null };
        },
      },
    },
  };
  return { sb: sb as unknown as SupabaseClient, rpcCalls, eqs };
}

const draft = toAgentDraft(row());

describe('acceptAgentDraft', () => {
  const okTables = { agent_drafts: { status: 'accepted' }, documents: { status: 'posted', subtotal: '385000' } };

  it('accept_agent_draft RPC\'ni faqat draft id bilan chaqiradi va natijani serverdan tekshiradi', async () => {
    const f = fake({ tables: okTables });
    await expect(acceptAgentDraft(f.sb, SHOP, draft)).resolves.toBe('accepted');
    expect(f.rpcCalls).toEqual([{ fn: 'accept_agent_draft', args: { p_draft_id: ID } }]);
    expect(f.eqs).toContainEqual(['shop_id', SHOP]);
  });

  it('IKKI MARTA BOSISH: ikkinchisi draft_already_decided → "already", xato emas', async () => {
    const f = fake({ rpcError: { message: 'draft_already_decided' } });
    await expect(acceptAgentDraft(f.sb, SHOP, draft)).resolves.toBe('already');
  });

  it('hisob mos kelmasa (calc_mismatch) xato, o\'zbekcha xabar bilan', async () => {
    const f = fake({ rpcError: { message: 'calc_mismatch: server=385000, client=385001' } });
    const e = await acceptAgentDraft(f.sb, SHOP, draft).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).message).toMatch(/mos kelmadi/);
  });

  it('to\'lov qarzdan oshsa: xato va joriy qarz ko\'rsatiladi', async () => {
    const f = fake({ rpcError: { message: 'payment_exceeds_debt: debt=285000' } });
    const pay = toAgentDraft(row({ kind: 'payment', total: '300000', payload: { method: 'naqd' } }));
    const e = (await acceptAgentDraft(f.sb, SHOP, pay).catch((x: unknown) => x)) as AppError;
    expect(e.message).toMatch(/285\s000/);
  });

  it('server savdoni kutilgan summada yozmagan bo\'lsa xato', async () => {
    const f = fake({ tables: { ...okTables, documents: { status: 'posted', subtotal: '1' } } });
    await expect(acceptAgentDraft(f.sb, SHOP, draft)).rejects.toThrow(/kutilgan summada/);
    const g = fake({ tables: { agent_drafts: { status: 'draft' } } });
    await expect(acceptAgentDraft(g.sb, SHOP, draft)).rejects.toThrow(/tasdiqlamadi/);
  });

  it('to\'lov tasdiqlanganda to\'lov qatori tekshiriladi', async () => {
    const pay = toAgentDraft(row({ kind: 'payment', total: '50000', payload: { method: 'naqd' } }));
    const good = fake({ tables: { agent_drafts: { status: 'accepted' }, payments: { amount: '50000' } } });
    await expect(acceptAgentDraft(good.sb, SHOP, pay)).resolves.toBe('accepted');
    const bad = fake({ tables: { agent_drafts: { status: 'accepted' }, payments: { amount: '49999' } } });
    await expect(acceptAgentDraft(bad.sb, SHOP, pay)).rejects.toThrow(/kutilgan summada/);
  });

  it('OAuth tokenga yopiq amal xabari (oauth_client_forbidden) tushunarli', () => {
    expect(toAppError({ message: 'oauth_client_forbidden', code: '42501' }).message).toMatch(/faqat Hisobchi Go ilovasida/);
  });
});

describe('rejectAgentDraft', () => {
  it('sabab ixtiyoriy: bo\'sh bo\'lsa null, aks holda kesilgan', async () => {
    const a = fake();
    await expect(rejectAgentDraft(a.sb, ID, '   ')).resolves.toBe('rejected');
    expect(a.rpcCalls[0]).toEqual({ fn: 'reject_agent_draft', args: { p_draft_id: ID, p_reason: null } });
    const b = fake();
    await rejectAgentDraft(b.sb, ID, '  kerak emas ');
    expect(b.rpcCalls[0]!.args.p_reason).toBe('kerak emas');
  });

  it('ikki marta bosish "already"; boshqa xato tashlanadi; savdo yozuvchi RPC chaqirilmaydi', async () => {
    await expect(rejectAgentDraft(fake({ rpcError: { message: 'draft_already_decided' } }).sb, ID, null)).resolves.toBe('already');
    await expect(rejectAgentDraft(fake({ rpcError: { message: 'draft_not_found' } }).sb, ID, null)).rejects.toBeInstanceOf(AppError);
    const f = fake();
    await rejectAgentDraft(f.sb, ID, null);
    expect(f.rpcCalls.map((c) => c.fn)).toEqual(['reject_agent_draft']);
  });
});

describe('listAgentDrafts va klient nomlari', () => {
  it('shop_id va holat bo\'yicha filtrlaydi, payload\'ni o\'qiydi', async () => {
    const f = fake({ tables: { agent_drafts: [row()] } });
    const list = await listAgentDrafts(f.sb, SHOP, { status: 'draft' });
    expect(list).toHaveLength(1);
    expect(list[0]!.total).toBe(385000n);
    expect(f.eqs).toEqual([['shop_id', SHOP], ['status', 'draft']]);
  });

  it('listGrants nomlari; xato yoki istisno bo\'lsa bo\'sh xarita', async () => {
    const grants = { data: [{ client: { id: 'c1', name: 'Claude' }, scopes: [], granted_at: 'x' }, { client: { id: 'c2', name: '' } }], error: null };
    expect([...(await listOAuthClientNames(fake({ grants }).sb))]).toEqual([['c1', 'Claude']]);
    expect((await listOAuthClientNames(fake({ grants: { data: null, error: { message: 'x' } } }).sb)).size).toBe(0);
    expect((await listOAuthClientNames(fake({ grantsThrow: true }).sb)).size).toBe(0);
  });
});

describe('RPC kontrakti (004_mcp_agent.sql)', () => {
  const SQL = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/004_mcp_agent.sql'), 'utf8');
  const params = (fn: string) => {
    const m = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(([^)]*)\\)`, 'i').exec(SQL);
    if (!m?.[1]) throw new Error(`${fn} topilmadi`);
    return m[1].split(',').map((s) => s.trim().split(/\s+/)[0]);
  };

  it('veb yuboradigan argument nomlari SQL imzolariga mos', async () => {
    expect(params('accept_agent_draft')).toEqual(['p_draft_id']);
    expect(params('reject_agent_draft')).toEqual(['p_draft_id', 'p_reason']);
    const f = fake({ tables: { agent_drafts: { status: 'accepted' }, documents: { status: 'posted', subtotal: '385000' } } });
    await acceptAgentDraft(f.sb, SHOP, draft);
    await rejectAgentDraft(f.sb, ID, 'sabab');
    expect(Object.keys(f.rpcCalls[0]!.args)).toEqual(params('accept_agent_draft'));
    expect(Object.keys(f.rpcCalls[1]!.args)).toEqual(params('reject_agent_draft'));
  });

  it('web faqat accept/reject chaqiradi: agent_draft_* (yaratish) veb kodida yo\'q', () => {
    const api = readFileSync(path.resolve(__dirname, '../src/lib/data/api.ts'), 'utf8');
    expect(api).not.toMatch(/rpc\('agent_draft_(sale|payment)'/);
  });
});
