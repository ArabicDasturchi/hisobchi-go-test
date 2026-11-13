/**
 * F1: joylangan ro'yxat → savdo/kirim qatorlari, katalog bilan moslash, "Tasdiqlash" qulfi, ikki yo'l hisob.
 * Kutilgan qiymatlar qo'lda yozilgan.
 */
import { calculateLineTotal } from '@hisobchi/core';
import { describe, expect, it } from 'vitest';
import type { Product, Unit } from '@/lib/data/types';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import {
  acceptCheck,
  choosePurchaseProduct,
  chooseSaleProduct,
  keepAsNew,
  matchCatalog,
  pastedPurchaseLines,
  pastedSaleLines,
  pasteStatus,
  pasteSummaryText,
  reviewsAfterEdit,
  summarizePaste,
} from '@/lib/pasteList';
import { buildPurchasePlan } from '@/lib/purchaseForm';
import { buildSalePlan, type DraftLine } from '@/lib/saleForm';

const P = (id: string, name: string, price: number | null, unit: Unit = 'dona', active = true): Product => ({
  id, name, unit, last_price: price === null ? null : BigInt(price), is_active: active, source: 'app', created_at: `2026-01-0${id.length}`, updated_at: '',
});
const CHIRMOQ = P('c1', 'Chirmoq', 13000);
const YURAK = P('y1', 'Yurak', 15000);
const MOMIQ = P('m1', 'Momiq', 9000);
const TURK = P('j1', 'Joynamoz Turk', 13000);
const ERON = P('j2', 'Joynamoz Eron', 15000);
const QURON = P('q1', "Qur'on", null);
const GURUCH_KG = P('g1', 'Guruch', 12000, 'kg');
const GURUCH_QOP = P('g2', 'Guruch', 500000, 'qop');
const ESKI = P('e1', 'Tasbeh', 5000, 'dona', false);
const CATALOG = [CHIRMOQ, YURAK, MOMIQ, TURK, ERON, QURON, GURUCH_KG, GURUCH_QOP, ESKI];

let n = 0;
const key = () => `k${++n}`;
const sale = (t: string) => pastedSaleLines(t, CATALOG, key);
const statusOf = (l: DraftLine) => pasteStatus(l, lineStatus(l, CATALOG).status === 'yellow');

describe('matchCatalog', () => {
  it('registr, bo‘shliq, apostrof va Kirill/Lotin farqisiz aynan moslik', () => {
    for (const name of ['chirmoq', '  CHIRMOQ ', 'Чирмоқ', 'ЧИРМОҚ']) {
      expect(matchCatalog(CATALOG, name)).toEqual({ kind: 'exact', product: CHIRMOQ });
    }
    expect(matchCatalog(CATALOG, 'joynamoz   turk')).toEqual({ kind: 'exact', product: TURK });
    expect(matchCatalog(CATALOG, 'Qur’on')).toEqual({ kind: 'exact', product: QURON });
    expect(matchCatalog(CATALOG, 'Quron')).toEqual({ kind: 'exact', product: QURON });
    expect(matchCatalog(CATALOG, 'Қуръон')).toEqual({ kind: 'exact', product: QURON });
  });

  it('bir xil nom ikki birlikda: birlik berilsa aniq, berilmasa variantlar', () => {
    expect(matchCatalog(CATALOG, 'guruch', 'kg')).toEqual({ kind: 'exact', product: GURUCH_KG });
    expect(matchCatalog(CATALOG, 'guruch')).toEqual({ kind: 'twins', candidates: [GURUCH_KG, GURUCH_QOP] });
  });

  it('aynan yo‘q, o‘xshash bor: "Joynamoz" → ikkala joynamoz; uzunroq nom → qisqa katalog nomi', () => {
    const m = matchCatalog(CATALOG, 'Joynamoz');
    expect(m.kind).toBe('similar');
    expect(m.kind === 'similar' && m.candidates.map((p) => p.id).sort()).toEqual(['j1', 'j2']);
    const longer = matchCatalog(CATALOG, 'Joynamoz Turk katta');
    expect(longer.kind === 'similar' && longer.candidates.map((p) => p.id)).toEqual(['j1']);
  });

  it('topilmadi; arxivdagi tovar hisobga olinmaydi', () => {
    expect(matchCatalog(CATALOG, 'Atir')).toEqual({ kind: 'none' });
    expect(matchCatalog(CATALOG, 'Tasbeh')).toEqual({ kind: 'none' });
  });
});

