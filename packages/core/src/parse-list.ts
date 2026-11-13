/**
 * @module parse-list
 * Hisobchi Go — mahsulot ro'yxatini deterministik tahlil qilish.
 *
 * Kiritish misollari:
 *   "3 ta non 4000 so'mdan"
 *   "2 litr sut 12000 so'mdan"
 *   "chirmoq 10 ta 13 ming, yurak 5 ta 15 ming"
 *   "Chirmoq 13x15.000"   (soni × narxi)
 *   "Chirmoq 13"          (joylangan savdo ro'yxatida: nomi + soni, narx katalogdan)
 *
 * Qoidalar:
 *   - Har bir qator uchun asl matn fragmenti saqlanadi.
 *   - Birlik so'zi (ta, kg, litr ...) bilan kelgan son — miqdor.
 *   - "so'm", "so'mdan", "ming" bilan kelgan son — narx.
 *   - Ikki son orasidagi "x" / "×" / "*" (Kirill "х" ham): chapdagi — miqdor, o'ngdagi — narx.
 *   - Narx o'rnidagi "15.000", "1.500.000" — nuqta ming ajratuvchi (asoschi qarori, 11.11.2026).
 *     Miqdor o'rnida "1.500" avvalgidek noaniq (1,5 kg yoki 1500 bo'lishi mumkin) — rad etiladi.
 *   - Noaniq holatlar taxmin qilinmaydi: muammo sifatida belgilanadi.
 *   - Hisob-kitob bu yerda qilinmaydi — faqat qiymatlar ajratiladi.
 */

import type { AllowedUnit, ValidationIssue } from './types.js';
import { parseUzNumber } from './parse-uz-number.js';

/** Tahlil qilingan bitta qator */
export interface ParsedListRow {
  /** Asl matn fragmenti */
  rawText: string;
  /** Mahsulot nomi (bo'sh bo'lishi mumkin) */
  productName: string;
  /** Miqdor, mingdan bir aniqlikda */
  qtyMilli?: bigint;
  /** O'lchov birligi */
  unit?: AllowedUnit;
  /** Birlik narxi, butun so'm */
  unitPrice?: bigint;
  /** Tahlil jarayonida aniqlangan muammolar */
  issues: ValidationIssue[];
}

/** Ro'yxat tahlili natijasi */
export interface ParsedList {
  rows: ParsedListRow[];
}

export type ParseQtyResult =
  | { ok: true; qtyMilli: bigint }
  | { ok: false; message: string };

/** O'lchov birligi so'zlari → standart birlik */
const UNIT_WORDS: Record<string, AllowedUnit> = {
  ta: 'dona',
  dona: 'dona',
  donasi: 'dona',
  kg: 'kg',
  kilo: 'kg',
  kilogramm: 'kg',
  kilogram: 'kg',
  g: 'g',
  gr: 'g',
  gramm: 'g',
  l: 'litr',
  litr: 'litr',
  m: 'metr',
  metr: 'metr',
  pachka: 'pachka',
  qop: 'qop',
  karobka: 'karobka',
  korobka: 'karobka',
  quti: 'karobka',
  tonna: 'tonna',
};

/** Narx belgisi so'zlari */
const PRICE_MARKERS = new Set([
  "so'm",
  "so'mdan",
  'som',
  'somdan',
  'sum',
  'sumdan',
  'dan',
]);

/** Ming ko'paytuvchisi (narx belgisi sifatida ham) */
const THOUSAND_WORDS = new Set(['ming', 'mingdan', 'mingta']);
const MILLION_WORDS = new Set(['mln', 'million', 'mlndan', 'milliondan']);

/** O'zbekcha son so'zlari (miqdor uchun) */
const NUMBER_WORDS: Record<string, string> = {
  yarim: '0.5',
  bir: '1',
  ikki: '2',
  uch: '3',
  "to'rt": '4',
  besh: '5',
  olti: '6',
  yetti: '7',
  sakkiz: '8',
  "to'qqiz": '9',
  "o'n": '10',
};

