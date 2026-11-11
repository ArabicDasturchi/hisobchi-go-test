/**
 * Supabase bilan ishlashning yagona qatlami. Sahifalar to'g'ridan-to'g'ri jadval/RPC nomlarini bilmaydi.
 *
 * - Barcha so'rovlar foydalanuvchi sessiyasi bilan, RLS ostida (service-role yo'q).
 * - Har bir so'rov shop_id bilan cheklanadi (RLS ga qo'shimcha, aniq filtr).
 * - Moliyaviy yozuvlar faqat 003 migratsiyasidagi RPC'lar orqali: post_sale, reverse_sale,
 *   record_payment, void_payment. DELETE/UPDATE ishlatilmaydi.
 * - bigint ustunlar "::text" bilan o'qiladi va BigInt'ga o'giriladi (aniqlik yo'qolmaydi).
 * - RPC muvaffaqiyatidan keyin natija serverdan qayta o'qib tekshiriladi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, isDraftAlreadyDecided, isRpcMissing, RpcMissingError, toAppError } from '../errors';
import { toBig } from '../money';
import { AGENT_DRAFT_COLS, toAgentDraft, type AgentDraftRow } from './agentDrafts';
import type {
  AgentDraft,
  AgentDraftStatus,
  Customer,
  Membership,
  Payment,
  PaymentMethod,
  PaymentVoid,
  Product,
  Reversal,
  SaleLineCost,
  Role,
  SaleDetail,
  SaleDoc,
  SaleLine,
  Unit,
} from './types';

type SB = SupabaseClient;
type Res<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

const PAGE = 1000;

/**
 * PostgREST bitta javobda server `max_rows` dan ko'p qator qaytarmaydi (Supabase standarti 1000, kamroq ham
 * sozlanishi mumkin). Shuning uchun "so'ralgandan kam keldi — tugadi" deb hisoblanmaydi: bo'sh sahifa kelguncha
 * qaytarilgan qator soni bo'yicha davom etiladi. Barqaror tartib uchun so'rovlar id bo'yicha ham saralangan.
 */
export async function fetchAll<T>(query: (from: number, to: number) => Res<T>, pageSize: number = PAGE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw toAppError(error);
    const rows = data ?? [];
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
  }
}

