/**
 * Veb: agent kirim qoralamasi va bir martalik savdo qoralamasi (008). Hisob core formulasi bilan qayta tekshiriladi.
 * Kirim: 100×9 000 + 50×11 000 = 1 450 000.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftCard } from '@/components/DraftCard';
import { draftTitle, integrityError, toAgentDraft, warningCount, type AgentDraftRow } from '@/lib/data/agentDrafts';
import { acceptAgentDraft } from '@/lib/data/api';

const SUP = 'a8a8a8a8-0000-4000-8000-000000000001';
const P1 = 'f8f8f8f8-0000-4000-8000-000000000001';
const P2 = 'f8f8f8f8-0000-4000-8000-000000000002';
const SHOP = '11111111-1111-4111-8111-111111111111';
const ID = 'd8d8d8d8-0000-4000-8000-000000000001';

const PURCHASE = {
  doc_date: '2026-10-29',
  lines: [
    { product_id: P1, product_name: 'Un', unit: 'kg', qty_milli: '100000', unit_cost: '9000', line_total: '900000', warnings: ['narx oshgan'] },
    { product_id: P2, product_name: 'Sariyog', unit: 'litr', qty_milli: '50000', unit_cost: '11000', line_total: '550000', warnings: [] },
  ],
  payment_method: 'naqd',
  paid: '1000000',
  note: 'yangi partiya',
};
const row = (over: Partial<AgentDraftRow> = {}): AgentDraftRow => ({
  id: ID, kind: 'purchase', status: 'draft', customer_id: null, target_id: SUP, total: '1450000', payload: PURCHASE,
  client_id: 'c1c1c1c1-0000-4000-8000-000000000001', created_by: 'u', created_at: '2026-11-02T10:00:00Z', decided_at: null, reject_reason: null, ...over,
});
const nb = (html: string) => html.replace(/ /g, ' ');
const render = (r: AgentDraftRow) =>
  nb(renderToStaticMarkup(<DraftCard draft={toAgentDraft(r)} customerName={null} supplierName="Baraka Optom" source="Claude" busy={false} anyBusy={false} error={null} onAccept={() => {}} onReject={() => {}} />));

describe('kirim qoralamasi', () => {
  it("o'qiladi: ta'minotchi target_id dan, qatorlar, to'lov; yaxlitlik mos", () => {
    const d = toAgentDraft(row());
    expect(d.detail.kind).toBe('purchase');
    if (d.detail.kind !== 'purchase') throw new Error();
    expect(d.detail.supplier_id).toBe(SUP);
    expect(d.detail.lines.map((l) => l.line_total)).toEqual([900000n, 550000n]);
    expect(d.detail.paid).toBe(1000000n);
    expect(d.detail.method).toBe('naqd');
    expect(d.total).toBe(1450000n);
    expect(integrityError(d)).toBeNull();
    expect(draftTitle(d)).toBe('Kirim qoralamasi');
    expect(warningCount(d)).toBe(1);
  });

  it("qator summasi yoki jami core formulasidan farq qilsa tasdiqlab bo'lmaydi", () => {
    const bad = JSON.parse(JSON.stringify(PURCHASE));
    bad.lines[0].line_total = '900001';
    expect(integrityError(toAgentDraft(row({ payload: bad })))).toMatch(/1-qator summasi mos kelmadi/);
    expect(integrityError(toAgentDraft(row({ total: '1450001' })))).toMatch(/jami/);
  });

  it("ta'minotchisiz yoki buzuq payload o'qib bo'lmaydigan bo'ladi (ilova yiqilmaydi)", () => {
    expect(toAgentDraft(row({ target_id: null })).detail.kind).toBe('unreadable');
    expect(toAgentDraft(row({ payload: { lines: [] } })).detail.kind).toBe('unreadable');
    expect(integrityError(toAgentDraft(row({ payload: 'xato' })))).toBeTruthy();
  });

  it("kartochka: ta'minotchi nomi, qatorlar, tan narx, to'lov, ogohlantirish, tugma", () => {
    const html = render(row());
    expect(html).toContain('Kirim qoralamasi');
    expect(html).toContain('Baraka Optom');
    for (const n of ['Un', 'Sariyog', '900 000', '550 000', '1 450 000', '1 000 000', 'yangi partiya', '29.10.2026', 'narx oshgan']) expect(html).toContain(n);
    expect(html).toContain('Tasdiqlash (1 450 000');
    expect(html).toContain('hech narsa o&#x27;zgarmaydi');
    expect(html).not.toContain('Mijozsiz');
  });

  it('yaxlitlik buzilsa Tasdiqlash tugmasi yopiq', () => {
    const html = render(row({ total: '1450001' }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Tasdiqlash \(/s);
    expect(html).toContain("Tasdiqlab bo&#x27;lmaydi");
  });

  it("tasdiqlangan kirim qoralamasi Kirim daftariga havola beradi", () => {
    const html = render(row({ status: 'accepted', decided_at: '2026-11-02T11:00:00Z' }));
    expect(html).toContain('/books/in');
    expect(html).toContain("Kirim daftarini ko");
  });
});

describe('savdo qoralamasi: bir martalik mijoz va to\'lov', () => {
  const sale = (extra: Record<string, unknown>, total = '130000') => row({
    kind: 'sale', target_id: null, total,
    payload: { raw_input: null, lines: [{ product_name: 'Un', qty_milli: '10000', unit: 'kg', unit_price: '13000', line_total: '130000' }], ...extra },
  });
  it("bir martalik: to'lov jamiga teng bo'lishi shart", () => {
    expect(integrityError(toAgentDraft(sale({ walkin: true, payment_method: 'naqd', paid: '130000' })))).toBeNull();
    expect(integrityError(toAgentDraft(sale({ walkin: true, payment_method: 'naqd', paid: '1000' })))).toMatch(/to'liq to'lanishi/);
    expect(integrityError(toAgentDraft(sale({ walkin: true, payment_method: 'naqd' })))).toMatch(/to'liq to'lanishi/);
  });
  it("to'lov jamidan oshmaydi; eski qoralama (008 dan oldin) o'zgarishsiz o'qiladi", () => {
    expect(integrityError(toAgentDraft(sale({ paid: '130001', payment_method: 'naqd' })))).toMatch(/jamidan katta/);
    const old = toAgentDraft(sale({}));
    expect(old.detail.kind === 'sale' && old.detail.walkin).toBe(false);
    expect(old.detail.kind === 'sale' && old.detail.paid).toBeNull();
    expect(integrityError(old)).toBeNull();
  });
  it("kartochka: Bir martalik mijoz, usul, to'liq to'lanadi; qisman to'lovda qarz ko'rsatiladi", () => {
    const render1 = (r: AgentDraftRow) => nb(renderToStaticMarkup(<DraftCard draft={toAgentDraft(r)} customerName={null} source="Claude" busy={false} anyBusy={false} error={null} onAccept={() => {}} onReject={() => {}} />));
    const w = render1(sale({ walkin: true, payment_method: 'karta', paid: '130000' }));
    expect(w).toContain('Bir martalik mijoz');
    expect(w).toContain("qarzga olmaydi");
    expect(w).toContain('130 000');
    const partial = nb(renderToStaticMarkup(<DraftCard draft={toAgentDraft(sale({ payment_method: 'naqd', paid: '30000' }))} customerName="Karim" source="Claude" busy={false} anyBusy={false} error={null} onAccept={() => {}} onReject={() => {}} />));
    expect(partial).toContain('30 000');
    expect(partial).toContain('qarzga qoladi');
    expect(partial).toContain('100 000');
  });
});

describe('acceptAgentDraft: kirim serverda tekshiriladi', () => {
  function fakeSb(doc: { status: string; subtotal: string } | null) {
    return {
      rpc: async () => ({ data: ID, error: null }),
      from: (t: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: t === 'agent_drafts' ? { status: 'accepted' } : doc, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }
  it("server kutilgan summani tasdiqlasa 'accepted'; hujjat yo'q yoki summa farq qilsa xato", async () => {
    const d = toAgentDraft(row());
    expect(await acceptAgentDraft(fakeSb({ status: 'posted', subtotal: '1450000' }), SHOP, d)).toBe('accepted');
    await expect(acceptAgentDraft(fakeSb(null), SHOP, d)).rejects.toThrow(/Kirim serverda/);
    await expect(acceptAgentDraft(fakeSb({ status: 'posted', subtotal: '1450001' }), SHOP, d)).rejects.toThrow(/Kirim serverda/);
    await expect(acceptAgentDraft(fakeSb({ status: 'reversed', subtotal: '1450000' }), SHOP, d)).rejects.toThrow(/Kirim serverda/);
  });
});