/** Nomdan chiqarib tashlanadigan yordamchi so'zlar */
const FILLER_WORDS = new Set(['narxi', 'narx', 'x', '×', '*']);

/**
 * Ikki son orasidagi ko'paytirish belgisi ("13x15000", "13 × 15 000", Kirill "13х15000") uchun ICHKI token.
 * Foydalanuvchi yozmaydigan belgi (U+2A2F): u faqat tokenizer qo'ygan joyda paydo bo'ladi, shuning uchun
 * ishlatilmay qolsa (ortidan son kelmasa) jim yutilmaydi, xato bo'ladi.
 */
const TIMES_TOKEN = '⨯';
const TIMES_BETWEEN_NUMBERS = /(\d)\s*[xX×*хХ]\s*(?=\d)/g;
/** Birlik so'zi + belgi + son yopishgan: "3ta×4000" → "ta", "×", "4000" */
const UNIT_TIMES_NUMBER = /^([a-z']+)[xX×*хХ](\d[\d.,]*)$/;
/** "x" bilan o'qilgan narx shundan kichik bo'lsa o'lchamga o'xshaydi ("Plitka 30x60"): tekshirish so'raladi */
const SMALL_TIMES_PRICE = 100n;

/** Nuqta bilan guruhlangan butun son: "15.000", "1.500.000" (faqat narx o'rnida ming ajratuvchi) */
const DOT_GROUPED_INTEGER = /^\d{1,3}(?:\.\d{3})+$/;

const APOSTROPHE_VARIANTS = /[‘’`ʻʼ]/g;
const NUMERIC_TOKEN = /^\d+(?:[.,]\d+)*$/;

interface NumberGroup {
  value: string;
  multiplier: 1n | 1000n | 1000000n;
  role?: 'qty' | 'price';
  unit?: AllowedUnit;
  /** Rol aniq belgidan (birlik, so'm/ming, "x") kelganmi: tartib bo'yicha taxmin emas */
  explicit?: boolean;
  /** Bo'shliq bilan qo'shilgan son ("13 000"): miqdor bo'lib qolsa tekshirish kerak */
  spaced?: boolean;
  /** Narx roli "x" belgisidan kelgan (so'm/ming kabi so'z bilan emas) */
  fromTimes?: boolean;
  /** Guruh boshlangan token o'rni va asl tokenlar (nomga qaytarish uchun) */
  start: number;
  raw: string[];
}

/**
 * Miqdorni qty_milli ga aylantiradi (float ishlatilmaydi).
 * "3" → 3000n, "1.5" / "1,5" → 1500n, "0.25" → 250n.
 * 3 xonali kasr ("1.500", "1,500") noaniq — rad etiladi.
 */
export function parseQtyMilli(raw: string, multiplier: bigint = 1n): ParseQtyResult {
  const s = raw.trim();
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!m) {
    return { ok: false, message: `Miqdor formati noto'g'ri: "${raw}"` };
  }
  const intPart = m[1];
  const frac = m[2] ?? '';
  if (frac.length >= 3) {
    return {
      ok: false,
      message: `Noaniq miqdor: "${raw}" — ming ajratuvchi yoki kasr bo'lishi mumkin`,
    };
  }
  const milli = BigInt(intPart) * 1000n + BigInt(frac.padEnd(3, '0') || '0');
  return { ok: true, qtyMilli: milli * multiplier };
}

