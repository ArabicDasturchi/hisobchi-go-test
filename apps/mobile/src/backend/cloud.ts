/**
 * Bulut (Supabase) bilan ishlashning tiplangan chegarasi.
 * Ekranlar va sinxronlash faqat shu interfeysdan foydalanadi — Supabase so'rovlari UI bo'ylab tarqalmaydi,
 * testlarda esa soxta (fake) klient bilan almashtiriladi.
 */

export interface CloudErrorShape {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface CloudResult<T> {
  data: T | null;
  error: CloudErrorShape | null;
}

export interface CloudClient {
  rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<CloudResult<T>>;
  /** id bo'yicha upsert (mijoz, mahsulot) — RLS shop_id'ni tekshiradi */
  upsert(table: 'customers' | 'products' | 'suppliers', rows: Record<string, unknown>[]): Promise<CloudResult<unknown>>;
  /**
   * Shu do'konning barcha qatorlari (RLS ham cheklaydi). `columns` — PostgREST select ro'yxati;
   * bigint ustunlar `col::text` bilan o'qiladi (JSON number aniqligini yo'qotmaslik uchun).
   */
  selectAll<T>(table: CloudTable, columns: string, shopId: string, filter?: { column: string; value: string }): Promise<CloudResult<T[]>>;
}

export type CloudTable =
  | 'customers'
  | 'products'
  | 'documents'
  | 'document_lines'
  | 'document_reversals'
  | 'payments'
  | 'payment_voids'
  | 'suppliers'
  | 'purchase_documents'
  | 'purchase_lines'
  | 'purchase_reversals'
  | 'supplier_payments'
  | 'supplier_payment_voids';

export type CloudErrorKind = 'network' | 'auth' | 'forbidden' | 'conflict' | 'validation' | 'unknown';

export class CloudError extends Error {
  constructor(
    public readonly kind: CloudErrorKind,
    message: string,
    public readonly raw?: string,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

/** Server/tarmoq xatosini foydalanuvchiga tushunarli o'zbekcha xabarga aylantiradi */
export function toCloudError(err: unknown): CloudError {
  if (err instanceof CloudError) return err;
  const shape = (err && typeof err === 'object' ? err : { message: String(err) }) as CloudErrorShape;
  const raw = `${shape.code ?? ''} ${shape.message ?? ''} ${shape.details ?? ''}`.trim();
  const m = raw.toLowerCase();
  if (/network request failed|failed to fetch|fetch failed|timeout|econn|offline/.test(m)) {
    return new CloudError('network', "Internet aloqasi yo'q yoki server javob bermadi. Keyinroq qayta urinib ko'ring.", raw);
  }
  if (/not_authenticated|jwt|invalid login|28000|invalid_grant|refresh token/.test(m)) {
    return new CloudError('auth', 'Hisobga kirish talab qilinadi yoki sessiya tugagan. Qaytadan kiring.', raw);
  }
  if (/forbidden|42501|permission denied|row-level security|customer_not_in_shop/.test(m)) {
    return new CloudError('forbidden', "Bu amal uchun ruxsat yo'q (boshqa do'kon ma'lumoti).", raw);
  }
  if (/id_conflict|23505|duplicate key|already_reversed/.test(m)) {
    return new CloudError('conflict', "Bu yozuv serverda boshqa ma'lumot bilan band yoki allaqachon bajarilgan.", raw);
  }
  if (/calc_mismatch/.test(m)) {
    return new CloudError('validation', "Server hisobi telefondagi summa bilan mos kelmadi — savdo yuborilmadi.", raw);
  }
  if (/walkin_requires_full_payment/.test(m)) {
    return new CloudError('validation', "Serverda bir martalik savdo to'liq to'lanmagan deb topildi — savdo yuborilmadi.", raw);
  }
  if (/payment_exceeds_debt/.test(m)) {
    return new CloudError('validation', "Serverda to'lov qarzdan katta chiqdi — to'lov yuborilmadi.", raw);
  }
  if (/invalid_|empty_document|reason_required|22023|23514/.test(m)) {
    return new CloudError('validation', "Server ma'lumotni rad etdi (noto'g'ri qiymat).", raw);
  }
  return new CloudError('unknown', `Server xatosi: ${shape.message ?? raw}`, raw);
}

/** CloudResult'dan ma'lumotni oladi yoki CloudError tashlaydi */
export async function unwrap<T>(p: Promise<CloudResult<T>>): Promise<T | null> {
  let res: CloudResult<T>;
  try {
    res = await p;
  } catch (e) {
    throw toCloudError(e);
  }
  if (res.error) throw toCloudError(res.error);
  return res.data;
}
