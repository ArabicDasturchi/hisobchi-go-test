/**
 * Ombor narxlari: sozlamalar, ustama taklifi, narx patch, optom narx tanlash (sof mantiq).
 * Hisob core'da (`resolveUnitPrice`, `suggestSalePrice`); bu yerda ularni ulash qoidalari tekshiriladi.
 */
import { describe, expect, it } from 'vitest';
import { parseQtyInput } from '@/lib/money';
import { buildDashboard } from '@/lib/dashboardModel';
import { saleInsights } from '@/lib/saleInsights';
import { productFields, productInitial, valuesToInput } from '@/lib/productsView';
import {
  buildPricePatch,
  costAboveSaleWarning,
  DEFAULT_PRICING,
  markupHint,
  parseMarkupInput,
  parsePricingSettings,
  priceForQty,
  suggestedSaleText,
  withPricingSettings,
  withStockSetting,
  wholesaleAboveSaleWarning,
} from '@/lib/shopPricing';

describe('parsePricingSettings / withPricingSettings', () => {
  it("bo'sh/yo'q/noto'g'ri sozlama = default: optom o'chiq, qoldiq hisobi YOQIQ, ustama yo'q", () => {
    for (const v of [undefined, null, {}, 'x', [], { wholesale_enabled: 'ha', stock_enabled: 1, markup_percent: 'x' }]) {
      expect(parsePricingSettings(v)).toEqual(DEFAULT_PRICING);
    }
    expect(DEFAULT_PRICING).toEqual({ wholesaleEnabled: false, stockEnabled: true, markupPercent: null });
  });
  it("qiymatlarni o'qiydi; faqat aniq false qoldiq hisobini o'chiradi", () => {
    expect(parsePricingSettings({ wholesale_enabled: true, stock_enabled: false, markup_percent: 20 })).toEqual({ wholesaleEnabled: true, stockEnabled: false, markupPercent: 20 });
    expect(parsePricingSettings({ stock_enabled: null }).stockEnabled).toBe(true);
  });
  it("ustama: 0..1000 butun; 1001, manfiy, kasr = yo'q", () => {
    expect(parsePricingSettings({ markup_percent: 0 }).markupPercent).toBe(0);
    for (const bad of [1001, -1, 12.5]) expect(parsePricingSettings({ markup_percent: bad }).markupPercent).toBeNull();
  });
  it("yozishda boshqa kalitlar (units) saqlanadi va shakl DB CHECK'ga mos (bool, butun yoki null)", () => {
    const next = withPricingSettings({ units: ['dona'] }, { wholesaleEnabled: true });
    expect(next).toEqual({ units: ['dona'], wholesale_enabled: true, stock_enabled: true, markup_percent: null });
    expect(withPricingSettings(next, { markupPercent: 15, stockEnabled: false })).toEqual({ units: ['dona'], wholesale_enabled: true, stock_enabled: false, markup_percent: 15 });
    expect(withPricingSettings(undefined, { markupPercent: null })).toEqual({ wholesale_enabled: false, stock_enabled: true, markup_percent: null });
  });
});

describe('parseMarkupInput', () => {
  it("bo'sh = yo'q; butun son; % belgisi; noto'g'ri rad", () => {
    expect(parseMarkupInput('')).toEqual({ ok: true, value: null });
    expect(parseMarkupInput(' 20 ')).toEqual({ ok: true, value: 20 });
    expect(parseMarkupInput('20%')).toEqual({ ok: true, value: 20 });
    expect(parseMarkupInput('0')).toEqual({ ok: true, value: 0 });
    for (const bad of ['1001', '-5', '12,5', 'abc', '12 5']) expect(parseMarkupInput(bad).ok).toBe(false);
  });
});