function check<T>(res: { data: T | null; error: unknown }): T | null {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Do'kon
// ---------------------------------------------------------------------------

interface MembershipRow {
  role: Role;
  user_id: string;
  created_at: string;
  shop: { id: string; name: string; created_at: string; settings?: Record<string, unknown> } | null;
}

export async function getMembership(sb: SB, userId: string): Promise<Membership | null> {
  // `settings` ustuni 010 migratsiyasidan: yo'q bo'lsa (42703) usiz qayta so'raladi, ilova avvalgidek ishlaydi
  let res: { data: unknown; error: unknown } = await sb.from('shop_members').select('role, user_id, created_at, shop:shops(id, name, created_at, settings)').eq('user_id', userId).order('created_at');
  if (res.error && (res.error as { code?: string }).code === '42703') {
    res = await sb.from('shop_members').select('role, user_id, created_at, shop:shops(id, name, created_at)').eq('user_id', userId).order('created_at');
  }
  const rows = check(res) as unknown as MembershipRow[] | null;
  const list = (rows ?? []).filter((r) => r.shop);
  const pick = list.find((r) => r.role === 'owner') ?? list[0];
  if (!pick?.shop) return null;
  return { shop: pick.shop, role: pick.role, user_id: pick.user_id };
}

/** create_shop(p_name) → uuid. Server idempotent: egasi bo'lgan do'kon bo'lsa — o'shani qaytaradi */
export async function createShop(sb: SB, name: string): Promise<string> {
  const res = await sb.rpc('create_shop', { p_name: name.trim() });
  const id = check(res) as string | null;
  if (!id) throw new AppError('unknown', "Server do'kon identifikatorini qaytarmadi.");
  return id;
}

/** Yoqilgan birliklarni saqlaydi (faqat egasi: RLS). Boshqa sozlama kalitlari saqlanadi. Ustun yo'q (010) bo'lsa tushunarli xato */
export async function saveShopSettings(sb: SB, shopId: string, settings: Record<string, unknown>): Promise<void> {
  const res = await sb.from('shops').update({ settings }).eq('id', shopId).select('id');
  if (res.error && (res.error as { code?: string }).code === '42703') {
    throw new AppError('unknown', "Sozlamalar uchun serverdagi yangilanish (010 migratsiya) hali qo'llanmagan. Administratorga ayting.");
  }
  const rows = check(res) as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new AppError('forbidden', "Sozlamalarni faqat do'kon egasi o'zgartira oladi.");
}

export async function renameShop(sb: SB, shopId: string, name: string): Promise<void> {
  const rows = check(await sb.from('shops').update({ name: name.trim() }).eq('id', shopId).select('id')) as { id: string }[] | null;
  // RLS faqat egaga ruxsat beradi; ruxsat bo'lmasa xato emas, 0 qator qaytadi
  if (!rows || rows.length === 0) throw new AppError('forbidden', "Do'kon nomini faqat egasi o'zgartira oladi.");
}

// ---------------------------------------------------------------------------
// Mijozlar
// ---------------------------------------------------------------------------

const CUSTOMER_COLS = 'id, name, phone, notes, is_active, source, created_at, updated_at';

/**
 * `kind` ustuni 006 migratsiyasi bilan keladi. U qo'llanmagan bo'lsa (ustun yo'q) ilova avvalgidek ishlashi kerak:
 * avval ustunni sinab ko'ramiz, yo'q bo'lsa eski ro'yxat bilan davom etamiz.
 */
export async function hasCustomerKind(sb: SB, shopId: string): Promise<boolean> {
  const { error } = await sb.from('customers').select('kind').eq('shop_id', shopId).limit(1);
  if (!error) return true;
  const e = error as { code?: string; message?: string };
  if (e.code === '42703' || /column .*kind.* does not exist|kind.*does not exist/i.test(e.message ?? '')) return false;
  throw toAppError(error);
}

export async function listCustomers(sb: SB, shopId: string): Promise<Customer[]> {
  const cols: string = (await hasCustomerKind(sb, shopId)) ? `${CUSTOMER_COLS}, kind` : CUSTOMER_COLS;
  return fetchAll<Customer>((from, to) => sb.from('customers').select(cols).eq('shop_id', shopId).order('name').order('id').range(from, to) as unknown as Res<Customer>);
}

export interface CustomerInput {
  name: string;
  phone: string | null;
  notes: string | null;
}

export async function createCustomer(sb: SB, shopId: string, input: CustomerInput): Promise<Customer> {
  const row = check(
    await sb.from('customers').insert({ id: newId(), shop_id: shopId, ...input }).select(CUSTOMER_COLS).single(),
  ) as Customer | null;
  if (!row) throw new AppError('unknown', 'Mijoz saqlanmadi.');
  return row;
}

export async function updateCustomer(sb: SB, shopId: string, id: string, input: CustomerInput): Promise<Customer> {
  const rows = check(await sb.from('customers').update(input).eq('id', id).eq('shop_id', shopId).select(CUSTOMER_COLS)) as Customer[] | null;
  const row = rows?.[0];
  if (!row) throw new AppError('not_found', 'Mijoz topilmadi yoki ruxsat yo\'q.');
  return row;
}

/** Faqat savdo va to'lov tarixi bo'lmagan mijozni o'chirish (moliyaviy tarix saqlanadi) */
export async function deleteCustomer(sb: SB, shopId: string, id: string): Promise<void> {
  const [docs, pays] = await Promise.all([
    sb.from('documents').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('customer_id', id),
    sb.from('payments').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('customer_id', id),
  ]);
  if (docs.error) throw toAppError(docs.error);
  if (pays.error) throw toAppError(pays.error);
  if ((docs.count ?? 0) > 0 || (pays.count ?? 0) > 0) {
    throw new AppError('conflict', "Mijozning savdo yoki to'lov tarixi bor — o'chirib bo'lmaydi. Tarix hisobotlarda saqlanadi.");
  }
  const rows = check(await sb.from('customers').delete().eq('id', id).eq('shop_id', shopId).select('id')) as { id: string }[] | null;
  if (!rows || rows.length === 0) throw new AppError('not_found', "Mijoz topilmadi yoki ruxsat yo'q.");
}

// ---------------------------------------------------------------------------
// Mahsulotlar
// ---------------------------------------------------------------------------

const PRODUCT_COLS = 'id, name, unit, last_price::text, is_active, source, created_at, updated_at';

interface ProductRow extends Omit<Product, 'last_price' | 'cost_price'> {
  last_price: string | null;
  cost_price?: string | null;
}

const toProduct = (r: ProductRow): Product => ({
  ...r,
  last_price: r.last_price === null ? null : toBig(r.last_price),
  cost_price: r.cost_price === undefined ? undefined : r.cost_price === null ? null : toBig(r.cost_price),
});

/** Ustun bazada bormi (migratsiya qo'llanmagan bo'lsa ilova avvalgidek ishlashi kerak) */
export async function hasColumn(sb: SB, table: string, column: string, shopId: string): Promise<boolean> {
  const { error } = await sb.from(table).select(column).eq('shop_id', shopId).limit(1);
  if (!error) return true;
  const e = error as { code?: string; message?: string };
  if (e.code === '42703' || e.code === '42P01' || new RegExp(`${column}.*does not exist`, 'i').test(e.message ?? '')) return false;
  throw toAppError(error);
}

export async function listProducts(sb: SB, shopId: string): Promise<Product[]> {
  const cols = (await hasColumn(sb, 'products', 'cost_price', shopId)) ? `${PRODUCT_COLS}, cost_price::text` : PRODUCT_COLS;
  const rows = await fetchAll<ProductRow>((from, to) =>
    sb.from('products').select(cols).eq('shop_id', shopId).order('name').order('id').range(from, to) as unknown as Res<ProductRow>,
  );
  return rows.map(toProduct);
}

export interface ProductInput {
  name: string;
  unit: Unit;
  last_price: bigint | null;
  is_active: boolean;
}

const productPayload = (p: ProductInput) => ({
  name: p.name,
  unit: p.unit,
  // bigint JSON number'ga sig'masligi mumkin — string sifatida yuboriladi (mobil sync bilan bir xil)
  last_price: p.last_price === null ? null : p.last_price.toString(),
  is_active: p.is_active,
});

export async function createProduct(sb: SB, shopId: string, input: ProductInput): Promise<Product> {
  const row = check(
    await sb.from('products').insert({ id: newId(), shop_id: shopId, ...productPayload(input) }).select(PRODUCT_COLS).single(),
  ) as unknown as ProductRow | null;
  if (!row) throw new AppError('unknown', 'Mahsulot saqlanmadi.');
  return toProduct(row);
}

export async function updateProduct(sb: SB, shopId: string, id: string, input: ProductInput): Promise<Product> {
  const rows = check(
    await sb.from('products').update(productPayload(input)).eq('id', id).eq('shop_id', shopId).select(PRODUCT_COLS),
  ) as unknown as ProductRow[] | null;
  const row = rows?.[0];
  if (!row) throw new AppError('not_found', "Mahsulot topilmadi yoki ruxsat yo'q.");
  return toProduct(row);
}

// ---------------------------------------------------------------------------
// Savdolar
// ---------------------------------------------------------------------------

const DOC_COLS = 'id, customer_id, status, subtotal::text, created_at, posted_at, created_by, client_op_id';

interface DocRow extends Omit<SaleDoc, 'subtotal'> {
  subtotal: string;
}

const toDoc = (r: DocRow): SaleDoc => ({ ...r, subtotal: toBig(r.subtotal) });

export async function listSales(sb: SB, shopId: string): Promise<SaleDoc[]> {
  const rows = await fetchAll<DocRow>((from, to) =>
    sb
      .from('documents')
      .select(DOC_COLS)
      .eq('shop_id', shopId)
      .in('status', ['posted', 'reversed'])
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to) as unknown as Res<DocRow>,
  );
  return rows.map(toDoc);
}

