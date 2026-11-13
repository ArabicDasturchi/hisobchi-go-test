/**
 * Ombor narxlari va ombor sozlamalari (sof mantiq, UI'siz, testlanadi).
 * Hisob faqat `@hisobchi/core` da (`suggestSalePrice`, `resolveUnitPrice`): bu fayl matnni o'qiydi va qatorlarni bog'laydi.
 *
 * Sozlamalar `shops.settings` jsonb da (010/014): `wholesale_enabled` (default false), `stock_enabled` (default TRUE:
 * mavjud do'konlar buzilmasin), `markup_percent` (butun 0..1000 yoki null). Boshqa kalitlar (`units`) saqlanadi.
 */
import { isValidMarkupPercent, isWholesaleApplied, resolveUnitPrice, suggestSalePrice, MAX_MARKUP_PERCENT } from '@hisobchi/core';
import type { Product } from './data/types';
import { formatMoneyInput, formatSom, parseMoneyInput, parseQtyInput } from './money';
import type { DraftLine } from './saleForm';

export interface PricingSettings {
  /** Optom/dona: tovarlarda optom maydonlari va savdoda optom narx */
  wholesaleEnabled: boolean;
  /** Baza (qoldiq hisobi): tovarda soni, "Kam qoldi" va "Omborda N bor" ogohlantirishlari */
  stockEnabled: boolean;
  /** Umumiy ustama %: tan narxdan sotuv narxi TAKLIFI. null — yo'q */
  markupPercent: number | null;
}

export const DEFAULT_PRICING: PricingSettings = { wholesaleEnabled: false, stockEnabled: true, markupPercent: null };

/** `shops.settings` dan. Yo'q yoki noto'g'ri qiymat — default (qoldiq hisobi yoqiq, optom o'chiq, ustama yo'q) */
export function parsePricingSettings(settings: unknown): PricingSettings {
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const pct = s.markup_percent;
  return {
    wholesaleEnabled: s.wholesale_enabled === true,
    stockEnabled: s.stock_enabled === false ? false : true,
    markupPercent: typeof pct === 'number' && isValidMarkupPercent(pct) ? pct : null,
  };
}

/** Mavjud sozlamalarga (boshqa kalitlarni, masalan `units` ni saqlab) o'zgargan qiymatlarni yozadi. Yozilgan shakl DB CHECK ga mos */
export function withPricingSettings(settings: Record<string, unknown> | null | undefined, patch: Partial<PricingSettings>): Record<string, unknown> {
  const next = { ...parsePricingSettings(settings), ...patch };
  return {
    ...(settings ?? {}),
    wholesale_enabled: next.wholesaleEnabled,
    stock_enabled: next.stockEnabled,
    markup_percent: next.markupPercent,
  };
}

/** Ustama maydoni: bo'sh = yo'q (null); aks holda 0..1000 butun son */
export function parseMarkupInput(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const v = raw.trim().replace(/%$/, '').trim();
  if (v === '') return { ok: true, value: null };
  if (!/^\d{1,4}$/.test(v)) return { ok: false, message: `Ustama butun son bo'lishi kerak (0 dan ${MAX_MARKUP_PERCENT} gacha).` };
  const n = Number(v);
  if (!isValidMarkupPercent(n)) return { ok: false, message: `Ustama ${MAX_MARKUP_PERCENT}% dan oshmasin.` };
  return { ok: true, value: n };
}

/** Tan narx sotuv narxidan baland: ogohlantirish (saqlashni to'smaydi), xuddi savdodagi "sotish narxi tan narxdan past" kabi */
export function costAboveSaleWarning(cost: bigint | null, sale: bigint | null): string | null {
  if (cost === null || sale === null || cost <= sale) return null;
  return `Tan narx (${formatSom(cost)}) sotuv narxidan (${formatSom(sale)}) baland: zarar bilan sotiladi. Saqlash mumkin.`;
}

/** Optom narx oddiy sotuv narxidan baland bo'lsa ajablanarli: ogohlantirish (saqlashni to'smaydi) */
export function wholesaleAboveSaleWarning(wholesale: bigint | null, sale: bigint | null): string | null {
  if (wholesale === null || sale === null || wholesale <= sale) return null;
  return `Optom narx (${formatSom(wholesale)}) sotuv narxidan (${formatSom(sale)}) baland. Saqlash mumkin.`;
}