describe('ustama taklifi (faqat taklif)', () => {
  it('9 000 + 20% = 10 800; 5 + 10% = 6 (half-up)', () => {
    expect(suggestedSaleText('9 000', 20)).toBe('10 800');
    expect(suggestedSaleText('5', 10)).toBe('6');
  });
  it("ustama yo'q yoki tan narx noto'g'ri bo'lsa taklif yo'q", () => {
    expect(suggestedSaleText('9 000', null)).toBeNull();
    expect(suggestedSaleText('', 20)).toBeNull();
    expect(suggestedSaleText('abc', 20)).toBeNull();
  });
  it("sotuv narxi qo'lda kiritilgan bo'lsa HECH QACHON taklif qilinmaydi", () => {
    expect(markupHint('9 000', '', 20)?.text).toBe('10 800');
    expect(markupHint('9 000', '12 000', 20)).toBeNull();
    expect(markupHint('9 000', '1', 20)).toBeNull();
    expect(markupHint('9 000', '  ', 20)?.sale).toBe(10_800n);
  });
});

describe('ogohlantirishlar (saqlashni to\'smaydi)', () => {
  it('tan narx sotuvdan baland', () => {
    expect(costAboveSaleWarning(12_000n, 9_000n)).toMatch(/baland/);
    expect(costAboveSaleWarning(9_000n, 9_000n)).toBeNull();
    expect(costAboveSaleWarning(null, 9_000n)).toBeNull();
    expect(costAboveSaleWarning(1n, null)).toBeNull();
  });
  it('optom narx sotuvdan baland', () => {
    expect(wholesaleAboveSaleWarning(15_000n, 13_000n)).toMatch(/Optom narx/);
    expect(wholesaleAboveSaleWarning(12_000n, 13_000n)).toBeNull();
  });
});

describe('buildPricePatch: faqat o\'zgargan ustunlar', () => {
  const init = { cost: '9 000', sale: '13 000', wholesale: '', minQty: '' };
  it("sotuv narxi o'zgardi: faqat sale_price (tan narx eski qiymat bilan ustiga yozilmaydi)", () => {
    expect(buildPricePatch(init, { ...init, sale: '14 000' }, parseQtyInput)).toEqual({ ok: true, patch: { sale_price: 14_000n } });
  });
  it("7 -> 70 000 yozilgandan keyin 70 000", () => {
    expect(buildPricePatch({ ...init, sale: '' }, { ...init, sale: '70 000' }, parseQtyInput)).toEqual({ ok: true, patch: { sale_price: 70_000n } });
  });
  it('hech narsa o\'zgarmadi: bo\'sh patch', () => {
    expect(buildPricePatch(init, init, parseQtyInput)).toEqual({ ok: true, patch: {} });
  });
  it("mavjud tan narxni bo'shatib bo'lmaydi (jimgina yo'qotilmasin); 0 ruxsat; bo'sh tan narxga yozish mumkin", () => {
    const r = buildPricePatch(init, { ...init, cost: '' }, parseQtyInput);
    expect(r.ok).toBe(false);
    expect(buildPricePatch(init, { ...init, cost: '0' }, parseQtyInput)).toEqual({ ok: true, patch: { cost_price: 0n } });
    expect(buildPricePatch({ ...init, cost: '' }, { ...init, cost: '9 500' }, parseQtyInput)).toEqual({ ok: true, patch: { cost_price: 9_500n } });
    expect(buildPricePatch({ ...init, cost: '' }, { ...init, cost: '' }, parseQtyInput)).toEqual({ ok: true, patch: {} });
  });
  it('optom: narx va miqdor juft yoziladi (miqdor milli)', () => {
    expect(buildPricePatch(init, { ...init, wholesale: '12 000', minQty: '10' }, parseQtyInput)).toEqual({
      ok: true,
      patch: { wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n },
    });
    expect(buildPricePatch(init, { ...init, wholesale: '12 000', minQty: '2,5' }, parseQtyInput)).toMatchObject({ patch: { wholesale_min_qty_milli: 2_500n } });
  });
  it("optom faqat bittasi to'ldirilsa xato (DB CHECK bilan mos)", () => {
    expect(buildPricePatch(init, { ...init, wholesale: '12 000' }, parseQtyInput).ok).toBe(false);
    expect(buildPricePatch(init, { ...init, minQty: '10' }, parseQtyInput).ok).toBe(false);
  });
  it("optomni olib tashlash: ikkalasi ham null", () => {
    const withWs = { ...init, wholesale: '12 000', minQty: '10' };
    expect(buildPricePatch(withWs, { ...withWs, wholesale: '', minQty: '' }, parseQtyInput)).toEqual({ ok: true, patch: { wholesale_price: null, wholesale_min_qty_milli: null } });
  });
  it("noto'g'ri qiymat xato qaytaradi (sotuv narxi bo'sh yoki 0 bo'lmaydi)", () => {
    expect(buildPricePatch(init, { ...init, sale: '' }, parseQtyInput).ok).toBe(false);
    expect(buildPricePatch(init, { ...init, sale: '0' }, parseQtyInput).ok).toBe(false);
    expect(buildPricePatch(init, { ...init, cost: 'abc' }, parseQtyInput).ok).toBe(false);
  });
});