interface LineRow extends Omit<SaleLine, 'qty_milli' | 'unit_price' | 'line_total'> {
  qty_milli: string;
  unit_price: string;
  line_total: string;
}

interface ReversalRow extends Omit<Reversal, 'amount'> {
  amount: string;
}

const REVERSAL_COLS = 'id, document_id, amount::text, reason, created_by, created_at';
const toReversal = (r: ReversalRow): Reversal => ({ ...r, amount: toBig(r.amount) });

export async function getSaleDetail(sb: SB, shopId: string, id: string): Promise<SaleDetail | null> {
  const [docRes, linesRes, revRes] = await Promise.all([
    sb.from('documents').select(DOC_COLS).eq('shop_id', shopId).eq('id', id).maybeSingle(),
    sb
      .from('document_lines')
      .select('id, line_index, product_name, product_id, qty_milli::text, unit, unit_price::text, line_total::text, raw_text')
      .eq('shop_id', shopId)
      .eq('document_id', id)
      .order('line_index'),
    sb.from('document_reversals').select(REVERSAL_COLS).eq('shop_id', shopId).eq('document_id', id).maybeSingle(),
  ]);
  const doc = check(docRes) as unknown as DocRow | null;
  if (!doc) return null;
  const lines = (check(linesRes) ?? []) as unknown as LineRow[];
  const rev = check(revRes) as unknown as ReversalRow | null;
  return {
    doc: toDoc(doc),
    lines: lines.map((l) => ({ ...l, qty_milli: toBig(l.qty_milli), unit_price: toBig(l.unit_price), line_total: toBig(l.line_total) })),
    reversal: rev ? toReversal(rev) : null,
  };
}