describe('pastedSaleLines', () => {
  it('namuna: 3 qator aniq, katalog tovari bilan bog‘langan, jami 385 000', () => {
    const lines = sale('Chirmoq 10x13 000\nYurak 5x15.000\nMomiq 20x9000');
    expect(lines.map((l) => [l.productId, l.productName, l.qty, l.price, l.reviews])).toEqual([
      ['c1', 'Chirmoq', '10', '13 000', []],
      ['y1', 'Yurak', '5', '15 000', []],
      ['m1', 'Momiq', '20', '9 000', []],
    ]);
    expect(lines.map(statusOf)).toEqual(['aniq', 'aniq', 'aniq']);
    const summary = summarizeLines(lines, CATALOG);
    expect(summary).toMatchObject({ ready: 3, incomplete: 0, total: 385000n, canConfirm: true });
  });

  it('"Chirmoq 13": narx katalogdan, birlik katalogdan', () => {
    const [l] = sale('Чирмоқ 13');
    expect(l).toMatchObject({ productId: 'c1', productName: 'Chirmoq', qty: '13', unit: 'dona', price: '13 000', reviews: [] });
  });

  it('ro‘yxatdagi narx katalog narxidan ustun', () => {
    expect(sale('Chirmoq 2x14000')[0]!.price).toBe('14 000');
  });

  it('katalogda narxi yo‘q tovar, ro‘yxatda ham narx yo‘q: narx maydoni sariq (aniq tovar)', () => {
    const [l] = sale("Qur'on 1");
    expect(l).toMatchObject({ productId: 'q1', price: '', reviews: [] });
    expect(lineStatus(l!, CATALOG)).toMatchObject({ status: 'yellow', reason: 'price' });
  });

  it('bir nechta variant: sariq, variantlar ro‘yxati; tanlangach aniq', () => {
    const [l] = sale('Guruch 2');
    expect(l!.reviews).toEqual([{ kind: 'choose', message: 'Katalogda bir nechta «Guruch» bor: qaysi biri?', candidates: ['g1', 'g2'] }]);
    expect(statusOf(l!)).toBe('noaniq');
    const chosen = chooseSaleProduct(l!, GURUCH_QOP);
    expect(chosen).toMatchObject({ productId: 'g2', unit: 'qop', price: '500 000', reviews: [] });
    expect(statusOf(chosen)).toBe('aniq');
  });

  it('o‘xshash: variantlar + yangi tovar imkoni', () => {
    const [l] = sale('Joynamoz 3x13000');
    expect(l!.reviews![0]).toMatchObject({ kind: 'choose', allowNew: true });
    expect(l!.reviews![0]!.candidates!.sort()).toEqual(['j1', 'j2']);
    // narx ro'yxatdan yozilgan: tanlanganda saqlanadi
    expect(chooseSaleProduct(l!, ERON)).toMatchObject({ productId: 'j2', productName: 'Joynamoz Eron', price: '13 000', reviews: [] });
  });

  it('topilmadi: "yangi tovar" taklifi; tasdiqlangach katalogsiz (isNew) aniq qator', () => {
    const [l] = sale('Atir 4x20000');
    expect(l!.reviews).toEqual([{ kind: 'new', message: '«Atir» katalogda yo\'q: yangi tovar sifatida qo\'shilsinmi?' }]);
    expect(lineStatus(l!, CATALOG)).toMatchObject({ status: 'yellow', reason: 'review', isNew: true });
    const kept = keepAsNew(l!);
    expect(kept.reviews).toEqual([]);
    expect(lineStatus(kept, CATALOG)).toEqual({ status: 'ok', isNew: true });
  });

  it('tushunilmagan qator: xato; soni/narxi qo‘lda tuzatilsa xato yechiladi, katalog savoli qoladi', () => {
    const [l] = sale("Chirmoq 13000 so'm 15000 so'm");
    expect(statusOf(l!)).toBe('xato');
    expect(l!.reviews!.map((r) => r.kind)).toEqual(['xato']);
    const fixed = { ...l!, qty: '2', price: '13 000', reviews: reviewsAfterEdit(l!.reviews, { qty: '2' }) };
    expect(fixed.reviews).toEqual([]);
    const [u] = sale("Atir 1000 so'm 2000 so'm");
    expect(u!.reviews!.map((r) => r.kind)).toEqual(['xato', 'new']);
    expect(reviewsAfterEdit(u!.reviews, { price: '2 000' })!.map((r) => r.kind)).toEqual(['new']);
  });

  it('nomsiz qator: xato, katalog savoli yo‘q', () => {
    const [l] = sale('15 000');
    expect(l!.reviews).toEqual([{ kind: 'xato', message: "Tovar nomi topilmadi: qatorni o'chirib, tovarni qo'lda qo'shing" }]);
  });

  it('tahlilchi ogohlantirishi (bo‘shliqli son) → "To‘g‘ri" bilan yechiladi', () => {
    const [l] = sale('Chirmoq 10 130');
    expect(l!.reviews!.map((r) => r.kind)).toEqual(['check']);
    expect(acceptCheck(l!).reviews).toEqual([]);
  });

  it('birlik farqi: ro‘yxatda kg, katalogda faqat qop birligidagi tovar → tekshirish', () => {
    const lines = pastedSaleLines('Un 5 kg 9000 so‘m', [P('u1', 'Un', 400000, 'qop')], key);
    expect(lines[0]).toMatchObject({ productId: 'u1', unit: 'qop' });
    expect(lines[0]!.reviews![0]!.kind).toBe('check');
  });

  it('tekshirish savoli faqat o‘z maydoni tahrirlansa yechiladi: narx tahriri "10 130" savolini yopmaydi', () => {
    const [l] = sale('Chirmoq 10 130');
    expect(l!.reviews).toEqual([expect.objectContaining({ kind: 'check', field: 'qty' })]);
    expect(reviewsAfterEdit(l!.reviews, { price: '13 000' })).toHaveLength(1);
    expect(reviewsAfterEdit(l!.reviews, { qty: '10' })).toEqual([]);
    const [p] = sale('Chirmoq 30x60');
    expect(p!.reviews).toEqual([expect.objectContaining({ kind: 'check', field: 'price' })]);
    expect(reviewsAfterEdit(p!.reviews, { qty: '30' })).toHaveLength(1);
    expect(reviewsAfterEdit(p!.reviews, { price: '60 000' })).toEqual([]);
  });

  it('nom tahrirlansa hamma savol yechiladi', () => {
    expect(reviewsAfterEdit([{ kind: 'choose', message: 'x', candidates: ['a'] }], { productName: 'Boshqa' })).toEqual([]);
    expect(reviewsAfterEdit([{ kind: 'choose', message: 'x', candidates: ['a'] }], { qty: '3' })).toHaveLength(1);
  });
});