/** Narxni butun so'mga aylantiradi */
function parsePrice(group: NumberGroup): { ok: true; price: bigint } | { ok: false; message: string } {
  const notInteger = { ok: false as const, message: `Narx butun so'm bo'lishi kerak: "${group.value}"` };

  if (group.multiplier === 1n) {
    // Narx o'rnida "15.000" / "1.500.000": nuqta — ming ajratuvchi (so'm butun son, kasr bo'lmaydi)
    if (DOT_GROUPED_INTEGER.test(group.value)) {
      return { ok: true, price: BigInt(group.value.replace(/\./g, '')) };
    }
    // Qolgan format qoidalari (13,000 / 13 000) parseUzNumber bilan bir xil
    const result = parseUzNumber(group.value);
    if (!result.ok) {
      return { ok: false, message: result.error.message };
    }
    if (!/^[\d,\s]+$/.test(group.value) || !Number.isSafeInteger(result.data.value)) {
      return notInteger;
    }
    return { ok: true, price: BigInt(group.value.replace(/[,\s]/g, '')) };
  }

  // "1.5 ming", "2 mln" — kasr qismi BigInt bilan, float ishlatilmaydi
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(group.value);
  if (!m) {
    return { ok: false, message: `Narx formati noto'g'ri: "${group.value}"` };
  }
  const frac = m[2] ?? '';
  const scale = 10n ** BigInt(frac.length);
  const scaled = BigInt(m[1]) * scale + BigInt(frac || '0');
  if ((scaled * group.multiplier) % scale !== 0n) {
    return notInteger;
  }
  return { ok: true, price: (scaled * group.multiplier) / scale };
}

export type ParsePriceResult =
  | { ok: true; unitPrice: bigint }
  | { ok: false; message: string };

/**
 * Foydalanuvchi tahrirlagan narx maydonini butun so'mga aylantiradi.
 * "13000", "13 000", "13 ming", "1,5 ming", "2 mln", "4000 so'm" qabul qilinadi.
 */
export function parseUnitPriceText(text: string): ParsePriceResult {
  const words = text
    .replace(APOSTROPHE_VARIANTS, "'")
    .toLowerCase()
    .replace(/(\d)([^\d\s.,])/g, '$1 $2')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !PRICE_MARKERS.has(w));
  if (words.length === 0) {
    return { ok: false, message: 'Narx kiritilmagan' };
  }
  const group: NumberGroup = { value: '', multiplier: 1n, start: 0, raw: [] };
  const last = words[words.length - 1];
  if (THOUSAND_WORDS.has(last)) {
    group.multiplier = 1000n;
    words.pop();
  } else if (MILLION_WORDS.has(last)) {
    group.multiplier = 1000000n;
    words.pop();
  }
  group.value = words.join(group.multiplier === 1n ? ' ' : '');
  if (!/^\d[\d\s.,]*$/.test(group.value)) {
    return { ok: false, message: `Narx formati noto'g'ri: "${text.trim()}"` };
  }
  const result = parsePrice(group);
  return result.ok ? { ok: true, unitPrice: result.price } : result;
}

/** Matnni qatorlarga ajratadi: yangi qator, ";" yoki ", " */
function splitSegments(text: string): string[] {
  return text
    .split(/\r?\n|;|,(?=\s)/)
    .map((s) => s.trim().replace(/[.,]+$/, '').trim())
    .filter((s) => s.length > 0);
}

/**
 * Son va harf yopishib qolgan joylarni ajratadi: "4000so'mdan" → "4000 so'mdan".
 * Ikki son orasidagi "x"/"×"/"*" alohida token bo'ladi: "13x15.000" → "13 × 15.000".
 */
function tokenize(segment: string): string[] {
  return segment
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(TIMES_BETWEEN_NUMBERS, `$1 ${TIMES_TOKEN} `)
    // "1-nav" kabi nom bo'laklari ajratilmaydi (chiziqcha oldidan)
    .replace(/(\d)([^\d\s.,-])/g, '$1 $2')
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .flatMap((t) => {
      const m = UNIT_TIMES_NUMBER.exec(t.toLowerCase());
      return m && m[1] in UNIT_WORDS ? [t.slice(0, m[1].length), TIMES_TOKEN, m[2]] : [t];
    });
}

interface SegmentOptions {
  /**
   * Bitta belgisiz son — miqdor ("Chirmoq 13"). Joylangan SAVDO ro'yxati qoidasi (asoschi, 11.11.2026):
   * narx katalogdan olinadi. Boshqa holatlarda bitta belgisiz son noaniq (UNCLEAR_NUMBER).
   */
  singleNumberIsQty?: boolean;
  /** Birlik ko'rsatilmasa MISSING_UNIT ogohlantirishi (joylangan ro'yxatda birlik katalogdan, shuning uchun false) */
  warnMissingUnit?: boolean;
  /**
   * Soni va narxi aniq belgidan topilganda ulardan OLDINGI belgisiz sonlar nomga qo'shiladi ("Atir, 50 ml 2x20000"),
   * lekin NAME_HAS_NUMBER ogohlantirishi bilan (taxmin — savdogar tasdiqlaydi). Faqat joylangan ro'yxatda:
   * `parseProductList` (mobil) avvalgidek UNCLEAR_NUMBER beradi.
   */
  numbersInName?: boolean;
}

