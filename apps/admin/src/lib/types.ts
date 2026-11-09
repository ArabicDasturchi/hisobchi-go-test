// Admin RPC natijalari (supabase/migrations/011_platform_admin.sql). Faqat sonlar va holatlar:
// mijoz/ta'minotchi nomi, telefon va summa maydonlari bu yerda YO'Q va bo'lmasligi kerak.

export interface DailyPoint {
  /** YYYY-MM-DD (Asia/Tashkent) */
  day: string;
  new_shops: number;
  sales: number;
}

export interface AdminOverview {
  shops: number;
  users: number;
  new_shops_today: number;
  new_shops_7d: number;
  new_shops_30d: number;
  sales_today: number;
  active_shops_7d: number;
  daily: DailyPoint[];
}

/** 1 do'kon · 2 tovar · 3 ta'minotchi · 4 kirim · 5 birinchi savdo · 6 faol (7 kunda 5+ savdo) */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdminShopRow {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  last_activity_at: string | null;
  is_stale: boolean;
  products: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchases: number;
  stage: Stage;
}

export interface AdminShopsPage {
  total: number;
  rows: AdminShopRow[];
}

export type ShopsSort = 'activity' | 'new';

export interface ShopsQuery {
  search?: string;
  limit?: number;
  offset?: number;
  sort?: ShopsSort;
}

export type StepKey = 'shop' | 'product' | 'supplier' | 'purchase' | 'sale';

export interface AdminShopDetail {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  last_activity_at: string | null;
  is_stale: boolean;
  stage: Stage;
  counts: { products: number; customers: number; suppliers: number; sales: number; purchases: number; sales_7d: number };
  daily_sales: { day: string; sales: number }[];
  /** Har qadamning birinchi bajarilgan vaqti; bajarilmagan bo'lsa null */
  steps: { key: StepKey; at: string | null }[];
}

export type FunnelKey = 'registered' | 'shop' | 'product' | 'supplier' | 'purchase' | 'sale' | 'active';

export interface FunnelStep {
  key: FunnelKey;
  /** 0 = ro'yxatdan o'tdi, 1..6 = do'kon bosqichlari */
  stage: number;
  count: number;
  pct_of_registered: number;
  pct_of_prev: number;
}

export interface AdminFunnel {
  users: number;
  shops: number;
  users_without_shop: number;
  steps: FunnelStep[];
  /** Bosqich ("1".."5") → shu bosqichda to'xtagan do'konlar (faqat id va nom) */
  stuck: Record<string, { id: string; name: string }[]>;
}

export interface AuditRow {
  id: string;
  action: string;
  target: string | null;
  at: string;
}

export interface AdminApi {
  overview(days?: number): Promise<AdminOverview>;
  shops(query?: ShopsQuery): Promise<AdminShopsPage>;
  shopDetail(id: string): Promise<AdminShopDetail>;
  funnel(): Promise<AdminFunnel>;
  myAudit(limit?: number): Promise<AuditRow[]>;
}