describe('Tasdiqlash qulfi: noaniq qator hal qilinmaguncha', () => {
  const LIST = [
    'Chirmoq 10x13 000', 'Yurak 5x15.000', 'Momiq 20x9000', 'Joynamoz Turk 3x13000', 'Joynamoz Eron 2x15000',
    'Guruch 2', 'Atir 4x20000', "Qur'on 1x45000", 'Joynamoz 1x14000', '15 000',
  ].join('\n');

  it('10 qator → 10 karta; tushunilmaganlari sariq; Tasdiqlash yopiq', () => {
    const lines = sale(LIST);
    expect(lines).toHaveLength(10);
    expect(lines.map(statusOf)).toEqual(['aniq', 'aniq', 'aniq', 'aniq', 'aniq', 'noaniq', 'noaniq', 'aniq', 'noaniq', 'xato']);
    const s = summarizeLines(lines, CATALOG);
    expect(s.canConfirm).toBe(false);
    expect(s.incomplete).toBe(4);
    // Ikkinchi himoya: reja ham tuzilmaydi
    const plan = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(plan.ok).toBe(false);
    expect(summarizePaste(lines.map(statusOf))).toEqual({ total: 10, aniq: 6, noaniq: 3, xato: 1 });
    expect(pasteSummaryText(summarizePaste(lines.map(statusOf)))).toBe("Ro'yxatdan 10 ta qator qo'shildi: 6 ta aniq, 3 ta tekshirish kerak, 1 ta tushunilmadi.");
  });

  it('ikkinchi himoya: soni/narxi to‘liq, lekin savoli hal qilinmagan qator — buildSalePlan ham rad etadi', () => {
    const [l] = sale('Atir 4x20000');
    expect(l).toMatchObject({ qty: '4', price: '20 000' });
    const plan = buildSalePlan({ lines: [l!], customerId: null, mode: 'paid', partial: '' });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.lineErrors.get(l!.key)?.review).toContain('katalogda yo');
    expect(buildSalePlan({ lines: [keepAsNew(l!)], customerId: null, mode: 'paid', partial: '' }).ok).toBe(true);
  });

  it('hammasi hal qilingach Tasdiqlash ochiladi; jami TS va mustaqil SQL formulasi bilan bir xil', () => {
    let lines = sale(LIST);
    lines = lines.map((l, i) => (i === 5 ? chooseSaleProduct(l, GURUCH_KG) : l));
    lines = lines.map((l, i) => (i === 6 ? keepAsNew(l) : l));
    lines = lines.map((l, i) => (i === 8 ? chooseSaleProduct(l, TURK) : l));
    lines = lines.filter((_, i) => i !== 9);
    const s = summarizeLines(lines, CATALOG);
    expect(s.canConfirm).toBe(true);
    const plan = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // 130000 + 75000 + 180000 + 39000 + 30000 + 24000 + 80000 + 45000 + 14000
    expect(plan.plan.total).toBe(617000n);
    // Ikkinchi yo'l: PostgreSQL calculate_line_total formulasi (qty_milli*price + 500) / 1000, mustaqil yozilgan
    const pg = plan.plan.lines.reduce((sum, l) => sum + (l.qty_milli * l.unit_price + 500n) / 1000n, 0n);
    expect(pg).toBe(plan.plan.total);
    expect(plan.plan.lines.reduce((sum, l) => sum + calculateLineTotal(l.qty_milli, l.unit_price), 0n)).toBe(plan.plan.total);
    // Tanlangan tovarlar id bilan ketadi (server boshqa egizakni olmasin), yangi tovar id'siz
    expect(plan.plan.lines.map((l) => l.product_id ?? null)).toEqual(['c1', 'y1', 'm1', 'j1', 'j2', 'g1', null, 'q1', 'j1']);
  });
});