function parseSegment(segment: string, opts: SegmentOptions = {}): ParsedListRow {
  const warnMissingUnit = opts.warnMissingUnit ?? true;
  const tokens = tokenize(segment);
  const lower = tokens.map((t) => t.toLowerCase());
  const issues: ValidationIssue[] = [];
  const groups: NumberGroup[] = [];
  const nameParts: { at: number; text: string }[] = [];
  /** Oldingi guruhdan keyin darhol "×" keldi: keyingi guruh — narx */
  let afterTimes = false;

  let i = 0;
  while (i < tokens.length) {
    const word = lower[i];
    const numeric = NUMERIC_TOKEN.test(word) ? word : NUMBER_WORDS[word];
    const startsGroup =
      numeric !== undefined &&
      // Son so'zlari faqat ortidan birlik kelganda miqdor hisoblanadi
      (NUMERIC_TOKEN.test(word) || (i + 1 < tokens.length && lower[i + 1] in UNIT_WORDS));

    if (!startsGroup) {
      const prev = groups[groups.length - 1];
      const prevEndsHere = prev !== undefined && prev.start + prev.raw.length === i;
      const nextIsNumber = i + 1 < tokens.length && NUMERIC_TOKEN.test(lower[i + 1]);
      if (word === TIMES_TOKEN && prevEndsHere && nextIsNumber && prev.role !== 'price') {
        // "13 × 15 000": chapdagi miqdor, o'ngdagi narx (aniq belgi)
        prev.role = 'qty';
        prev.explicit = true;
        afterTimes = true;
      } else if (word === TIMES_TOKEN) {
        // Tokenizer "x" ni son oldida ko'rgan, lekin u ishlatilmadi (masalan oldida narx bor): jim yutilmaydi
        issues.push({ code: 'UNCLEAR_TIMES', message: "«x» belgisi tushunilmadi: soni va narxini tekshiring", severity: 'error' });
      } else if (!FILLER_WORDS.has(word) && !PRICE_MARKERS.has(word)) {
        nameParts.push({ at: i, text: tokens[i] });
      }
      i++;
      continue;
    }

    const start = i;
    const group: NumberGroup = { value: numeric!, multiplier: 1n, start, raw: [] };
    if (afterTimes) {
      group.role = 'price';
      group.explicit = true;
      group.fromTimes = true;
      afterTimes = false;
    }
    i++;
    // Bir nechta bo'shliq bilan yozilgan son: "13 000"
    while (i < tokens.length && /^\d{3}$/.test(lower[i]) && NUMERIC_TOKEN.test(group.value)) {
      group.value += lower[i];
      group.spaced = true;
      i++;
    }
    if (i < tokens.length && THOUSAND_WORDS.has(lower[i])) {
      group.multiplier = 1000n;
      if (lower[i] !== 'mingta') {
        group.role = 'price';
        group.explicit = true;
      }
      i++;
    } else if (i < tokens.length && MILLION_WORDS.has(lower[i])) {
      group.multiplier = 1000000n;
      group.role = 'price';
      group.explicit = true;
      i++;
    }
    if (i < tokens.length && lower[i] in UNIT_WORDS && group.role !== 'price') {
      group.role = 'qty';
      group.explicit = true;
      group.unit = UNIT_WORDS[lower[i]];
      i++;
    } else if (i < tokens.length && PRICE_MARKERS.has(lower[i])) {
      group.role = 'price';
      group.explicit = true;
      i++;
    }
    group.raw = tokens.slice(start, i);
    groups.push(group);
  }

  const qtyGroups = groups.filter((g) => g.role === 'qty');
  const priceGroups = groups.filter((g) => g.role === 'price');
  let free = groups.filter((g) => g.role === undefined);

  let qty: NumberGroup | undefined = qtyGroups[0];
  let price: NumberGroup | undefined = priceGroups[0];

  // Faqat joylangan ro'yxatda: soni va narxi aniq belgidan topilgan, belgisiz sonlar ulardan OLDIN
  // ("Atir, 50 ml 2x20000") — nomga qo'shiladi, lekin bu taxmin, shuning uchun ogohlantirish bilan.
  if (opts.numbersInName && qty?.explicit && price?.explicit && qtyGroups.length === 1 && priceGroups.length === 1 && free.length > 0) {
    const firstRole = Math.min(qty.start, price.start);
    if (free.every((g) => g.start < firstRole)) {
      for (const g of free) nameParts.push({ at: g.start, text: g.raw.join(' ') });
      issues.push({
        code: 'NAME_HAS_NUMBER',
        message: `Nomdagi son (${free.map((g) => g.raw.join(' ')).join(', ')}) nomning bir qismi deb olindi — tekshiring`,
        severity: 'warning',
        field: 'productName',
      });
      free = [];
    }
  }

  if (qtyGroups.length > 1 || priceGroups.length > 1) {
    issues.push({
      code: 'AMBIGUOUS_NUMBERS',
      message: "Qatorda bir nechta miqdor yoki narx bor — qaysi biri to'g'riligini tanlang",
      severity: 'error',
    });
    qty = undefined;
    price = undefined;
  } else if (!qty && !price && free.length === 2) {
    qty = free[0];
    price = free[1];
    issues.push({
      code: 'ASSUMED_ROLES',
      message: "Miqdor va narx tartib bo'yicha aniqlandi — tekshiring",
      severity: 'warning',
      field: 'qtyMilli',
    });
  } else if (qty && !price && free.length === 1) {
    price = free[0];
  } else if (!qty && price && free.length === 1) {
    qty = free[0];
  } else if (!qty && !price && free.length === 1 && opts.singleNumberIsQty) {
    qty = free[0];
  } else if (free.length > 0) {
    issues.push({
      code: 'UNCLEAR_NUMBER',
      message: `Sonning ma'nosi aniq emas: ${free.map((g) => g.value).join(', ')}`,
      severity: 'error',
    });
  }

  const row: ParsedListRow = {
    rawText: segment,
    productName: nameParts
      .sort((x, y) => x.at - y.at)
      .map((x) => x.text)
      .join(' ')
      .trim(),
    issues,
  };

  if (qty) {
    const q = parseQtyMilli(qty.value, qty.multiplier);
    if (q.ok) {
      row.qtyMilli = q.qtyMilli;
      if (qty.spaced && qty.multiplier === 1n) {
        // "chirmoq 10 130" → 10130: bo'shliq ming ajratuvchimi yoki ikki son? Savdogar tasdiqlasin
        issues.push({
          code: 'SPACED_QTY',
          message: `Soni bo'shliq bilan yozilgan («${qty.raw.join(' ')}»): ${qty.value} deb o'qildi — tekshiring`,
          severity: 'warning',
          field: 'qtyMilli',
        });
      }
    } else {
      issues.push({ code: 'QTY_PARSE_ERROR', message: q.message, severity: 'error', field: 'qtyMilli' });
    }
    if (qty.unit) {
      row.unit = qty.unit;
    } else if (warnMissingUnit) {
      issues.push({
        code: 'MISSING_UNIT',
        message: "O'lchov birligi ko'rsatilmagan — tanlang",
        severity: 'warning',
        field: 'unit',
      });
    }
  }

  if (price) {
    const p = parsePrice(price);
    if (p.ok) {
      row.unitPrice = p.price;
      if (price.fromTimes && price.multiplier === 1n && p.price < SMALL_TIMES_PRICE) {
        // "Plitka 30x60" — o'lcham bo'lishi mumkin, 60 so'm narx emas
        issues.push({
          code: 'SMALL_PRICE',
          message: `Narx ${p.price} so'm deb o'qildi (o'lcham emasmi?) — tekshiring`,
          severity: 'warning',
          field: 'unitPrice',
        });
      }
    } else {
      issues.push({ code: 'PRICE_PARSE_ERROR', message: p.message, severity: 'error', field: 'unitPrice' });
    }
  }

  return row;
}

