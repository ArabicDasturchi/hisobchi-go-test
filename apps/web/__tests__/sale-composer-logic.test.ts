import { describe, expect, it } from 'vitest';
import type { Product, SaleDoc, SaleLineCost } from '@/lib/data/types';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import { topProducts } from '@/lib/productPicker';
import { applySelection, listedQty, searchProductsAll, toggleSelection } from '@/lib/productSearch';
import { buildSalePlan, type DraftLine } from '@/lib/saleForm';
import { cyrillicToLatin, searchKey } from '@/lib/translit';

const P = (id: string, name: string, price: number | null, extra: Partial<Product> = {}): Product => ({
  id,
  name,
  unit: 'dona',
  last_price: price === null ? null : BigInt(price),
  is_active: true,
  source: 'app',
  created_at: '',
  updated_at: '',
  ...extra,
});

const TURK = P('j1', 'Joynamoz Turk', 13000);
const ERON = P('j2', 'Joynamoz Eron', 15000);
const KATTA = P('j3', 'Joynamoz katta', 22000);
const BOLALAR = P('j4', 'Joynamoz bolalar', 9000);
const CHONTAK = P('j5', "Joynamoz cho'ntak", 11000);
const TASBEH = P('t1', 'Tasbeh', 15000);
const ROMOL = P('r1', "Ro'mol", 9000);
const QURON = P('q1', "Qur'on (kichik)", null);
const CATALOG = [TURK, ERON, KATTA, BOLALAR, CHONTAK, TASBEH, ROMOL, QURON, P('x1', 'Eski joynamoz', 1000, { is_active: false })];
const names = (ps: Product[]) => ps.map((p) => p.name);

let n = 0;
const key = () => `k${++n}`;
const blank = (): DraftLine => ({ key: key(), productName: '', qty: '', unit: 'dona', price: '' });

describe('translit', () => {
  it("o'zbek va rus Kirill harflari Lotinga o'tadi", () => {
    expect(cyrillicToLatin('жой')).toBe('joy');
    expect(cyrillicToLatin('қуръон')).toBe("qur'on");
    expect(cyrillicToLatin('ўрик ғишт ҳовли')).toBe("o'rik g'isht hovli");
    expect(cyrillicToLatin('шчёюяэцчь')).toBe('shchyoyuyaetsch');
  });
  it('Lotin matn o‘zgarmaydi, apostrof turlari birlashadi', () => {
    expect(searchKey("Qur`on")).toBe("qur'on");
    expect(searchKey('  JOY  ')).toBe('joy');
  });
});