describe('pastedPurchaseLines', () => {
  const buyLines = (t: string, newUnit: Unit | null = null) => pastedPurchaseLines(t, CATALOG, { makeKey: key, costOf: (id) => (id === 'c1' ? 11000n : null), newUnit });
  const plan = (lines: ReturnType<typeof buyLines>) => buildPurchasePlan({ lines, products: CATALOG, balanceBefore: 0n, paid: '', method: 'naqd', allowNew: true });

  it('namuna: kirim 385 000, reja OK', () => {
    const lines = buyLines('Chirmoq 10x13 000\nYurak 5x15.000\nMomiq 20x9000');
    expect(lines.map((l) => [l.productId, l.qty, l.unitCost])).toEqual([['c1', '10', '13 000'], ['y1', '5', '15 000'], ['m1', '20', '9 000']]);
    const r = plan(lines);
    expect(r.ok && r.plan.subtotal).toBe(385000n);
  });

  it('narxsiz qator: oxirgi kirim narxi taklif qilinadi (bo‘lsa)', () => {
    expect(buyLines('Chirmoq 10 ta')[0]!.unitCost).toBe('11 000');
    expect(buyLines('Yurak 10 ta')[0]!.unitCost).toBe('');
  });

  it('hal qilinmagan qator kirim rejasini to‘xtatadi; yangi tovar tasdiqlangach birlik bilan yaratiladi', () => {
    const lines = buyLines('Chirmoq 10x13000\nAtir 4x20000', 'dona');
    const blocked = plan(lines);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.lineErrors.get(lines[1]!.key)?.product).toContain('katalogda yo');
    const ok = plan(lines.map((l, i) => (i === 1 ? keepAsNew(l) : l)));
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.plan.newProducts).toEqual([{ key: 'atir|dona', name: 'Atir', unit: 'dona' }]);
    expect(ok.ok && ok.plan.subtotal).toBe(210000n);
  });

  it('variant tanlash kirimda ham ishlaydi', () => {
    const [l] = buyLines('Guruch 2x11000');
    expect(l!.reviews![0]!.kind).toBe('choose');
    expect(choosePurchaseProduct(l!, GURUCH_KG, null)).toMatchObject({ productId: 'g1', unit: 'kg', unitCost: '11 000', reviews: [] });
  });
});
