/**
 * "Qayta yozish": savdo bekor qilingach (teskari yozuv) shu qatorlar bilan yangi savdo panelda oldindan to'ldirib ochiladi.
 * Ikki qadam alohida tasdiqlanadi: bekor qilish (Savdolar sahifasida, sabab bilan) va yangi savdo (panelda, odatdagi tasdiq).
 * Qatorlar sessionStorage orqali uzatiladi (URL'ga yozilmaydi). Hech narsa saqlanmaydi: panel oddiy qoralama qatorlarini ochadi.
 */
import type { SaleLine, Unit } from './data/types';
import { formatMoneyInput } from './money';
import { qtyToInput } from './productPicker';
import type { DraftLine } from './saleForm';

export const RESALE_KEY = 'hg:resale';

export interface ResaleDraft {
  customerId: string | null;
  /** Bekor qilingan savdo raqami (banner uchun) */
  number: string;
  lines: { productName: string; qty: string; unit: string; price: string }[];
}

export function toResaleDraft(customerId: string | null, number: string, lines: readonly Pick<SaleLine, 'product_name' | 'qty_milli' | 'unit' | 'unit_price'>[]): ResaleDraft {
  return {
    customerId,
    number,
    lines: lines.map((l) => ({ productName: l.product_name, qty: qtyToInput(l.qty_milli), unit: l.unit, price: formatMoneyInput(l.unit_price.toString()) })),
  };
}

/** sessionStorage matnidan o'qish: noto'g'ri shakl rad etiladi (null) */
export function parseResale(raw: string | null): ResaleDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ResaleDraft>;
    if (!v || typeof v.number !== 'string' || !Array.isArray(v.lines) || v.lines.length === 0 || v.lines.length > 200) return null;
    const lines = v.lines.map((l) => ({ productName: String(l?.productName ?? ''), qty: String(l?.qty ?? ''), unit: String(l?.unit ?? 'dona'), price: String(l?.price ?? '') }));
    if (lines.some((l) => !l.productName.trim())) return null;
    return { customerId: typeof v.customerId === 'string' ? v.customerId : null, number: v.number, lines };
  } catch {
    return null;
  }
}

export function resaleLines(d: ResaleDraft, makeKey: () => string = () => crypto.randomUUID()): DraftLine[] {
  return d.lines.map((l) => ({ key: makeKey(), productName: l.productName, qty: l.qty, unit: l.unit as Unit, price: l.price }));
}