describe('searchProductsAll', () => {
  it('"joy", "ЖОЙ", "жой", "Joy" bir xil natija beradi', () => {
    const base = names(searchProductsAll(CATALOG, 'joy'));
    expect(base).toHaveLength(5);
    for (const q of ['ЖОЙ', 'жой', 'Joy', ' joy ']) expect(names(searchProductsAll(CATALOG, q))).toEqual(base);
  });
  it('"qur\'on", "қуръон", "Qur`on" va apostrofsiz "quron" bir xil', () => {
    for (const q of ["qur'on", 'қуръон', 'Qur`on', 'quron', 'ҚУРЪОН']) expect(names(searchProductsAll(CATALOG, q))).toEqual(["Qur'on (kichik)"]);
  });
  it('barcha 5 joynamoz chiqadi; arxivlangani chiqmaydi', () => {
    expect(names(searchProductsAll(CATALOG, 'joy')).sort()).toEqual(['Joynamoz Eron', 'Joynamoz Turk', 'Joynamoz bolalar', "Joynamoz cho'ntak", 'Joynamoz katta'].sort());
  });
  it("8 dan ko'pida ham kesilmaydi (chegara 50)", () => {
    const many = Array.from({ length: 30 }, (_, i) => P(`m${i}`, `Joynamoz ${String(i).padStart(2, '0')}`, 1000));
    expect(searchProductsAll(many, 'joy')).toHaveLength(30);
    const huge = Array.from({ length: 80 }, (_, i) => P(`h${i}`, `Joynamoz ${i}`, 1000));
    expect(searchProductsAll(huge, 'joy')).toHaveLength(50);
  });
  it("tartib: nom boshidan, so'z boshidan, ichidan", () => {
    const cat = [P('a', 'Katta joynamoz', 1), P('b', 'Kichik buyum', 1), P('c', 'Joynamoz', 1), P('d', 'Ayjoy', 1)];
    expect(names(searchProductsAll(cat, 'joy'))).toEqual(['Joynamoz', 'Katta joynamoz', 'Ayjoy']);
  });
  it("guruh ichida ko'p sotilgani yuqorida, keyin alifbo", () => {
    const sales = [{ id: 's1', status: 'posted' }] as unknown as SaleDoc[];
    const lines = [
      { document_id: 's1', product_id: 'j3', qty_milli: 50000n },
      { document_id: 's1', product_id: 'j2', qty_milli: 10000n },
    ] as unknown as SaleLineCost[];
    const popular = topProducts(CATALOG, sales, lines, 50);
    expect(names(searchProductsAll(CATALOG, 'joy', popular))).toEqual(['Joynamoz katta', 'Joynamoz Eron', 'Joynamoz bolalar', "Joynamoz cho'ntak", 'Joynamoz Turk']);
  });
  it("bo'sh so'rov: avval ko'p sotilganlar, keyin oxirgi qo'shilganlar, jami 8 ta", () => {
    const many = Array.from({ length: 12 }, (_, i) => P(`n${i}`, `Tovar ${i}`, 1000, { created_at: `2026-11-${String(i + 1).padStart(2, '0')}` }));
    const out = searchProductsAll(many, '', [many[3]!, many[1]!]);
    expect(out).toHaveLength(8);
    expect(out.slice(0, 3).map((p) => p.id)).toEqual(['n3', 'n1', 'n11']); // ranked, so'ng eng yangisi
    expect(out[3]!.id).toBe('n10');
  });
  it('mos kelmasa bo‘sh', () => expect(searchProductsAll(CATALOG, 'zzz')).toEqual([]));
});

describe('ko‘p tanlash', () => {
  it('toggleSelection: bosish belgilaydi, qayta bosish bekor qiladi, tartib saqlanadi', () => {
    let s: string[] = [];
    s = toggleSelection(s, 'j2');
    s = toggleSelection(s, 'j3');
    s = toggleSelection(s, 'j5');
    expect(s).toEqual(['j2', 'j3', 'j5']);
    expect(toggleSelection(s, 'j3')).toEqual(['j2', 'j5']);
  });

  it("3 tasini tanlab qo'shish → 3 qator (soni 1, narx bazadan)", () => {
    const out = applySelection([blank()], [ERON, KATTA, CHONTAK], key);
    expect(out).toHaveLength(3); // bo'sh qator birinchisini oldi
    expect(out.map((l) => [l.productName, l.qty, l.price])).toEqual([
      ['Joynamoz Eron', '1', '15 000'],
      ['Joynamoz katta', '1', '22 000'],
      ["Joynamoz cho'ntak", '1', '11 000'],
    ]);
  });

  it("yana shu uchtasini → qatorlar ko'paymaydi, sonlar +1", () => {
    const first = applySelection([], [ERON, KATTA, CHONTAK], key);
    const second = applySelection(first, [ERON, KATTA, CHONTAK], key);
    expect(second).toHaveLength(3);
    expect(second.map((l) => l.qty)).toEqual(['2', '2', '2']);
    expect(second.map((l) => l.key)).toEqual(first.map((l) => l.key));
  });

  it("Kirillda yozilgan mavjud qator ham takror hisoblanadi", () => {
    const lines: DraftLine[] = [{ key: 'a', productName: 'ЖОЙНАМОЗ ЭРОН', qty: '4', unit: 'dona', price: '15 000' }];
    const out = applySelection(lines, [ERON], key);
    expect(out).toHaveLength(1);
    expect(out[0]!.qty).toBe('5');
  });

  it('bo‘sh qator faqat birinchi yangi tovarni oladi; qolganlari yangi qator', () => {
    const lines: DraftLine[] = [{ key: 'a', productName: 'Tasbeh', qty: '5', unit: 'dona', price: '15 000' }, blank()];
    const out = applySelection(lines, [ERON, KATTA], key);
    expect(out).toHaveLength(3);
    expect(out[1]!.productName).toBe('Joynamoz Eron');
    expect(out[2]!.productName).toBe('Joynamoz katta');
  });

  it('tanlovda bir tovar ikki marta bo‘lsa ham bir marta qo‘shiladi', () => {
    expect(applySelection([], [ERON, ERON], key)).toHaveLength(1);
  });

  it('listedQty: ro‘yxatdagi tovar soni', () => {
    const lines = applySelection([], [TURK], key).map((l) => ({ ...l, qty: '10' }));
    expect(listedQty(lines, TURK)).toBe('10');
    expect(listedQty(lines, ERON)).toBeNull();
  });
});