/**
 * Savdo qatorlari (tan narx snapshot'i bilan) berilgan hujjatlar uchun. `unit_cost` ustuni (006) bo'lmasa
 * barcha qatorlarda null (tan narx noma'lum). Foyda va "ko'p sotilgan" shundan hisoblanadi (core'da).
 */
export async function listSaleLines(sb: SB, shopId: string, docIds: readonly string[]): Promise<SaleLineCost[]> {
  if (docIds.length === 0) return [];
  const withCost = await hasColumn(sb, 'document_lines', 'unit_cost', shopId);
  const cols = `document_id, product_id, product_name, qty_milli::text, unit_price::text${withCost ? ', unit_cost::text' : ''}`;
  interface Row {
    document_id: string;
    product_id: string | null;
    product_name: string;
    qty_milli: string;
    unit_price: string;
    unit_cost?: string | null;
  }
  const out: SaleLineCost[] = [];
  for (let i = 0; i < docIds.length; i += 80) {
    const chunk = docIds.slice(i, i + 80);
    const rows = await fetchAll<Row>((from, to) =>
      sb.from('document_lines').select(cols).eq('shop_id', shopId).in('document_id', chunk).order('document_id').order('line_index').range(from, to) as unknown as Res<Row>,
    );
    for (const r of rows) {
      out.push({
        document_id: r.document_id,
        product_id: r.product_id,
        product_name: r.product_name,
        qty_milli: toBig(r.qty_milli),
        unit_price: toBig(r.unit_price),
        unit_cost: r.unit_cost === undefined || r.unit_cost === null ? null : toBig(r.unit_cost),
      });
    }
  }
  return out;
}

/** Ombor qoldig'i (product_stock, 006): faqat harakati bor tovarlar. View yo'q bo'lsa null */
export async function listStockLevels(sb: SB, shopId: string): Promise<Map<string, bigint> | null> {
  const { error } = await sb.from('product_stock').select('product_id').eq('shop_id', shopId).limit(1);
  if (error) return null;
  const rows = await fetchAll<{ product_id: string; qty_milli: string }>((from, to) =>
    sb.from('product_stock').select('product_id, qty_milli::text').eq('shop_id', shopId).order('product_id').range(from, to) as unknown as Res<{ product_id: string; qty_milli: string }>,
  );
  return new Map(rows.map((r) => [r.product_id, toBig(r.qty_milli)]));
}

export async function listReversals(sb: SB, shopId: string): Promise<Reversal[]> {
  const rows = await fetchAll<ReversalRow>((from, to) =>
    sb.from('document_reversals').select(REVERSAL_COLS).eq('shop_id', shopId).order('created_at', { ascending: false }).order('id').range(from, to) as unknown as Res<ReversalRow>,
  );
  return rows.map(toReversal);
}

