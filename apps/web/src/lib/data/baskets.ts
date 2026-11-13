/**
 * Savat (F2, migratsiya 015) — server qatlami. Savat pul yozuvi EMAS: tasdiqlanmagan ish holati. Jurnalga faqat
 * odatdagi `post_sale` / `post_purchase` yozadi, shundan keyin savat `done` bo'ladi (`closeBasket`).
 *
 * 015 hali qo'llanmagan server yoki demo rejim (yozish o'chirilgan): `isBasketServerUnavailable` → web savatni shu
 * qurilmada (localStorage) saqlaydi (`basketStore.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, isRpcMissing, toAppError } from '../errors';

type SB = SupabaseClient;

export type BasketKind = 'sale' | 'purchase';
export type BasketStatus = 'open' | 'done' | 'discarded';

export interface BasketRow {
  id: string;
  kind: BasketKind;
  status: BasketStatus;
  customer_id: string | null;
  supplier_id: string | null;
  lines: unknown;
  version: number;
  updated_at: string;
  source_draft_id: string | null;
}

const COLS = 'id, kind, status, customer_id, supplier_id, lines, version, updated_at, source_draft_id';

/** Boshqa qurilma savatni o'zgartirgan: `serverVersion` — serverdagi versiya (ma'lum bo'lsa) */
export class BasketConflictError extends AppError {
  constructor(public readonly serverVersion: number | null) {
    super('conflict', toAppError({ message: 'version_conflict' }).message);
    this.name = 'BasketConflictError';
  }
}

type PgErr = { code?: string; message?: string; details?: string | null };

/** Server savatni qo'llab-quvvatlamaydi: 015 qo'llanmagan (jadval/RPC yo'q) yoki demo (yozish o'chirilgan) */
export function isBasketServerUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as PgErr;
  const msg = (e.message ?? '').toLowerCase();
  if (isRpcMissing(err)) return true;
  // 42703 (ustun yo'q) bu yerda EMAS: sxema mos kelmasa xato ko'rsatilsin, jim mahalliy rejimga o'tilmasin
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'DEMO') return true;
  return /demo_read_only|relation .*baskets.* does not exist|could not find the table/.test(msg);
}

function raise(err: PgErr): never {
  if (/version_conflict/.test(err.message ?? '')) {
    const v = Number.parseInt(err.details ?? '', 10);
    throw new BasketConflictError(Number.isFinite(v) ? v : null);
  }
  throw err;
}

export async function listOpenBaskets(sb: SB, shopId: string): Promise<BasketRow[]> {
  const { data, error } = await sb.from('baskets').select(COLS).eq('shop_id', shopId).eq('status', 'open').order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as BasketRow[];
}

export async function getBasket(sb: SB, shopId: string, basketId: string): Promise<BasketRow | null> {
  const { data, error } = await sb.from('baskets').select(COLS).eq('shop_id', shopId).eq('id', basketId).maybeSingle();
  if (error) throw error;
  return (data as BasketRow | null) ?? null;
}

export interface SaveBasketArgs {
  shopId: string;
  basketId: string;
  kind: BasketKind;
  partnerId: string | null;
  lines: unknown[];
  /** Yangi savat: null; mavjud: klient ko'rgan versiya */
  expectedVersion: number | null;
  clientOpId: string;
}

export async function saveBasket(sb: SB, a: SaveBasketArgs): Promise<{ id: string; version: number }> {
  const { data, error } = await sb.rpc('basket_save', {
    p_shop_id: a.shopId,
    p_basket_id: a.basketId,
    p_kind: a.kind,
    p_partner_id: a.partnerId,
    p_lines: a.lines,
    p_expected_version: a.expectedVersion,
    p_client_op_id: a.clientOpId,
  });
  if (error) raise(error as PgErr);
  const row = (Array.isArray(data) ? data[0] : data) as { basket_id?: string; version?: number } | null;
  if (!row?.basket_id || typeof row.version !== 'number') throw new AppError('unknown', 'Server savat holatini qaytarmadi.');
  return { id: row.basket_id, version: row.version };
}

export async function closeBasket(sb: SB, a: { shopId: string; basketId: string; status: 'done' | 'discarded'; documentId?: string | null; expectedVersion?: number | null }): Promise<void> {
  const { error } = await sb.rpc('basket_close', {
    p_shop_id: a.shopId,
    p_basket_id: a.basketId,
    p_status: a.status,
    p_document_id: a.documentId ?? null,
    p_expected_version: a.expectedVersion ?? null,
  });
  if (error) raise(error as PgErr);
}

/** B3: AI qoralamasini savatga olish (bitta tranzaksiya: savat yaratiladi, qoralama `converted`) */
export async function draftToBasket(sb: SB, a: { shopId: string; draftId: string; basketId: string; lines: unknown[] }): Promise<string> {
  const { data, error } = await sb.rpc('agent_draft_to_basket', { p_shop_id: a.shopId, p_draft_id: a.draftId, p_basket_id: a.basketId, p_lines: a.lines });
  if (error) raise(error as PgErr);
  return (data as string | null) ?? a.basketId;
}