describe('lineStatus', () => {
  const L = (over: Partial<DraftLine>): DraftLine => ({ key: 'k', productName: 'Tasbeh', qty: '5', unit: 'dona', price: '15 000', ...over });
  it('to‘liq qator ok', () => expect(lineStatus(L({}), CATALOG)).toEqual({ status: 'ok', isNew: false }));
  it("narxi yo'q qator sariq; to'ldirilgach ok", () => {
    const quron = applySelection([], [QURON], key)[0]!;
    expect(quron.price).toBe('');
    const s = lineStatus(quron, CATALOG);
    expect(s).toMatchObject({ status: 'yellow', reason: 'price' });
    expect(lineStatus({ ...quron, price: '30 000' }, CATALOG).status).toBe('ok');
  });
  it('soni yo‘q yoki noto‘g‘ri → sariq', () => {
    expect(lineStatus(L({ qty: '' }), CATALOG)).toMatchObject({ status: 'yellow', reason: 'qty' });
    expect(lineStatus(L({ qty: 'abc' }), CATALOG)).toMatchObject({ status: 'yellow', reason: 'qty' });
    expect(lineStatus(L({ qty: '0' }), CATALOG)).toMatchObject({ status: 'yellow', reason: 'qty' });
  });
  it('nom bo‘sh → sariq', () => expect(lineStatus(L({ productName: '  ' }), CATALOG)).toMatchObject({ status: 'yellow', reason: 'name' }));
  it('katalogda yo‘q nom: "Yangi tovar", son va narx bor bo‘lsa sariq emas', () => {
    expect(lineStatus(L({ productName: 'Yangi buyum' }), CATALOG)).toEqual({ status: 'ok', isNew: true });
    expect(lineStatus(L({ productName: 'Yangi buyum', price: '' }), CATALOG)).toMatchObject({ status: 'yellow', isNew: true });
  });
});

describe('summarizeLines va jami', () => {
  const lines: DraftLine[] = [
    { key: '1', productName: 'Joynamoz Turk', qty: '10', unit: 'dona', price: '13 000' },
    { key: '2', productName: 'Tasbeh', qty: '5', unit: 'dona', price: '15 000' },
    { key: '3', productName: "Ro'mol", qty: '20', unit: 'dona', price: '9 000' },
  ];
  it('10×13 000 + 5×15 000 + 20×9 000 = 385 000 (buildSalePlan orqali)', () => {
    const plan = buildSalePlan({ lines, customerId: null, mode: 'paid', partial: '' });
    expect(plan.ok && plan.plan.total).toBe(385000n);
    const sum = summarizeLines(lines, CATALOG);
    expect(sum).toMatchObject({ ready: 3, incomplete: 0, total: 385000n, canConfirm: true, blockedReason: null });
  });
  it('sariq qator bor: jami faqat to‘liq qatorlardan, "Tasdiqlash" yopiq, sabab bor', () => {
    const withYellow = [...lines, { key: '4', productName: "Qur'on (kichik)", qty: '1', unit: 'dona' as const, price: '' }];
    const sum = summarizeLines(withYellow, CATALOG);
    expect(sum).toMatchObject({ ready: 3, incomplete: 1, total: 385000n, canConfirm: false });
    expect(sum.blockedReason).toContain('1 ta');
    const fixed = withYellow.map((l) => (l.key === '4' ? { ...l, price: '30 000' } : l));
    expect(summarizeLines(fixed, CATALOG)).toMatchObject({ ready: 4, incomplete: 0, total: 415000n, canConfirm: true });
  });
  it('qator yo‘q yoki faqat bo‘sh qator: Tasdiqlash yopiq', () => {
    expect(summarizeLines([], CATALOG).canConfirm).toBe(false);
    expect(summarizeLines([blank()], CATALOG)).toMatchObject({ canConfirm: false, ready: 0, incomplete: 0 });
  });
});