export interface PostSaleLine {
  product_name: string;
  qty_milli: bigint;
  unit: Unit;
  unit_price: bigint;
  /** Katalogdan tanlangan tovar (W4); bo'lmasa server nom + birlik bo'yicha bog'laydi */
  product_id?: string | null;
}

export interface PostSaleArgs {
  shopId: string;
  saleId: string;
  clientOpId: string;
  customerId: string | null;
  note: string | null;
  lines: PostSaleLine[];
  clientTotal: bigint;
  /**
   * Savdo bilan birga to'lanadigan summa (W3): savdo va to'lov BITTA tranzaksiyada (`post_sale` p_paid, 006).
   * 0 yoki berilmasa to'lov yozilmaydi. Server to'lov kalitini `sale-pay:<client_op_id>` qiladi (idempotent).
   */
  paid?: bigint;
  method?: PaymentMethod | null;
}

/** post_sale ning to'lov argumentlari: faqat to'lov bo'lsa yuboriladi (eski chaqiruv imzosi o'zgarmaydi) */
function salePaymentArgs(a: PostSaleArgs): Record<string, string> {
  if (!a.paid || a.paid <= 0n) return {};
  if (!a.method) throw new AppError('validation', "To'lov usulini tanlang.");
  return { p_paid: a.paid.toString(), p_payment_method: a.method };
}

/**
 * post_sale RPC. Server summani qayta hisoblaydi (calc_mismatch bo'lsa hech narsa saqlanmaydi),
 * client_op_id bo'yicha idempotent. Muvaffaqiyatdan keyin hujjat (va to'lov bo'lsa to'lov ham) qayta o'qilib tekshiriladi.
 */
export async function postSale(sb: SB, a: PostSaleArgs): Promise<string> {
  const pay = salePaymentArgs(a);
  const res = await sb.rpc('post_sale', {
    ...pay,
    p_shop_id: a.shopId,
    p_sale_id: a.saleId,
    p_client_op_id: a.clientOpId,
    p_customer_id: a.customerId,
    p_raw_input: a.note,
    p_lines: a.lines.map((l) => ({
      product_name: l.product_name,
      qty_milli: l.qty_milli.toString(),
      unit: l.unit,
      unit_price: l.unit_price.toString(),
      raw_text: null,
      // Faqat to'g'ri uuid yuboriladi (server regex bilan tekshiradi; birlik mos kelmasa nom bo'yicha bog'laydi)
      ...(l.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.product_id) ? { product_id: l.product_id } : {}),
    })),
    p_client_total: a.clientTotal.toString(),
  });
  const id = check(res) as string | null;
  if (!id) throw new AppError('unknown', 'Server savdo identifikatorini qaytarmadi — savdo saqlanmagan bo\'lishi mumkin.');
  const doc = check(await sb.from('documents').select(DOC_COLS).eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as unknown as DocRow | null;
  if (!doc) throw new AppError('unknown', 'Savdo serverda topilmadi. Savdolar ro\'yxatini tekshiring.');
  if (doc.status !== 'posted' && doc.status !== 'reversed') throw new AppError('unknown', 'Savdo serverda tasdiqlanmagan holatda.');
  if (toBig(doc.subtotal) !== a.clientTotal) {
    // Shu client_op_id bilan avval boshqa tarkibdagi savdo saqlangan — foydalanuvchi bilishi kerak
    throw new AppError('conflict', "Server allaqachon boshqa summadagi savdoni qaytardi. Savdolar ro'yxatini tekshiring.");
  }
  if (pay.p_paid) {
    const p = check(await sb.from('payments').select('amount::text').eq('shop_id', a.shopId).eq('client_op_id', `sale-pay:${a.clientOpId}`).maybeSingle()) as { amount: string } | null;
    if (!p || toBig(p.amount) !== a.paid) throw new AppError('unknown', "Savdo saqlandi, lekin to'lov serverda kutilgan summada topilmadi. Mijoz daftarini tekshiring.");
  }
  return id;
}