/** Tan narx matnidan ustama bo'yicha sotuv narxi taklifi (kiritish maydoni matni); bo'lmasa null. Faqat TAKLIF */
export function suggestedSaleText(costText: string, markupPercent: number | null): string | null {
  if (markupPercent === null) return null;
  const cost = parseMoneyInput(costText, { allowZero: true });
  if (!cost.ok) return null;
  const s = suggestSalePrice(cost.value, markupPercent);
  return s === null || s <= 0n ? null : formatMoneyInput(s.toString());
}

/**
 * Taklif qachon ko'rsatiladi: tan narx yozilgan, ustama bor va sotuv narxi QO'LDA kiritilmagan (bo'sh).
 * Qo'lda kiritilgan sotuv narxi bor bo'lsa hech qachon taklif qilinmaydi va jimgina o'zgartirilmaydi.
 */
export function markupHint(costText: string, saleText: string, markupPercent: number | null): { text: string; sale: bigint } | null {
  if (saleText.trim() !== '') return null;
  const text = suggestedSaleText(costText, markupPercent);
  if (!text) return null;
  const sale = parseMoneyInput(text);
  return sale.ok ? { text, sale: sale.value } : null;
}

// ---------------------------------------------------------------------------
// Narx tahriri (Ombor qatori): qaysi ustunlar o'zgardi
// ---------------------------------------------------------------------------

export interface PriceForm {
  cost: string;
  sale: string;
  wholesale: string;
  minQty: string;
}

export interface PricePatch {
  cost_price?: bigint | null;
  sale_price?: bigint;
  wholesale_price?: bigint | null;
  wholesale_min_qty_milli?: bigint | null;
}

/**
 * Mavjud tan va sotuv narxini bo'shatib bo'lmaydi (xato); optom juftligini bo'shatish mumkin.
 * Faqat O'ZGARGAN ustunlar yoziladi (boshqa qurilmada kirim tan narxni yangilagan bo'lsa, eski qiymat ustiga yozilmaydi).
 * Optom juftligi (narx + chegara) birga yoziladi: bazadagi CHECK ikkalasi birga NULL yoki birga to'liq bo'lishini talab qiladi.
 * Matnlar oldindan `validateRow` dan o'tgan deb faraz qilinadi; shunda ham noto'g'ri qiymat xato qaytaradi.
 */
export function buildPricePatch(initial: PriceForm, next: PriceForm, parseQty: (raw: string) => { ok: true; value: bigint } | { ok: false; message: string }): { ok: true; patch: PricePatch } | { ok: false; message: string } {
  const patch: PricePatch = {};
  const money = (raw: string, allowZero: boolean): bigint | null | undefined => {
    if (raw.trim() === '') return null;
    const r = parseMoneyInput(raw, { allowZero });
    return r.ok ? r.value : undefined;
  };
  if (initial.cost.trim() !== next.cost.trim()) {
    const v = money(next.cost, true);
    if (v === undefined) return { ok: false, message: "Tan narx noto'g'ri." };
    // Mavjud tan narxni bo'shatish (Ctrl+A, Backspace, Saqlash) ma'lumotni jimgina yo'qotardi va foyda hisobini buzardi
    if (v === null && initial.cost.trim() !== '') return { ok: false, message: "Tan narxni bo'sh qoldirib bo'lmaydi: yangi narx yozing (tan narx kirim orqali ham yangilanadi)." };
    patch.cost_price = v;
  }
  if (initial.sale.trim() !== next.sale.trim()) {
    const v = money(next.sale, false);
    if (v === null) return { ok: false, message: "Sotuv narxini bo'sh qoldirib bo'lmaydi: yangi narx yozing." };
    if (v === undefined) return { ok: false, message: "Sotuv narxi noto'g'ri." };
    patch.sale_price = v;
  }
  if (initial.wholesale.trim() !== next.wholesale.trim() || initial.minQty.trim() !== next.minQty.trim()) {
    const w = money(next.wholesale, false);
    const q = next.minQty.trim() === '' ? null : parseQty(next.minQty);
    if (w === undefined || (q !== null && !q.ok)) return { ok: false, message: "Optom narx yoki miqdor noto'g'ri." };
    if ((w === null) !== (q === null)) return { ok: false, message: "Optom narx va boshlanadigan miqdorni ikkalasini to'ldiring (yoki ikkalasini bo'sh qoldiring)." };
    patch.wholesale_price = w;
    patch.wholesale_min_qty_milli = q === null ? null : q.value;
  }
  return { ok: true, patch };
}

