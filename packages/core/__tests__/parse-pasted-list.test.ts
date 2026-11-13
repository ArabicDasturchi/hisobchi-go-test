/**
 * @file parse-pasted-list.test.ts
 * F1: ko'p qatorli ro'yxatni joylash — parsePastedList, isMultiLineList va "x" belgisi.
 * Kutilgan qiymatlar qo'lda yozilgan (tekshirilayotgan funksiyadan olinmagan).
 */
import { describe, expect, it } from 'vitest';
import { calculateLineTotal } from '../src/calculation.js';
import { isMultiLineList, parsePastedList, parseProductList } from '../src/parse-list.js';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const sale = (t: string) => parsePastedList(t, { kind: 'sale' });
const buy = (t: string) => parsePastedList(t, { kind: 'purchase' });

describe('isMultiLineList', () => {
  it('2+ bo‘sh bo‘lmagan qator — ro‘yxat', () => {
    expect(isMultiLineList('Chirmoq 13\nYurak 5')).toBe(true);
    expect(isMultiLineList('Chirmoq 13\r\n\r\nYurak 5\r\n')).toBe(true);
  });
  it('bitta qator yoki bo‘sh qatorlar — ro‘yxat emas (odatdagi qidiruv)', () => {
    expect(isMultiLineList('Chirmoq 13')).toBe(false);
    expect(isMultiLineList('Chirmoq 13\n\n   \n')).toBe(false);
    expect(isMultiLineList('')).toBe(false);
  });
});

describe('"x" belgisi: soni × narxi', () => {
  it.each([
    ['Chirmoq 13x15.000', 13000n, 15000n],
    ['Chirmoq 13x15000', 13000n, 15000n],
    ['Chirmoq 13x15 000', 13000n, 15000n],
    ['Chirmoq 13 x 15 000', 13000n, 15000n],
    ['Chirmoq 13×15000', 13000n, 15000n],
    ['Chirmoq 13*15000', 13000n, 15000n],
    ['Chirmoq 13х15000', 13000n, 15000n], // Kirill "х"
    ['Chirmoq 13X15000', 13000n, 15000n],
    ['Chirmoq 2,5x12000', 2500n, 12000n],
    ['Chirmoq 10x13 ming', 10000n, 13000n],
    ["Chirmoq 10x13000 so'mdan", 10000n, 13000n],
    ['Chirmoq 1x1.500.000', 1000n, 1500000n],
  ])('%s → soni %s, narxi %s, aniq', (text, qty, price) => {
    const [row] = sale(text);
    expect(row).toMatchObject({ productName: 'Chirmoq', qtyMilli: qty, unitPrice: price, status: 'aniq' });
    expect(row!.issues).toEqual([]);
  });

  it('eski parseProductList ham "10x13000" ni tushunadi (avval nom bo‘lib qolardi)', () => {
    const { rows } = parseProductList('chirmoq 10x13000');
    expect(rows[0]).toMatchObject({ productName: 'chirmoq', qtyMilli: 10000n, unitPrice: 13000n });
  });

  it('nomdagi "x" so‘zi (son orasida emas) nomda qoladi: "Xurmo 3x9000"', () => {
    expect(sale('Xurmo 3x9000')[0]).toMatchObject({ productName: 'Xurmo', qtyMilli: 3000n, unitPrice: 9000n });
  });

  it('nomdagi son bo‘lagi: "Un 1-nav 2x50000" → nom "Un 1-nav"', () => {
    expect(sale('Un 1-nav 2x50000')[0]).toMatchObject({ productName: 'Un 1-nav', qtyMilli: 2000n, unitPrice: 50000n, status: 'aniq' });
  });

  it('qator oxiridagi nuqta narxni yo‘qotmaydi: "Yurak 5x15.000." va "Chirmoq 13."', () => {
    expect(sale('Yurak 5x15.000.')[0]).toMatchObject({ productName: 'Yurak', qtyMilli: 5000n, unitPrice: 15000n, status: 'aniq' });
    expect(sale('Chirmoq 13.')[0]).toMatchObject({ productName: 'Chirmoq', qtyMilli: 13000n, status: 'aniq' });
  });

  it('ishlatilmagan "x" jim yutilmaydi: "Chirmoq 2x3x4" → UNCLEAR_TIMES xato', () => {
    const [row] = sale('Chirmoq 2x3x4');
    expect(row!.status).toBe('xato');
    expect(codes(row!.issues)).toContain('UNCLEAR_TIMES');
    expect(row!.productName).toBe('Chirmoq');
  });

  it('birlik yopishgan: "non 3ta×4000" → nom "non", 3 dona × 4000', () => {
    expect(sale('non 3ta×4000')[0]).toMatchObject({ productName: 'non', qtyMilli: 3000n, unit: 'dona', unitPrice: 4000n, status: 'aniq' });
    expect(sale('non 3 ta x 4000')[0]).toMatchObject({ productName: 'non', qtyMilli: 3000n, unitPrice: 4000n, status: 'aniq' });
  });

  it('o‘lchamga o‘xshash "Plitka 30x60" — narx 60 so‘m, tekshirish so‘raladi (noaniq)', () => {
    const [row] = sale('Plitka 30x60');
    expect(row).toMatchObject({ qtyMilli: 30000n, unitPrice: 60n, status: 'noaniq' });
    expect(codes(row!.issues)).toEqual(['SMALL_PRICE']);
    // "60 so'm" deb aniq yozilsa savol yo'q
    expect(sale("Plitka 30 ta 60 so'm")[0]!.status).toBe('aniq');
  });

  it('parseProductList (mobil) nomga son yutmaydi: avvalgidek UNCLEAR_NUMBER', () => {
    const { rows } = parseProductList("chirmoq 10 13 ta 4000 so'm");
    expect(codes(rows[0]!.issues)).toContain('UNCLEAR_NUMBER');
    expect(rows[0]!.productName).toBe('chirmoq');
  });

  it('joylangan ro‘yxatda nomdagi son — NAME_HAS_NUMBER bilan noaniq (jim emas)', () => {
    const [row] = sale("chirmoq 10 13 ta 4000 so'm");
    expect(row).toMatchObject({ productName: 'chirmoq 10', qtyMilli: 13000n, unitPrice: 4000n, status: 'noaniq' });
    expect(codes(row!.issues)).toEqual(['NAME_HAS_NUMBER']);
  });

  it('miqdor o‘rnida nuqtali son ("1.500x9000") — noaniq miqdor, xato', () => {
    const [row] = sale('Guruch 1.500x9000');
    expect(row!.status).toBe('xato');
    expect(codes(row!.issues)).toContain('QTY_PARSE_ERROR');
  });
});