/**
 * Mahsulot ro'yxati matnini tuzilgan qatorlarga ajratadi.
 * Summalar hisoblanmaydi — bu calculation modulining vazifasi.
 */
export function parseProductList(text: string): ParsedList {
  return { rows: splitSegments(text).map((seg) => parseSegment(seg)) };
}

// ---------------------------------------------------------------------------
// Joylangan (paste) ro'yxat: har qator — bitta mahsulot (F1)
// ---------------------------------------------------------------------------

/** Qator holati: aniq — tushunildi; noaniq — tekshirish yoki tanlash kerak; xato — tushunilmadi */
export type PastedRowStatus = 'aniq' | 'noaniq' | 'xato';

export interface PastedListRow extends ParsedListRow {
  /** Asl matndagi qator raqami (1 dan) */
  lineNo: number;
  status: PastedRowStatus;
}

export interface PastedListOptions {
  /**
   * 'sale': "Chirmoq 13" (nomi + soni) yetarli, narx katalogdan.
   * 'purchase': nomi, soni va narxi shart (narx bo'lmasa — noaniq).
   */
  kind: 'sale' | 'purchase';
}

/** "1. ", "2) ", "- ", "• ", "* " kabi ro'yxat belgisi (raqamdan keyin nuqta/qavs va bo'shliq shart) */
const LIST_MARKER = /^\s*(?:\d{1,3}[.)]\s+|[-–—•*]\s+)/;