/** Bir martalik (mijozsiz, naqd) savdo uchun tizim mijozi (006 ensure_walkin_customer). Idempotent: do'konda bitta */
export async function ensureWalkinCustomer(sb: SB, shopId: string): Promise<string> {
  const id = check(await sb.rpc('ensure_walkin_customer', { p_shop_id: shopId })) as string | null;
  if (!id) throw new AppError('unknown', 'Server bir martalik mijozni qaytarmadi.');
  return id;
}

/**
 * Savdoni bekor qilish (teskari yozuv). `voidPaymentIds` berilsa (shu savdo bilan kelgan to'lovlar, `salePayments`),
 * savdo va to'lovlar BITTA tranzaksiyada bekor qilinadi: `reverse_sale_with_payments` (013). Ikki alohida RPC
 * ishlatilmaydi (orada uzilish yarim holat qoldirardi). 013 qo'llanmagan bo'lsa tushunarli xato, jim fallback yo'q.
 * client_op_id bo'yicha idempotent. Natija serverdan qayta o'qib tekshiriladi.
 */
export async function reverseSale(sb: SB, shopId: string, documentId: string, clientOpId: string, reason: string, voidPaymentIds: readonly string[] = []): Promise<void> {
  const base = { p_shop_id: shopId, p_document_id: documentId, p_client_op_id: clientOpId, p_reason: reason.trim() };
  if (voidPaymentIds.length > 0) {
    const res = await sb.rpc('reverse_sale_with_payments', { ...base, p_void_payment_ids: [...voidPaymentIds] });
    // 013 hali qo'llanmagan server: hech narsa o'zgarmagan. Jim fallback yo'q (to'lov qolib, kassa noto'g'ri bo'lardi):
    // savdogar o'zi tanlaydi
    if (res.error && isRpcMissing(res.error)) {
      throw new RpcMissingError(
        'reverse_sale_with_payments',
        "Savdo bilan to'lovni birga bekor qilish serverda hali yoqilmagan. «To'lovni ham bekor qilish» belgisini olib tashlab savdoni bekor qiling, so'ng to'lovni mijoz daftaridan alohida bekor qiling.",
      );
    }
    check(res);
  }
  else check(await sb.rpc('reverse_sale', base));
  const doc = check(await sb.from('documents').select('status').eq('shop_id', shopId).eq('id', documentId).maybeSingle()) as { status: string } | null;
  if (doc?.status !== 'reversed') throw new AppError('unknown', 'Server bekor qilishni tasdiqlamadi.');
  if (voidPaymentIds.length > 0) {
    const voids = (check(await sb.from('payment_voids').select('payment_id').eq('shop_id', shopId).in('payment_id', [...voidPaymentIds])) ?? []) as { payment_id: string }[];
    if (voids.length !== voidPaymentIds.length) throw new AppError('unknown', "Server to'lov bekor qilinishini tasdiqlamadi. Mijoz daftarini tekshiring.");
  }
}

// ---------------------------------------------------------------------------
// To'lovlar
// ---------------------------------------------------------------------------

interface PaymentRow extends Omit<Payment, 'amount' | 'void'> {
  amount: string;
}

const PAYMENT_COLS = 'id, customer_id, amount::text, method, note, created_by, created_at, client_op_id';

export async function listPayments(sb: SB, shopId: string): Promise<Payment[]> {
  const [rows, voids] = await Promise.all([
    fetchAll<PaymentRow>((from, to) =>
      sb.from('payments').select(PAYMENT_COLS).eq('shop_id', shopId).order('created_at', { ascending: false }).order('id').range(from, to) as unknown as Res<PaymentRow>,
    ),
    fetchAll<PaymentVoid>((from, to) =>
      sb.from('payment_voids').select('id, payment_id, reason, created_by, created_at').eq('shop_id', shopId).order('created_at').order('id').range(from, to),
    ),
  ]);
  const byPayment = new Map(voids.map((v) => [v.payment_id, v]));
  return rows.map((r) => ({ ...r, amount: toBig(r.amount), void: byPayment.get(r.id) ?? null }));
}