describe('parsePastedList — savdo', () => {
  it('"Chirmoq 13": nomi + soni (narx katalogdan), aniq', () => {
    const [row] = sale('Chirmoq 13');
    expect(row).toMatchObject({ productName: 'Chirmoq', qtyMilli: 13000n, status: 'aniq', lineNo: 1 });
    expect(row!.unitPrice).toBeUndefined();
    expect(row!.issues).toEqual([]);
  });

  it("an'anaviy shakl: \"3 ta non 4000 so'mdan\"", () => {
    expect(sale("3 ta non 4000 so'mdan")[0]).toMatchObject({ productName: 'non', qtyMilli: 3000n, unit: 'dona', unitPrice: 4000n, status: 'aniq' });
  });

  it('birlik so‘zlari: kg, dona, litr', () => {
    const rows = sale('Guruch 5 kg 12 ming\nNon 3 dona 4000 so‘m\nSut 2 litr 12000 so‘mdan');
    expect(rows.map((r) => [r.productName, r.qtyMilli, r.unit, r.unitPrice, r.status])).toEqual([
      ['Guruch', 5000n, 'kg', 12000n, 'aniq'],
      ['Non', 3000n, 'dona', 4000n, 'aniq'],
      ['Sut', 2000n, 'litr', 12000n, 'aniq'],
    ]);
  });

  it('har qator alohida: ", " va ";" qator ichida bo‘lmaydi', () => {
    const rows = sale('Atir, 50 ml 2x20000\nChirmoq 13');
    expect(rows).toHaveLength(2);
    // Nomdagi "50" nomga qo'shiladi, lekin bu taxmin: ogohlantirish bilan noaniq
    expect(rows[0]).toMatchObject({ productName: 'Atir, 50 ml', qtyMilli: 2000n, unitPrice: 20000n, status: 'noaniq' });
    expect(codes(rows[0]!.issues)).toEqual(['NAME_HAS_NUMBER']);
  });

  it('ro‘yxat belgilari olib tashlanadi: "1. ", "2) ", "- ", "• "', () => {
    const rows = sale('1. Chirmoq 10x13000\n2) Yurak 5x15000\n- Momiq 20x9000\n• Tasbeh 3');
    expect(rows.map((r) => r.productName)).toEqual(['Chirmoq', 'Yurak', 'Momiq', 'Tasbeh']);
    expect(rows.map((r) => r.rawText)).toEqual(['1. Chirmoq 10x13000', '2) Yurak 5x15000', '- Momiq 20x9000', '• Tasbeh 3']);
    expect(rows.every((r) => r.status === 'aniq')).toBe(true);
  });

  it('bo‘sh qatorlar tashlanadi, lineNo asl raqam', () => {
    const rows = sale('Chirmoq 13\n\n\nYurak 5\r\n');
    expect(rows.map((r) => r.lineNo)).toEqual([1, 4]);
  });

  it('sonsiz qator — noaniq (soni yo‘q)', () => {
    const [row] = sale('Chirmoq');
    expect(row!.status).toBe('noaniq');
    expect(codes(row!.issues)).toEqual(['MISSING_QTY']);
  });

  it('nomsiz qator ("15 000") — xato', () => {
    const [row] = sale('15 000');
    expect(row!.status).toBe('xato');
    expect(codes(row!.issues)).toContain('MISSING_NAME');
  });

  it('bo‘shliqli miqdor ("Chirmoq 10 130") — noaniq, tekshirish so‘raladi', () => {
    const [row] = sale('Chirmoq 10 130');
    expect(row).toMatchObject({ qtyMilli: 10130000n, status: 'noaniq' });
    expect(codes(row!.issues)).toEqual(['SPACED_QTY']);
  });

  it('belgisiz ikki son ("Chirmoq 13 15000") — tartib bo‘yicha, noaniq', () => {
    const [row] = sale('Chirmoq 13 15000');
    expect(row).toMatchObject({ qtyMilli: 13000n, unitPrice: 15000n, status: 'noaniq' });
    expect(codes(row!.issues)).toEqual(['ASSUMED_ROLES']);
  });

  it('ikki narx — xato', () => {
    expect(sale("Chirmoq 13000 so'm 15000 so'm")[0]!.status).toBe('xato');
  });

  it('Kirill yozuvli nom saqlanadi (katalog moslashi webda)', () => {
    expect(sale('Чирмоқ 10x13000')[0]).toMatchObject({ productName: 'Чирмоқ', qtyMilli: 10000n, unitPrice: 13000n, status: 'aniq' });
  });
});

