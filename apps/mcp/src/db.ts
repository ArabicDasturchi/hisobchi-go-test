/**
 * Ma'lumotlar qatlami. MCP server bazaga FAQAT shu yerdagi `agent_*` RPC'lar orqali murojaat qiladi
 * (foydalanuvchining o'z tokeni bilan, RLS ostida). post_sale, reverse_sale, record_payment, void_payment,
 * accept/reject_agent_draft bu yerda yo'q va bo'lmasligi kerak (__tests__/guard.test.ts tekshiradi).
 * Katalog (mijoz, tovar): agent_add_* QO'SHADI; o'zgartirish va arxiv faqat agent_propose_* (tasdiqlash so'rovi).
 *
 * Javoblar zod bilan tekshiriladi va faqat ma'lum maydonlar qoldiriladi: bazadan kutilmagan ustun
 * (masalan telefon) kelib qolsa ham AI ga chiqmaydi.
 */
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Config } from './config.js';
import { bigintLike } from './money.js';

export class DbError extends Error {
  constructor(
    /** Postgres RAISE matni (masalan "calc_mismatch: server=1, client=2") */
    readonly raw: string,
  ) {
    super(raw);
    this.name = 'DbError';
  }
}

const uuid = z.string().uuid();

const shopRow = z.object({ shop_id: uuid, shop_name: z.string(), role: z.string() });
const customerRow = z.object({ id: uuid, name: z.string(), outstanding: bigintLike });
const saleListRow = z.object({
  id: uuid,
  customer_id: uuid.nullable(),
  customer_name: z.string().nullable(),
  status: z.enum(['posted', 'reversed']),
  subtotal: bigintLike,
  line_count: bigintLike,
  created_at: z.string(),
});
const saleDetail = z.object({
  id: uuid,
  customer_id: uuid.nullable(),
  customer_name: z.string().nullable(),
  status: z.enum(['posted', 'reversed']),
  subtotal: bigintLike,
  created_at: z.string(),
  lines: z.array(
    z.object({
      line_index: z.number().int(),
      product_name: z.string(),
      qty_milli: bigintLike,
      unit: z.string(),
      unit_price: bigintLike,
      line_total: bigintLike,
    }),
  ),
  reversal: z.object({ reason: z.string(), created_at: z.string() }).nullable(),
});
const dayRows = z.object({
  day: z.string(),
  sales: z.array(z.object({ id: uuid, status: z.enum(['posted', 'reversed']), subtotal: bigintLike })),
  payments: z.array(z.object({ id: uuid, amount: bigintLike, voided: z.boolean() })),
  pg_totals: z.object({ sales_posted: bigintLike, sales_reversed: bigintLike, payments: bigintLike }),
});

const productItem = z.object({ id: uuid, name: z.string(), unit: z.string(), price: bigintLike.nullable(), is_active: z.boolean() });
const productRow = productItem.extend({ source: z.string() });
const addedCustomer = z.object({ id: uuid, name: z.string(), created: z.boolean(), is_active: z.boolean(), source: z.string(), replayed: z.boolean().optional() });
const addedProducts = z.object({
  created: z.array(productItem),
  existing: z.array(productItem),
  created_count: z.number().int(),
  existing_count: z.number().int(),
  replayed: z.boolean().optional(),
});

export type Shop = z.infer<typeof shopRow>;
export type ProductRow = z.infer<typeof productRow>;
export type AddedCustomer = z.infer<typeof addedCustomer>;
export type AddedProducts = z.infer<typeof addedProducts>;
export type CustomerRow = z.infer<typeof customerRow>;
export type SaleListRow = z.infer<typeof saleListRow>;
export type SaleDetail = z.infer<typeof saleDetail>;
export type DayRows = z.infer<typeof dayRows>;

export interface DraftLine {
  product_name: string;
  qty_milli: string;
  unit: string;
  unit_price: string;
  raw_text: string | null;
  warnings: string[];
}

