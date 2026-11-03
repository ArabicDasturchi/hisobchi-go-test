/**
 * Agent qoralamalari: bazadan kelgan qatorni tekshirish va ko'rsatishga tayyorlash (sof funksiyalar, tarmoqsiz).
 *
 * - `payload` jsonb tashqaridan (MCP orqali AI) shakllangan, shuning uchun qat'iy zod bilan tekshiriladi.
 *   Buzilgan qator ilovani yiqitmaydi: `unreadable` bo'ladi va tasdiqlab bo'lmaydi.
 * - Jami core formulasi bilan qayta hisoblanadi (hisob faqat core'da). Mos kelmasa `integrityError` qaytadi
 *   va "Tasdiqlash" yopiladi (qoida 2). Server tasdiq paytida baribir ikkinchi marta hisoblaydi.
 */
import { z } from 'zod';
import { toBig, documentTotal } from '../money';
import { PAYMENT_METHODS, type AgentDraft, type AgentDraftDetail, type AgentDraftLine, type PaymentMethod } from './types';

const intText = z.union([z.string().regex(/^\d{1,18}$/), z.number().int().nonnegative().safe()]);

const lineSchema = z.object({
  product_name: z.string().min(1).max(200),
  qty_milli: intText,
  unit: z.string().min(1).max(20),
  unit_price: intText,
  line_total: intText,
  raw_text: z.string().nullable().optional(),
  warnings: z.array(z.string()).max(10).optional(),
});

const salePayload = z.object({
  raw_input: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1).max(200),
});

const paymentPayload = z.object({
  method: z.enum(PAYMENT_METHODS as unknown as [PaymentMethod, ...PaymentMethod[]]),
  note: z.string().nullable().optional(),
});

const uuid = z.string().uuid();
const textChange = z.object({ from: z.string(), to: z.string().min(1).max(120) });
const priceValue = z.union([z.null(), z.number().int().nonnegative().safe()]);
const customerUpdatePayload = z.object({ target_id: uuid, target_name: z.string(), changes: z.object({ name: textChange }) });
const productUpdatePayload = z.object({
  target_id: uuid,
  target_name: z.string(),
  changes: z
    .object({
      name: textChange.optional(),
      unit: z.object({ from: z.string(), to: z.string().min(1).max(20) }).optional(),
      price: z.object({ from: priceValue, to: priceValue }).optional(),
    })
    .refine((c) => c.name !== undefined || c.unit !== undefined || c.price !== undefined, 'bo\'sh'),
});
const customerArchivePayload = z.object({ target_id: uuid, target_name: z.string(), outstanding: z.union([z.null(), z.number().int().safe()]).optional() });
const productArchivePayload = z.object({ target_id: uuid, target_name: z.string() });

/** Katalog (mijoz/tovar) bo'yicha tasdiqlash so'rovlari: pul va qarzga tegmaydi, jami 0 */
export const CATALOG_KINDS = ['customer_update', 'product_update', 'customer_archive', 'product_archive'] as const;
export const isCatalogDraft = (d: AgentDraft): boolean => (CATALOG_KINDS as readonly string[]).includes(d.detail.kind);

export interface AgentDraftRow {
  id: string;
  kind: string;
  status: string;
  customer_id: string | null;
  total: string;
  payload: unknown;
  client_id: string;
  created_by: string;
  created_at: string;
  decided_at: string | null;
  reject_reason: string | null;
}

/** Ustunlar ro'yxati: bigint "::text" bilan (aniqlik yo'qolmasin) */
export const AGENT_DRAFT_COLS =
  'id, kind, status, customer_id, total::text, payload, client_id, created_by, created_at, decided_at, reject_reason';

