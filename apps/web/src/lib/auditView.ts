/**
 * F3: o'zgarishlar tarixi (audit_log, migratsiya 017) — o'qish va savdogarga tushunarli matn (UI'siz, testlanadi).
 * Yozuvni faqat server trigger'lari qo'shadi; web faqat o'qiydi (RLS: o'z do'koni). Telefon/izoh qiymati jurnalda yo'q.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatQty, formatSom, toBig } from './money';

export interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function listAudit(sb: SupabaseClient, shopId: string, limit = 100): Promise<AuditRow[]> {
  const { data, error } = await sb.from('audit_log').select('id, user_id, action, entity_type, entity_id, details, created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

const FIELD: Record<string, string> = {
  name: 'nomi',
  unit: 'birligi',
  last_price: 'narxi',
  cost_price: 'tan narxi',
  is_active: 'holati',
  kind: 'turi',
  phone: 'telefoni',
  notes: 'izohi',
};

const money = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  try {
    return formatSom(toBig(v as string | number)).replace(/[\u00a0\u202f\u2009]/g, ' ');
  } catch {
    return null;
  }
};

function show(field: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (field === 'last_price' || field === 'cost_price') return money(v) ?? String(v);
  if (field === 'is_active') return v === true ? 'faol' : 'arxivda';
  return String(v);
}

/** {maydon: {from, to}} → "narxi: 13 000 so'm → 14 000 so'm; telefoni o'zgardi" */
export function describeChanges(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return '';
  return Object.entries(changes as Record<string, { from?: unknown; to?: unknown; changed?: boolean }>)
    .map(([f, c]) => (c?.changed ? `${FIELD[f] ?? f} o'zgardi` : `${FIELD[f] ?? f}: ${show(f, c?.from)} → ${show(f, c?.to)}`))
    .join('; ');
}

const ENTITY: Record<string, string> = { product: 'Tovar', customer: 'Mijoz', supplier: "Ta'minotchi" };

/** Bitta yozuv: sarlavha va tafsilot (sabab, summa, o'zgarishlar) */
export function describeAudit(r: Pick<AuditRow, 'action' | 'entity_type' | 'details'>): { title: string; detail: string } {
  const d = (r.details ?? {}) as Record<string, unknown>;
  const name = typeof d.name === 'string' ? `«${d.name}»` : '';
  const reason = typeof d.reason === 'string' && d.reason ? `Sabab: ${d.reason}` : '';
  const amount = money(d.amount);
  const join = (...xs: (string | null | false)[]) => xs.filter(Boolean).join('. ');
  const m = /^(product|customer|supplier)_(created|updated)$/.exec(r.action);
  if (m) {
    const ent = ENTITY[m[1]!]!;
    return m[2] === 'created' ? { title: `${ent} qo'shildi ${name}`.trim(), detail: '' } : { title: `${ent} tuzatildi ${name}`.trim(), detail: describeChanges(d.changes) };
  }
  switch (r.action) {
    case 'sale_reversed':
      return { title: 'Savdo bekor qilindi', detail: join(amount && `Summa: ${amount}`, reason) };
    case 'payment_voided':
      return { title: "Mijoz to'lovi bekor qilindi", detail: join(amount && `Summa: ${amount}`, reason) };
    case 'purchase_reversed':
      return { title: 'Kirim bekor qilindi', detail: join(amount && `Summa: ${amount}`, reason) };
    case 'supplier_payment_voided':
      return { title: "Ta'minotchiga to'lov bekor qilindi", detail: join(amount && `Summa: ${amount}`, reason) };
    case 'stock_adjusted': {
      const q = d.qty_milli !== undefined && d.qty_milli !== null ? toBig(d.qty_milli as string | number) : null;
      return { title: 'Ombor qoldig\'i tuzatildi', detail: join(q !== null && `Farq: ${q > 0n ? '+' : ''}${formatQty(q)}`, reason) };
    }
    case 'draft_accepted':
      return { title: 'AI qoralamasi tasdiqlandi', detail: join(money(d.total) && `Summa: ${money(d.total)}`) };
    case 'draft_rejected':
      return { title: 'AI qoralamasi rad etildi', detail: reason };
    case 'draft_converted':
      return { title: 'AI qoralamasi savatga olindi', detail: '' };
    case 'basket_done':
      return { title: 'Savat tasdiqlandi', detail: typeof d.lines === 'number' ? `${d.lines} ta qator` : '' };
    case 'basket_discarded':
      return { title: 'Savat tashlandi', detail: typeof d.lines === 'number' ? `${d.lines} ta qator` : '' };
    default:
      return { title: r.action, detail: '' };
  }
}