export interface RecordPaymentArgs {
  shopId: string;
  paymentId: string;
  clientOpId: string;
  customerId: string;
  amount: bigint;
  method: PaymentMethod;
  note: string | null;
}

/** record_payment RPC: server qarzdan oshmasligini tekshiradi, client_op_id bo'yicha idempotent */
export async function recordPayment(sb: SB, a: RecordPaymentArgs): Promise<string> {
  const id = check(
    await sb.rpc('record_payment', {
      p_shop_id: a.shopId,
      p_payment_id: a.paymentId,
      p_client_op_id: a.clientOpId,
      p_customer_id: a.customerId,
      p_amount: a.amount.toString(),
      p_method: a.method,
      p_note: a.note,
    }),
  ) as string | null;
  if (!id) throw new AppError('unknown', "Server to'lov identifikatorini qaytarmadi.");
  const row = check(await sb.from('payments').select('id, amount::text').eq('shop_id', a.shopId).eq('id', id).maybeSingle()) as { id: string; amount: string } | null;
  if (!row) throw new AppError('unknown', "To'lov serverda topilmadi. To'lovlar tarixini tekshiring.");
  if (toBig(row.amount) !== a.amount) throw new AppError('conflict', "Server allaqachon boshqa summadagi to'lovni qaytardi. Tarixni tekshiring.");
  return id;
}

export async function voidPayment(sb: SB, shopId: string, paymentId: string, reason: string): Promise<void> {
  check(await sb.rpc('void_payment', { p_shop_id: shopId, p_payment_id: paymentId, p_reason: reason.trim() }));
  const row = check(await sb.from('payment_voids').select('id').eq('shop_id', shopId).eq('payment_id', paymentId).maybeSingle());
  if (!row) throw new AppError('unknown', "Server to'lov bekor qilinishini tasdiqlamadi.");
}


// ---------------------------------------------------------------------------
// MCP agent qoralamalari (004_mcp_agent.sql)
// ---------------------------------------------------------------------------

/**
 * Do'konning qoralamalari (yangisi birinchi). Faqat o'qish: yozish accept/reject RPC'lari orqali.
 * RLS: begona do'kon qoralamalari ko'rinmaydi. Ochiq qoralamalar bazada 50 tadan oshmaydi.
 */
export async function listAgentDrafts(sb: SB, shopId: string, opts: { status?: AgentDraftStatus; limit?: number } = {}): Promise<AgentDraft[]> {
  let q = sb.from('agent_drafts').select(AGENT_DRAFT_COLS).eq('shop_id', shopId);
  if (opts.status) q = q.eq('status', opts.status);
  const rows = check(await q.order('created_at', { ascending: false }).order('id').limit(opts.limit ?? 200)) as unknown as AgentDraftRow[] | null;
  return (rows ?? []).map(toAgentDraft);
}

/**
 * Qoralamani tasdiqlaydi: accept_agent_draft RPC (faqat oddiy sessiya; OAuth token rad etiladi).
 * Server mavjud post_sale / record_payment ni chaqiradi: jami PostgreSQL'da qayta hisoblanadi, mos kelmasa
 * (calc_mismatch) yoki to'lov qarzdan oshsa hech narsa saqlanmaydi va qoralama `draft` holatida qoladi.
 *
 * Idempotent: ikkinchi bosish yangi savdo yozmaydi (server qatorni qulflaydi, ichki client_op_id = `agent-draft:<id>`);
 * natija 'already' bo'ladi. Muvaffaqiyatdan keyin natija serverdan qayta o'qib tekshiriladi.
 */