const splitLines = (text: string) => text.split(/\r\n|\r|\n/);

/** Matnda kamida 2 ta bo'sh bo'lmagan qator bormi (bitta qatorli matn odatdagi qidiruvga ketadi) */
export function isMultiLineList(text: string): boolean {
  return splitLines(text).filter((l) => l.trim().length > 0).length >= 2;
}

/**
 * Ko'p qatorli ro'yxatni qator-qator tahlil qiladi. Faqat yangi qator bo'yicha bo'linadi (";" va ", " emas:
 * joylangan ro'yxatda har qator bitta tovar). Bo'sh qatorlar tashlanadi, `lineNo` asl raqamni saqlaydi.
 * Hisob yo'q: summa calculation modulida.
 */
export function parsePastedList(text: string, opts: PastedListOptions): PastedListRow[] {
  const out: PastedListRow[] = [];
  splitLines(text).forEach((line, idx) => {
    // Qator oxiridagi tinish belgisi ("Yurak 5x15.000.", "Chirmoq 13.") sonning bir qismi emas
    const segment = line.replace(LIST_MARKER, '').trim().replace(/[;,.]+$/, '').trim();
    if (!segment) return;
    const row = parseSegment(segment, { singleNumberIsQty: opts.kind === 'sale', warnMissingUnit: false, numbersInName: true });
    row.rawText = line.trim();
    const hasError = () => row.issues.some((x) => x.severity === 'error');
    if (!row.productName) {
      row.issues.push({ code: 'MISSING_NAME', message: 'Tovar nomi topilmadi', severity: 'error', field: 'productName' });
    }
    if (row.qtyMilli === undefined && !hasError()) {
      row.issues.push({ code: 'MISSING_QTY', message: "Soni ko'rsatilmagan", severity: 'warning', field: 'qtyMilli' });
    }
    if (opts.kind === 'purchase' && row.unitPrice === undefined && !hasError()) {
      row.issues.push({ code: 'MISSING_PRICE', message: "Kirim narxi ko'rsatilmagan", severity: 'warning', field: 'unitPrice' });
    }
    const status: PastedRowStatus = hasError() ? 'xato' : row.issues.length > 0 ? 'noaniq' : 'aniq';
    out.push({ ...row, lineNo: idx + 1, status });
  });
  return out;
}