// ---------------------------------------------------------------------------
// Savdo qatorida optom narx
// ---------------------------------------------------------------------------

type Priced = Pick<Product, 'last_price'> & { wholesale_price?: bigint | null; wholesale_min_qty_milli?: bigint | null };

/** Tovarning qator miqdoriga mos birlik narxi (core `resolveUnitPrice`); optom o'chiq bo'lsa har doim sotuv narxi */
export function priceForQty(p: Priced, qtyMilli: bigint, wholesaleEnabled: boolean): bigint | null {
  return resolveUnitPrice({
    salePrice: p.last_price,
    wholesalePrice: wholesaleEnabled ? (p.wholesale_price ?? null) : null,
    wholesaleMinQtyMilli: wholesaleEnabled ? (p.wholesale_min_qty_milli ?? null) : null,
    qtyMilli,
  });
}

/**
 * Savdo qatorlarining narxini tovar va miqdorga moslaydi (optom/dona). FAQAT `autoPrice` qatorlar: narx tovardan o'zi
 * to'lgan va foydalanuvchi uni qo'lda o'zgartirmagan. Qo'lda yozilgan narx, erkin matnli (tanlovsiz) va "Qayta yozish"
 * qatorlari o'zgarmaydi. Miqdor hali noto'g'ri (bo'sh, yozilmoqda) bo'lsa narx o'zgarmaydi. Hisob core `resolveUnitPrice` da.
 * Hech narsa o'zgarmasa AYNAN shu massiv qaytadi (keraksiz qayta chizish yo'q).
 */
export function repriceLines(lines: readonly DraftLine[], products: readonly Product[], wholesaleEnabled: boolean): DraftLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next = lines.map((l) => {
    if (!l.autoPrice || !l.productId) return l;
    const p = byId.get(l.productId);
    const qty = parseQtyInput(l.qty);
    if (!p || !qty.ok) return l;
    const price = priceForQty(p, qty.value, wholesaleEnabled);
    if (price === null) return l;
    const text = formatMoneyInput(price.toString());
    if (text === l.price) return l;
    changed = true;
    return { ...l, price: text };
  });
  return changed ? next : (lines as DraftLine[]);
}

/** Qatorda hozir optom narx amal qilyaptimi ("Optom narx" belgisi): optom yoqiq, narx avtomatik va miqdor chegaraga yetgan */
export function isWholesaleLine(l: DraftLine, products: readonly Product[], wholesaleEnabled: boolean): boolean {
  if (!wholesaleEnabled || !l.autoPrice || !l.productId) return false;
  const p = products.find((x) => x.id === l.productId);
  const qty = parseQtyInput(l.qty);
  if (!p || !qty.ok) return false;
  return isWholesaleApplied({ salePrice: p.last_price, wholesalePrice: p.wholesale_price ?? null, wholesaleMinQtyMilli: p.wholesale_min_qty_milli ?? null, qtyMilli: qty.value });
}

/**
 * "Baza (qoldiq hisobi)" o'chiq bo'lsa qoldiq xaritasi yo'q (null): savdoda "Omborda N bor", "Kam qoldi" va bosh sahifadagi
 * "Tugayotgan tovarlar" hech qayerda chiqmaydi. Yoqiq bo'lsa ma'lumot o'zgarmaydi (o'sha obyekt qaytadi).
 */
export function withStockSetting<T extends { stock: ReadonlyMap<string, bigint> | null }>(data: T, stockEnabled: boolean): T {
  return stockEnabled || data.stock === null ? data : { ...data, stock: null };
}
