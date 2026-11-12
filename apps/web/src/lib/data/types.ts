/** Supabase sxemasiga (001 + 003 migratsiyalari) mos tiplar. Pul — BigInt. */
import { ALLOWED_UNITS, type AllowedUnit } from '@hisobchi/core';

export type Role = 'owner' | 'admin' | 'member';
export type Unit = AllowedUnit;
export const UNITS: readonly Unit[] = ALLOWED_UNITS;

/** record_payment p_method — payments.method CHECK bilan bir xil */
export type PaymentMethod = 'naqd' | 'karta' | 'otkazma';
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['naqd', 'karta', 'otkazma'];

export interface Shop {
  id: string;
  name: string;
  created_at: string;
  /** Do'kon sozlamalari (010: shops.settings jsonb); ustun yo'q bo'lsa undefined. Hozir: { units: string[] } */
  settings?: Record<string, unknown>;
}

export interface Membership {
  shop: Shop;
  role: Role;
  user_id: string;
}

/** Yozuv manbasi: ilova (savdogar) yoki tashqi AI agent (MCP) */
export type RecordSource = 'app' | 'agent';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  /** false = arxivlangan (tarix, savdo va qarz saqlanadi, yangi savdo tanlovida ko'rinmaydi) */
  is_active: boolean;
  source: RecordSource;
  /** 006 migratsiyasidan: 'one_time' = bir martalik mijoz (tizim mijozi, ro'yxatlarda ko'rsatilmaydi). Ustun bo'lmasa undefined */
  kind?: 'regular' | 'one_time';
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  source: RecordSource;
  name: string;
  unit: Unit;
  last_price: bigint | null;
  /** Oxirgi kirim tan narxi (006); ustun yo'q yoki noma'lum bo'lsa null/undefined — foydaga kirmaydi */
  cost_price?: bigint | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SaleStatus = 'posted' | 'reversed';

export interface SaleDoc {
  id: string;
  customer_id: string | null;
  status: SaleStatus;
  subtotal: bigint;
  created_at: string;
  posted_at: string | null;
  created_by: string;
  /** Idempotentlik kaliti: savdo bilan kelgan to'lov `sale-pay:<client_op_id>` (W1). Eski ma'lumotda yo'q bo'lishi mumkin */
  client_op_id?: string | null;
}

export interface SaleLine {
  id: string;
  line_index: number;
  product_name: string;
  product_id: string | null;
  qty_milli: bigint;
  unit: string;
  unit_price: bigint;
  line_total: bigint;
  raw_text: string | null;
}

/** Savdo qatori tan narx snapshot'i bilan (foyda va "ko'p sotilgan" uchun). unit_cost null = noma'lum */
export interface SaleLineCost {
  document_id: string;
  product_id: string | null;
  product_name: string;
  qty_milli: bigint;
  unit_price: bigint;
  unit_cost: bigint | null;
}

export interface Reversal {
  id: string;
  document_id: string;
  amount: bigint;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface PaymentVoid {
  id: string;
  payment_id: string;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface Payment {
  id: string;
  customer_id: string;
  amount: bigint;
  method: PaymentMethod;
  note: string | null;
  created_by: string;
  created_at: string;
  void: PaymentVoid | null;
  /** `sale-pay:<savdo client_op_id>` — savdo bilan birga yozilgan to'lov (W1) */
  client_op_id?: string | null;
}

export interface SaleDetail {
  doc: SaleDoc;
  lines: SaleLine[];
  reversal: Reversal | null;
}

// ---------------------------------------------------------------------------
// MCP agent qoralamalari (004_mcp_agent.sql: agent_drafts)
// ---------------------------------------------------------------------------

export type AgentDraftStatus = 'draft' | 'accepted' | 'rejected';

export interface AgentDraftLine {
  product_name: string;
  qty_milli: bigint;
  unit: string;
  unit_price: bigint;
  /** Agent yuborgan jami emas: PostgreSQL yozgan qiymat. Veb uni core formulasi bilan qayta tekshiradi */
  line_total: bigint;
  raw_text: string | null;
  warnings: string[];
}

/** Tasdiqlash so'rovidagi o'zgarish: eski va yangi qiymat */
export interface Change<T> {
  from: T;
  to: T;
}

/** Kirim qoralamasi qatori: nom va birlik serverda tovardan olingan (agent yubormagan) */
export interface PurchaseDraftLine {
  product_id: string;
  product_name: string;
  unit: string;
  qty_milli: bigint;
  unit_cost: bigint;
  line_total: bigint;
  warnings: string[];
}

export type AgentDraftDetail =
  | {
      kind: 'sale';
      raw_input: string | null;
      lines: AgentDraftLine[];
      /** 008: bir martalik mijoz (qarzga olmaydi, to'liq to'lanadi) */
      walkin: boolean;
      /** Savdo bilan birga to'lanadigan summa (bir martalikda jamiga teng); yo'q = qarzga */
      paid: bigint | null;
      method: PaymentMethod | null;
    }
  | {
      kind: 'purchase';
      supplier_id: string;
      doc_date: string;
      lines: PurchaseDraftLine[];
      paid: bigint | null;
      method: PaymentMethod | null;
      note: string | null;
    }
  | { kind: 'payment'; method: PaymentMethod; note: string | null }
  | { kind: 'customer_update'; target_id: string; target_name: string; name: Change<string> }
  | {
      kind: 'product_update';
      target_id: string;
      target_name: string;
      name: Change<string> | null;
      unit: Change<string> | null;
      price: Change<bigint | null> | null;
    }
  | { kind: 'customer_archive'; target_id: string; target_name: string; outstanding: bigint | null }
  | { kind: 'product_archive'; target_id: string; target_name: string }
  /** payload kutilgan shaklda emas: ko'rsatilmaydi, tasdiqlab bo'lmaydi */
  | { kind: 'unreadable'; reason: string };

export interface AgentDraft {
  id: string;
  status: AgentDraftStatus;
  customer_id: string | null;
  /** kirim qoralamasida — ta'minotchi; katalog so'rovlarida — nishon */
  target_id: string | null;
  total: bigint;
  /** OAuth klient UUID'i yoki 'first_party' */
  client_id: string;
  created_by: string;
  created_at: string;
  decided_at: string | null;
  reject_reason: string | null;
  detail: AgentDraftDetail;
}