describe('priceForQty: optom narx tanlash', () => {
  const p = { last_price: 13_000n, wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n };
  it('optom yoqiq: chegaradan oldin / chegarada / keyin', () => {
    expect(priceForQty(p, 9_999n, true)).toBe(13_000n);
    expect(priceForQty(p, 10_000n, true)).toBe(12_000n);
    expect(priceForQty(p, 10_001n, true)).toBe(12_000n);
  });
  it("optom O'CHIQ: har doim sotuv narxi", () => {
    expect(priceForQty(p, 99_000n, false)).toBe(13_000n);
  });
  it("optom belgilanmagan tovar yoki ustun yo'q (undefined)", () => {
    expect(priceForQty({ last_price: 5_000n }, 99_000n, true)).toBe(5_000n);
    expect(priceForQty({ last_price: null, wholesale_price: null, wholesale_min_qty_milli: null }, 1_000n, true)).toBeNull();
  });
});

describe('Mahsulotlar sahifasi: faqat nom, birlik, sotuv narxi', () => {
  it("tan narx va optom maydonlari yo'q; yozish faqat last_price (sotuv narxi, triggeri sale_price ni sinxronlaydi)", () => {
    expect(productFields(['dona']).map((f) => f.key)).toEqual(['name', 'unit', 'price']);
    const p = { id: '1', source: 'app' as const, name: 'Un', unit: 'dona' as const, last_price: 13_000n, cost_price: 9_000n, wholesale_price: 12_000n, wholesale_min_qty_milli: 10_000n, is_active: true, created_at: '', updated_at: '' };
    expect(Object.keys(productInitial(p)).sort()).toEqual(['name', 'price', 'unit']);
    expect(Object.keys(valuesToInput(productInitial(p), true)).sort()).toEqual(['is_active', 'last_price', 'name', 'unit']);
  });
});

describe("Baza (qoldiq hisobi) o'chiq: qoldiq ogohlantirishlari yo'q", () => {
  const product = { id: 'p1', source: 'app' as const, name: 'Un', unit: 'dona' as const, last_price: 13_000n, cost_price: 9_000n, is_active: true, created_at: '', updated_at: '' };
  const line = { key: 'k', productName: 'Un', productId: 'p1', qty: '50', unit: 'dona' as const, price: '13 000' };
  const data = { stock: new Map([['p1', 2_000n]]) as ReadonlyMap<string, bigint> | null };

  it('yoqiq: o\'sha ma\'lumot, «Omborda N bor» ogohlantirishi hisoblanadi; dashboard Tugayotgan tovarlar', () => {
    expect(withStockSetting(data, true)).toBe(data);
    expect(saleInsights([line], [product], data.stock).perLine.get('k')?.stock).not.toBeNull();
    const dash = buildDashboard({ sales: [], saleLines: [], payments: [], customers: [], balances: new Map(), products: [product], stock: data.stock, books: null, now: new Date() });
    expect(dash.lowStock.length).toBe(1);
  });

  it("o'chiq: qoldiq xaritasi null, ogohlantirish va «Tugayotgan tovarlar» yo'q", () => {
    const off = withStockSetting(data, false);
    expect(off.stock).toBeNull();
    expect(saleInsights([line], [product], off.stock).perLine.get('k')?.stock).toBeNull();
    const dash = buildDashboard({ sales: [], saleLines: [], payments: [], customers: [], balances: new Map(), products: [product], stock: off.stock, books: null, now: new Date() });
    expect(dash.lowStock).toEqual([]);
  });
});