export async function acceptAgentDraft(sb: SB, shopId: string, draft: AgentDraft): Promise<'accepted' | 'already'> {
  const res = await sb.rpc('accept_agent_draft', { p_draft_id: draft.id });
  if (res.error) {
    if (isDraftAlreadyDecided(res.error)) return 'already';
    throw toAppError(res.error);
  }
  const state = check(await sb.from('agent_drafts').select('status').eq('shop_id', shopId).eq('id', draft.id).maybeSingle()) as { status: string } | null;
  if (state?.status !== 'accepted') throw new AppError('unknown', "Server tasdiqlashni tasdiqlamadi. Qoralamalar ro'yxatini tekshiring.");
  const d = draft.detail;
  if (d.kind === 'sale') {
    const doc = check(await sb.from('documents').select('status, subtotal::text').eq('shop_id', shopId).eq('id', draft.id).maybeSingle()) as { status: string; subtotal: string } | null;
    if (!doc || doc.status !== 'posted' || toBig(doc.subtotal) !== draft.total) {
      throw new AppError('unknown', "Savdo serverda kutilgan summada topilmadi. Savdolar ro'yxatini tekshiring.");
    }
  } else if (d.kind === 'purchase') {
    const doc = check(await sb.from('purchase_documents').select('status, subtotal::text').eq('shop_id', shopId).eq('id', draft.id).maybeSingle()) as { status: string; subtotal: string } | null;
    if (!doc || doc.status !== 'posted' || toBig(doc.subtotal) !== draft.total) {
      throw new AppError('unknown', "Kirim serverda kutilgan summada topilmadi. Kirim daftarini tekshiring.");
    }
  } else if (d.kind === 'payment') {
    const pay = check(await sb.from('payments').select('amount::text').eq('shop_id', shopId).eq('id', draft.id).maybeSingle()) as { amount: string } | null;
    if (!pay || toBig(pay.amount) !== draft.total) {
      throw new AppError('unknown', "To'lov serverda kutilgan summada topilmadi. To'lovlar ro'yxatini tekshiring.");
    }
  } else if (d.kind === 'customer_update' || d.kind === 'customer_archive') {
    const c = check(await sb.from('customers').select('name, is_active').eq('shop_id', shopId).eq('id', d.target_id).maybeSingle()) as { name: string; is_active: boolean } | null;
    const okName = d.kind === 'customer_archive' ? c?.is_active === false : c?.name === d.name.to;
    if (!c || !okName) throw new AppError('unknown', "Mijoz serverda kutilgan holatda emas. Mijozlar ro'yxatini tekshiring.");
  } else if (d.kind === 'product_update' || d.kind === 'product_archive') {
    const p = check(await sb.from('products').select('name, unit, last_price::text, is_active').eq('shop_id', shopId).eq('id', d.target_id).maybeSingle()) as { name: string; unit: string; last_price: string | null; is_active: boolean } | null;
    let okProduct = !!p;
    if (p && d.kind === 'product_archive') okProduct = p.is_active === false;
    if (p && d.kind === 'product_update') {
      if (d.name && p.name !== d.name.to) okProduct = false;
      if (d.unit && p.unit !== d.unit.to) okProduct = false;
      if (d.price && (p.last_price === null ? null : toBig(p.last_price)) !== d.price.to) okProduct = false;
    }
    if (!okProduct) throw new AppError('unknown', "Tovar serverda kutilgan holatda emas. Mahsulotlar ro'yxatini tekshiring.");
  }
  return 'accepted';
}

/** Qoralamani rad etadi (hech narsa yozilmaydi). Sabab ixtiyoriy. Ikkinchi bosish 'already'. */
export async function rejectAgentDraft(sb: SB, draftId: string, reason: string | null): Promise<'rejected' | 'already'> {
  const res = await sb.rpc('reject_agent_draft', { p_draft_id: draftId, p_reason: reason?.trim() || null });
  if (res.error) {
    if (isDraftAlreadyDecided(res.error)) return 'already';
    throw toAppError(res.error);
  }
  return 'rejected';
}

/**
 * OAuth klient nomlari (client_id → nom): foydalanuvchining ruxsatlari ro'yxatidan (auth.oauth.listGrants).
 * Faqat ko'rsatish uchun; xato bo'lsa bo'sh xarita (qisqa ID ko'rsatiladi). Qaytarib olingan ruxsatlar nomi yo'q.
 */
export async function listOAuthClientNames(sb: SB): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const { data, error } = await sb.auth.oauth.listGrants();
    if (error || !data) return names;
    for (const g of data) if (g.client?.id && g.client.name) names.set(g.client.id, g.client.name);
  } catch {
    // OAuth server yoqilmagan yoki tarmoq xatosi: nom o'rniga qisqa ID
  }
  return names;
}