export interface AgentDb {
  whoami(): Promise<Shop[]>;
  listCustomers(a: { shopId: string; query: string | null; limit: number; offset: number }): Promise<CustomerRow[]>;
  customerBalance(a: { shopId: string; customerId: string }): Promise<CustomerRow>;
  listSales(a: {
    shopId: string;
    customerId: string | null;
    from: string | null;
    to: string | null;
    status: 'posted' | 'reversed' | null;
    limit: number;
    offset: number;
  }): Promise<SaleListRow[]>;
  getSale(a: { shopId: string; saleId: string }): Promise<SaleDetail>;
  dayRows(a: { shopId: string; day: string }): Promise<DayRows>;
  listProducts(a: { shopId: string; query: string | null; includeArchived: boolean; limit: number; offset: number }): Promise<ProductRow[]>;
  /** Tasdiqsiz qo'shadi (katalog uchun ruxsat etilgan yagona yozuv). Dublikat bo'lsa mavjudini qaytaradi */
  addCustomer(a: { shopId: string; requestId: string; name: string }): Promise<AddedCustomer>;
  addProducts(a: { shopId: string; requestId: string; items: Array<{ name: string; unit: string; price: number | null }> }): Promise<AddedProducts>;
  /** O'zgartirish/arxiv: faqat tasdiqlash so'rovi (qoralama) yaratadi, hech narsa o'zgarmaydi */
  proposeCustomerUpdate(a: { shopId: string; requestId: string; customerId: string; name: string }): Promise<string>;
  proposeProductUpdate(a: { shopId: string; requestId: string; productId: string; changes: { name?: string; unit?: string; price?: number | null } }): Promise<string>;
  proposeArchive(a: { shopId: string; requestId: string; kind: 'customer' | 'product'; targetId: string }): Promise<string>;
  draftSale(a: {
    shopId: string;
    opId: string;
    customerId: string | null;
    rawInput: string | null;
    lines: DraftLine[];
    clientTotal: bigint;
  }): Promise<string>;
  draftPayment(a: {
    shopId: string;
    opId: string;
    customerId: string;
    amount: bigint;
    method: 'naqd' | 'karta' | 'otkazma';
    note: string | null;
  }): Promise<string>;
}

interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Foydalanuvchi tokeni bilan Supabase klienti (kalit — faqat publishable). */
export function createUserClient(cfg: Config, accessToken: string): RpcClient {
  return createClient(cfg.supabaseUrl, cfg.publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSupabaseDb(client: RpcClient): AgentDb {
  async function call<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new DbError(error.message);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new DbError(`bad_response: ${fn}`);
    return parsed.data;
  }

  return {
    whoami: () => call('agent_whoami', {}, z.array(shopRow)),
    listCustomers: (a) =>
      call(
        'agent_list_customers',
        { p_shop_id: a.shopId, p_query: a.query, p_limit: a.limit, p_offset: a.offset },
        z.array(customerRow),
      ),
    customerBalance: async (a) => {
      const rows = await call('agent_customer_balance', { p_shop_id: a.shopId, p_customer_id: a.customerId }, z.array(customerRow));
      const row = rows[0];
      if (!row) throw new DbError('customer_not_found');
      return row;
    },
    listSales: (a) =>
      call(
        'agent_list_sales',
        {
          p_shop_id: a.shopId,
          p_customer_id: a.customerId,
          p_from: a.from,
          p_to: a.to,
          p_status: a.status,
          p_limit: a.limit,
          p_offset: a.offset,
        },
        z.array(saleListRow),
      ),
    getSale: (a) => call('agent_get_sale', { p_shop_id: a.shopId, p_sale_id: a.saleId }, saleDetail),
    dayRows: (a) => call('agent_day_rows', { p_shop_id: a.shopId, p_day: a.day }, dayRows),
    listProducts: (a) =>
      call(
        'agent_list_products',
        { p_shop_id: a.shopId, p_query: a.query, p_include_archived: a.includeArchived, p_limit: a.limit, p_offset: a.offset },
        z.array(productRow),
      ),
    addCustomer: (a) => call('agent_add_customer', { p_shop_id: a.shopId, p_request_id: a.requestId, p_name: a.name }, addedCustomer),
    addProducts: (a) => call('agent_add_products', { p_shop_id: a.shopId, p_request_id: a.requestId, p_items: a.items }, addedProducts),
    proposeCustomerUpdate: (a) =>
      call('agent_propose_customer_update', { p_shop_id: a.shopId, p_request_id: a.requestId, p_customer_id: a.customerId, p_name: a.name }, uuid),
    proposeProductUpdate: (a) =>
      call('agent_propose_product_update', { p_shop_id: a.shopId, p_request_id: a.requestId, p_product_id: a.productId, p_changes: a.changes }, uuid),
    proposeArchive: (a) =>
      call('agent_propose_archive', { p_shop_id: a.shopId, p_request_id: a.requestId, p_kind: a.kind, p_target_id: a.targetId }, uuid),
    draftSale: (a) =>
      call(
        'agent_draft_sale',
        {
          p_shop_id: a.shopId,
          p_client_op_id: a.opId,
          p_customer_id: a.customerId,
          p_raw_input: a.rawInput,
          p_lines: a.lines,
          p_client_total: Number(a.clientTotal),
        },
        uuid,
      ),
    draftPayment: (a) =>
      call(
        'agent_draft_payment',
        {
          p_shop_id: a.shopId,
          p_client_op_id: a.opId,
          p_customer_id: a.customerId,
          p_amount: Number(a.amount),
          p_method: a.method,
          p_note: a.note,
        },
        uuid,
      ),
  };
}
