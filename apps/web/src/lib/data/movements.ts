/**
 * Ombor harakatlari (stock_movements, 006) — faqat o'qish: Chiqim ko'rinishi uchun. Qo'shiladigan jadval:
 * yozuvlar savdo/kirim/tuzatish RPC'lari orqali tushadi, veb to'g'ridan-to'g'ri yozmaydi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { toBig } from '../money';
import { fetchAll } from './api';

export type MovementKind = 'purchase' | 'sale' | 'adjustment' | 'purchase_reversal' | 'sale_reversal';

export interface StockMovementRow {
  id: string;
  product_id: string;
  kind: MovementKind;
  /** + kirim/qaytarilgan savdo, − savdo/bekor qilingan kirim/kamaytirgan tuzatish. 1000 = 1 birlik */
  qty_milli: bigint;
  document_id: string | null;
  note: string | null;
  created_at: string;
}

interface Raw {
  id: string;
  product_id: string;
  kind: MovementKind;
  qty_milli: string;
  document_id: string | null;
  note: string | null;
  created_at: string;
}

/** Chiqim ko'rinishi: savdo, savdo bekor qilinishi va tuzatishlar (kirim harakatlari bu yerda emas) */
export const OUTFLOW_KINDS: readonly MovementKind[] = ['sale', 'sale_reversal', 'adjustment'];

export async function loadOutflowMovements(sb: SupabaseClient, shopId: string): Promise<StockMovementRow[]> {
  const rows = await fetchAll<Raw>((from, to) =>
    sb
      .from('stock_movements')
      .select('id, product_id, kind, qty_milli::text, document_id, note, created_at')
      .eq('shop_id', shopId)
      .in('kind', [...OUTFLOW_KINDS])
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to) as never,
  );
  return rows.map((r) => ({ ...r, qty_milli: toBig(r.qty_milli) }));
}
