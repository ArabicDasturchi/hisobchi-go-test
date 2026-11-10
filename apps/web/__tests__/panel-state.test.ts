import { describe, expect, it } from 'vitest';
import { parseLedgerNote, previewLedgerNote } from '@/lib/ledgerNote';
import { addNewPurchaseLine, addNewSaleLine, applyPurchaseSelection } from '@/lib/panelLines';
import { ACTION_INFO, PANEL_ACTIONS, panelHref, parsePanelParams, whoForAction } from '@/lib/panelState';
import type { Product } from '@/lib/data/types';

const P = (id: string, name: string): Product => ({ id, name, unit: 'dona', last_price: 1000n, is_active: true, source: 'app', created_at: '', updated_at: '' });
const params = (s: string) => new URLSearchParams(s);
const UUID = '0b6e1c3a-1111-4222-8333-444455556666';
let n = 0;
const key = () => `k${++n}`;

describe('panelState (URL holati)', () => {
  it('aynan beshta amal', () => {
    expect([...PANEL_ACTIONS]).toEqual(['savdo', 'tolov', 'kirim', 'ta-tolov', 'daftar']);
    expect(PANEL_ACTIONS.map((a) => ACTION_INFO[a].label)).toEqual(['Savdo', "To'lov olish", 'Kirim', "Ta'minotchiga to'lov", 'Daftarga yozish']);
  });
  it('URL → holat: amal va kimga; noto‘g‘ri qiymat standartga tushadi', () => {
    expect(parsePanelParams(params(''))).toEqual({ action: 'savdo', who: '' });
    expect(parsePanelParams(params(`amal=kirim&kimga=${UUID}`))).toEqual({ action: 'kirim', who: UUID });
    expect(parsePanelParams(params('amal=hisobot&kimga=<script>'))).toEqual({ action: 'savdo', who: '' });
  });
  it('eski ?customer= (mijoz sahifasidagi "Savdo" tugmasi) ishlaydi', () => {
    expect(parsePanelParams(params(`customer=${UUID}`))).toEqual({ action: 'savdo', who: UUID });
  });
  it('holat → URL: toza /dashboard, orqaga-oldinga uchun to‘liq manzil', () => {
    expect(panelHref({ action: 'savdo', who: '' })).toBe('/dashboard');
    expect(panelHref({ action: 'tolov', who: UUID })).toBe(`/dashboard?amal=tolov&kimga=${UUID}`);
    expect(panelHref({ action: 'savdo', who: UUID })).toBe(`/dashboard?kimga=${UUID}`);
    expect(parsePanelParams(params(panelHref({ action: 'ta-tolov', who: UUID }).split('?')[1]!))).toEqual({ action: 'ta-tolov', who: UUID });
  });
  it('amal almashganda mos kelmagan Kimga tozalanadi (mijoz ↔ ta‘minotchi)', () => {
    const ids = { customers: new Set(['c1']), suppliers: new Set(['s1']) };
    expect(whoForAction('savdo', 'c1', ids)).toBe('c1');
    expect(whoForAction('kirim', 'c1', ids)).toBe('');
    expect(whoForAction('ta-tolov', 's1', ids)).toBe('s1');
    expect(whoForAction('tolov', 's1', ids)).toBe('');
    expect(whoForAction('daftar', 's1', ids)).toBe('s1');
    expect(whoForAction('daftar', 'zzz', ids)).toBe('');
  });
});

describe('ledgerNote (Daftarga yozish)', () => {
  it('"kirim 1 000 000" → tovar 1 000 000', () => expect(parseLedgerNote('kirim 1 000 000')).toEqual({ ok: true, goods: 1_000_000n, paid: 0n }));
  it('kirim va to‘lov birga; Kirill va apostrof farqsiz', () => {
    expect(parseLedgerNote("savdo 500 000 to'lov 200 000")).toEqual({ ok: true, goods: 500_000n, paid: 200_000n });
    expect(parseLedgerNote('кирим 1 000 000')).toEqual({ ok: true, goods: 1_000_000n, paid: 0n });
    expect(parseLedgerNote('tolov 50000')).toEqual({ ok: true, goods: 0n, paid: 50_000n });
  });
  it('son kalit so‘zdan oldin ham, "ming" bilan ham', () => {
    expect(parseLedgerNote('300 000 tolov')).toEqual({ ok: true, goods: 0n, paid: 300_000n });
    expect(parseLedgerNote('kirim 13 ming')).toEqual({ ok: true, goods: 13_000n, paid: 0n });
  });
  it('kalit so‘zsiz son noaniq; bo‘sh matn xato emas', () => {
    expect(parseLedgerNote('300 000')).toMatchObject({ ok: false });
    expect(parseLedgerNote('')).toEqual({ ok: false, message: null });
    expect(parseLedgerNote('salom')).toMatchObject({ ok: false });
  });
  it('oldindan ko‘rish: Eski + Tovar − Berildi (core settle), to‘lov qarzdan oshmaydi', () => {
    const p = previewLedgerNote(46_431_000n, 'kirim 1 000 000');
    expect(p.ok && p.settlement.balance).toBe(47_431_000n);
    expect(previewLedgerNote(100_000n, "to'lov 300 000")).toMatchObject({ ok: false });
    expect(previewLedgerNote(0n, "to'lov 1 000")).toMatchObject({ ok: false });
    const ok = previewLedgerNote(478_000n, "to'lov 300 000");
    expect(ok.ok && ok.settlement.balance).toBe(178_000n);
  });
});

describe('panelLines (Kirim qatorlari)', () => {
  const A = P('a', 'Arosat 35x75');
  const B = P('b', '2 li daraxt');
  it('2 tovar → 2 qator, narx oxirgi kirim narxidan; qayta tanlansa +1', () => {
    const cost = (id: string) => (id === 'a' ? 2500n : null);
    const l1 = applyPurchaseSelection([], [A, B], cost, key);
    expect(l1.map((l) => [l.productName, l.qty, l.unitCost, l.productId])).toEqual([
      ['Arosat 35x75', '1', '2 500', 'a'],
      ['2 li daraxt', '1', '', 'b'],
    ]);
    const l2 = applyPurchaseSelection(l1, [A, B], cost, key);
    expect(l2).toHaveLength(2);
    expect(l2.map((l) => l.qty)).toEqual(['2', '2']);
  });
  it('yangi tovar nomi: bitta qator, takrorlansa +1', () => {
    const l1 = addNewPurchaseLine([], 'Yangi buyum', key);
    expect(l1).toHaveLength(1);
    expect(l1[0]).toMatchObject({ productId: null, productName: 'Yangi buyum', qty: '1' });
    expect(addNewPurchaseLine(l1, 'yangi buyum', key)[0]!.qty).toBe('2');
  });
  it('savdoda yangi tovar: narx bo‘sh qoladi (sariq)', () => {
    const l = addNewSaleLine([], 'Atir', key);
    expect(l[0]).toMatchObject({ productName: 'Atir', qty: '1', price: '' });
  });
});