export function parseDetail(kind: string, payload: unknown): AgentDraftDetail {
  if (kind === 'sale') {
    const p = salePayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "Savdo qatorlari o'qib bo'lmadi" };
    const lines: AgentDraftLine[] = p.data.lines.map((l) => ({
      product_name: l.product_name,
      qty_milli: toBig(l.qty_milli),
      unit: l.unit,
      unit_price: toBig(l.unit_price),
      line_total: toBig(l.line_total),
      raw_text: l.raw_text ?? null,
      warnings: l.warnings ?? [],
    }));
    return { kind: 'sale', raw_input: p.data.raw_input ?? null, lines };
  }
  if (kind === 'payment') {
    const p = paymentPayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "To'lov ma'lumoti o'qib bo'lmadi" };
    return { kind: 'payment', method: p.data.method, note: p.data.note ?? null };
  }
  if (kind === 'customer_update') {
    const p = customerUpdatePayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "Mijoz o'zgartirish so'rovi o'qib bo'lmadi" };
    return { kind, target_id: p.data.target_id, target_name: p.data.target_name, name: p.data.changes.name };
  }
  if (kind === 'product_update') {
    const p = productUpdatePayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "Tovar o'zgartirish so'rovi o'qib bo'lmadi" };
    const c = p.data.changes;
    return {
      kind,
      target_id: p.data.target_id,
      target_name: p.data.target_name,
      name: c.name ?? null,
      unit: c.unit ?? null,
      price: c.price ? { from: c.price.from === null ? null : toBig(c.price.from), to: c.price.to === null ? null : toBig(c.price.to) } : null,
    };
  }
  if (kind === 'customer_archive') {
    const p = customerArchivePayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "Mijozni arxivlash so'rovi o'qib bo'lmadi" };
    return { kind, target_id: p.data.target_id, target_name: p.data.target_name, outstanding: p.data.outstanding === undefined || p.data.outstanding === null ? null : toBig(p.data.outstanding) };
  }
  if (kind === 'product_archive') {
    const p = productArchivePayload.safeParse(payload);
    if (!p.success) return { kind: 'unreadable', reason: "Tovarni arxivlash so'rovi o'qib bo'lmadi" };
    return { kind, target_id: p.data.target_id, target_name: p.data.target_name };
  }
  return { kind: 'unreadable', reason: "Noma'lum qoralama turi" };
}

export function toAgentDraft(r: AgentDraftRow): AgentDraft {
  const status = r.status === 'accepted' || r.status === 'rejected' ? r.status : 'draft';
  return {
    id: r.id,
    status,
    customer_id: r.customer_id,
    total: toBig(r.total),
    client_id: r.client_id,
    created_by: r.created_by,
    created_at: r.created_at,
    decided_at: r.decided_at,
    reject_reason: r.reject_reason,
    detail: parseDetail(r.kind, r.payload),
  };
}

/**
 * Qoralama yaxlitligi: har qator summasi va jami core formulasi bilan mos kelishi kerak.
 * `null` — hammasi joyida; aks holda foydalanuvchiga ko'rsatiladigan sabab.
 */
export function integrityError(d: AgentDraft): string | null {
  if (d.detail.kind === 'unreadable') return d.detail.reason;
  if (d.detail.kind === 'payment') return d.total > 0n ? null : "To'lov summasi noto'g'ri";
  // Katalog so'rovlari pulga tegmaydi: jami 0 bo'lishi shart (aks holda payload shubhali)
  if (d.detail.kind !== 'sale') return d.total === 0n ? null : "Katalog so'rovida summa bo'lmasligi kerak";
  for (const [i, l] of d.detail.lines.entries()) {
    if (documentTotal([{ qtyMilli: l.qty_milli, unitPrice: l.unit_price }]) !== l.line_total) {
      return `${i + 1}-qator summasi mos kelmadi`;
    }
  }
  const sum = documentTotal(d.detail.lines.map((l) => ({ qtyMilli: l.qty_milli, unitPrice: l.unit_price })));
  return sum === d.total ? null : 'Qoralama jami qatorlar yig\'indisiga mos kelmadi';
}

/** Kartochka sarlavhasi */
export function draftTitle(d: AgentDraft): string {
  switch (d.detail.kind) {
    case 'sale':
      return 'Savdo qoralamasi';
    case 'payment':
      return "To'lov qoralamasi";
    case 'customer_update':
      return "Mijoz nomini o'zgartirish";
    case 'product_update':
      return "Tovarni o'zgartirish";
    case 'customer_archive':
      return 'Mijozni arxivlash';
    case 'product_archive':
      return 'Tovarni arxivlash';
    default:
      return 'Qoralama';
  }
}

/** Qatorlardagi ogohlantirishlar soni (sariq belgi uchun) */
export function warningCount(d: AgentDraft): number {
  return d.detail.kind === 'sale' ? d.detail.lines.filter((l) => l.warnings.length > 0).length : 0;
}

/** "Kim yaratgan": OAuth klient nomi (listGrants), topilmasa qisqa ID */
export function clientLabel(clientId: string, names: ReadonlyMap<string, string>): string {
  if (clientId === 'first_party') return 'Hisobchi Go ilovasi';
  return names.get(clientId) ?? `Agent ${clientId.slice(0, 8)}`;
}