describe('parsePastedList — kirim', () => {
  it('nomi, soni, narxi bor — aniq', () => {
    expect(buy('Chirmoq 13x15.000')[0]).toMatchObject({ qtyMilli: 13000n, unitPrice: 15000n, status: 'aniq' });
  });
  it('"Chirmoq 13" kirimda yetarli emas: bitta son noaniq → xato (narx shart)', () => {
    const [row] = buy('Chirmoq 13');
    expect(row!.status).toBe('xato');
    expect(codes(row!.issues)).toContain('UNCLEAR_NUMBER');
  });
  it("birlik bilan soni bor, narx yo'q — noaniq (MISSING_PRICE)", () => {
    const [row] = buy('Chirmoq 13 ta');
    expect(row).toMatchObject({ qtyMilli: 13000n, status: 'noaniq' });
    expect(codes(row!.issues)).toEqual(['MISSING_PRICE']);
  });
});

describe('Namuna: 10×13 000 + 5×15 000 + 20×9 000 = 385 000', () => {
  it.each([
    ['x shakli', 'Chirmoq 10x13 000\nYurak 5x15.000\nMomiq 20x9000'],
    ['so‘z shakli', "Chirmoq 10 ta 13 ming\nYurak 5 ta 15000 so'mdan\nMomiq 20 ta 9 000 so'm"],
  ])('%s', (_n, text) => {
    const rows = sale(text);
    expect(rows.map((r) => r.status)).toEqual(['aniq', 'aniq', 'aniq']);
    // Hisob tahlilchida emas: core calculateLineTotal (SQL calculate_line_total bilan bir formula)
    const total = rows.reduce((s, r) => s + calculateLineTotal(r.qtyMilli!, r.unitPrice!), 0n);
    expect(total).toBe(385000n);
  });
});
