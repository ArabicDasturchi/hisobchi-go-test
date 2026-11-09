import { stageOf } from './stage';
import type {
  AdminApi,
  AdminFunnel,
  AdminOverview,
  AdminShopDetail,
  AdminShopRow,
  AdminShopsPage,
  AuditRow,
  FunnelKey,
  ShopsQuery,
  StepKey,
} from './types';

/**
 * Demo ma'lumot (`npm run demo:admin`): 6 ta soxta do'kon, turli faollik. Supabase kerak emas.
 * Hamma ism va email soxta (example.test). Haqiqiy rejimda hisob SQL'da; bu yerdagi mantiq faqat demo uchun
 * va testlarda SQL ta'riflari bilan (`stage.ts`, docs/ADMIN.md) solishtiriladi.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TZ = 'Asia/Tashkent';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Toshkent bo'yicha YYYY-MM-DD */
export function tashkentDay(d: Date): string {
  return dayFmt.format(d);
}

interface DemoShop {
  id: string;
  name: string;
  owner: string;
  email: string;
  createdDaysAgo: number;
  /** Oxirgi faollikdan beri (soat); null — faollik yo'q */
  lastActivityHoursAgo: number | null;
  products: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchases: number;
  /** Oxirgi 14 kun (eskidan yangiga) kunlik savdolar soni */
  daily: number[];
  /** Qadamlar: do'kon yaratilgandan necha soat keyin (null — bajarilmagan) */
  firstProductH: number | null;
  firstSupplierH: number | null;
  firstPurchaseH: number | null;
  firstSaleH: number | null;
}

export const DEMO_USERS = 8;

export const DEMO_SHOPS: DemoShop[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001', name: 'Bahor oziq-ovqat', owner: 'Karim Rahimov', email: 'karim@example.test',
    createdDaysAgo: 120, lastActivityHoursAgo: 0.3, products: 84, customers: 31, suppliers: 7, sales: 412, purchases: 22,
    daily: [14, 18, 12, 20, 16, 9, 11, 15, 19, 17, 21, 14, 18, 16],
    firstProductH: 2, firstSupplierH: 26, firstPurchaseH: 30, firstSaleH: 52,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002', name: 'Dilshod ulgurji', owner: 'Dilshod Aliyev', email: 'dilshod@example.test',
    createdDaysAgo: 60, lastActivityHoursAgo: 5, products: 51, customers: 17, suppliers: 4, sales: 133, purchases: 8,
    daily: [4, 0, 6, 5, 3, 2, 0, 4, 3, 1, 5, 4, 2, 3],
    firstProductH: 5, firstSupplierH: 70, firstPurchaseH: 96, firstSaleH: 120,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003', name: 'Madina market', owner: 'Madina Karimova', email: 'madina@example.test',
    createdDaysAgo: 28, lastActivityHoursAgo: 24 * 9, products: 23, customers: 6, suppliers: 2, sales: 12, purchases: 1,
    daily: [2, 3, 1, 0, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    firstProductH: 3, firstSupplierH: 30, firstPurchaseH: 50, firstSaleH: 200,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004', name: 'Sardor savdo', owner: 'Sardor Yusupov', email: 'sardor@example.test',
    createdDaysAgo: 6, lastActivityHoursAgo: 48, products: 15, customers: 2, suppliers: 3, sales: 0, purchases: 2,
    daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    firstProductH: 1, firstSupplierH: 20, firstPurchaseH: 44, firstSaleH: null,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005', name: 'Nilufar kiyim', owner: 'Nilufar Saidova', email: 'nilufar@example.test',
    createdDaysAgo: 12, lastActivityHoursAgo: 24 * 11, products: 9, customers: 0, suppliers: 1, sales: 0, purchases: 0,
    daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    firstProductH: 4, firstSupplierH: 8, firstPurchaseH: null, firstSaleH: null,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000006', name: "Yangi do'kon", owner: 'Olim Hasanov', email: 'olim@example.test',
    createdDaysAgo: 1, lastActivityHoursAgo: 22, products: 0, customers: 0, suppliers: 0, sales: 0, purchases: 0,
    daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    firstProductH: null, firstSupplierH: null, firstPurchaseH: null, firstSaleH: null,
  },
];

interface Facts {
  shop: DemoShop;
  createdAt: Date;
  lastActivityAt: Date | null;
  sales7d: number;
}

function factsOf(now: Date): Facts[] {
  return DEMO_SHOPS.map((shop) => ({
    shop,
    createdAt: new Date(now.getTime() - shop.createdDaysAgo * DAY),
    lastActivityAt: shop.lastActivityHoursAgo === null ? null : new Date(now.getTime() - shop.lastActivityHoursAgo * HOUR),
    sales7d: shop.daily.slice(-7).reduce((a, b) => a + b, 0),
  }));
}

function stageFor(f: Facts) {
  const s = f.shop;
  return stageOf({ products: s.products, suppliers: s.suppliers, purchases: s.purchases, sales: s.sales, sales7d: f.sales7d });
}

function isStale(f: Facts, now: Date): boolean {
  return (f.lastActivityAt ?? f.createdAt).getTime() < now.getTime() - 7 * DAY;
}

function lastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => tashkentDay(new Date(now.getTime() - (n - 1 - i) * DAY)));
}

function toRow(f: Facts, now: Date): AdminShopRow {
  const s = f.shop;
  return {
    id: s.id,
    name: s.name,
    owner_name: s.owner,
    owner_email: s.email,
    created_at: f.createdAt.toISOString(),
    last_activity_at: f.lastActivityAt?.toISOString() ?? null,
    is_stale: isStale(f, now),
    products: s.products,
    customers: s.customers,
    suppliers: s.suppliers,
    sales: s.sales,
    purchases: s.purchases,
    stage: stageFor(f),
  };
}

export function demoOverview(now: Date, days = 14): AdminOverview {
  const facts = factsOf(now);
  const n = Math.min(Math.max(days, 1), 90);
  const keys = lastDays(now, n);
  const today = keys[keys.length - 1];
  const dailySales = (offsetFromEnd: number) =>
    facts.reduce((sum, f) => sum + (f.shop.daily[f.shop.daily.length - 1 - offsetFromEnd] ?? 0), 0);
  const createdOn = (key: string) => facts.filter((f) => tashkentDay(f.createdAt) === key).length;
  return {
    shops: facts.length,
    users: DEMO_USERS,
    new_shops_today: createdOn(today),
    new_shops_7d: facts.filter((f) => f.createdAt.getTime() >= now.getTime() - 7 * DAY).length,
    new_shops_30d: facts.filter((f) => f.createdAt.getTime() >= now.getTime() - 30 * DAY).length,
    sales_today: dailySales(0),
    active_shops_7d: facts.filter((f) => f.lastActivityAt && f.lastActivityAt.getTime() >= now.getTime() - 7 * DAY).length,
    daily: keys.map((day, i) => ({ day, new_shops: createdOn(day), sales: dailySales(n - 1 - i) })),
  };
}

export function demoShops(now: Date, q: ShopsQuery = {}): AdminShopsPage {
  const needle = q.search?.trim().toLowerCase();
  let rows = factsOf(now).filter((f) => {
    if (!needle) return true;
    return [f.shop.name, f.shop.owner, f.shop.email].some((v) => v.toLowerCase().includes(needle));
  });
  const sort = q.sort ?? 'activity';
  rows = rows.sort((a, b) => {
    if (sort === 'new') return b.createdAt.getTime() - a.createdAt.getTime();
    const av = a.lastActivityAt?.getTime() ?? -Infinity;
    const bv = b.lastActivityAt?.getTime() ?? -Infinity;
    return bv - av || b.createdAt.getTime() - a.createdAt.getTime();
  });
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);
  return { total: rows.length, rows: rows.slice(offset, offset + limit).map((f) => toRow(f, now)) };
}

export function demoShopDetail(now: Date, id: string): AdminShopDetail {
  const f = factsOf(now).find((x) => x.shop.id === id);
  if (!f) throw new Error('shop_not_found');
  const s = f.shop;
  const row = toRow(f, now);
  const at = (h: number | null) => (h === null ? null : new Date(f.createdAt.getTime() + h * HOUR).toISOString());
  const keys = lastDays(now, 14);
  const steps: { key: StepKey; at: string | null }[] = [
    { key: 'shop', at: f.createdAt.toISOString() },
    { key: 'product', at: at(s.firstProductH) },
    { key: 'supplier', at: at(s.firstSupplierH) },
    { key: 'purchase', at: at(s.firstPurchaseH) },
    { key: 'sale', at: at(s.firstSaleH) },
  ];
  return {
    id: s.id,
    name: s.name,
    owner_name: s.owner,
    owner_email: s.email,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    is_stale: row.is_stale,
    stage: row.stage,
    counts: { products: s.products, customers: s.customers, suppliers: s.suppliers, sales: s.sales, purchases: s.purchases, sales_7d: f.sales7d },
    daily_sales: keys.map((day, i) => ({ day, sales: s.daily[i] ?? 0 })),
    steps,
  };
}

export function demoFunnel(now: Date): AdminFunnel {
  const rows = factsOf(now).map((f) => ({ f, stage: stageFor(f) }));
  const reached = (n: number) => rows.filter((r) => r.stage >= n).length;
  const keys: FunnelKey[] = ['registered', 'shop', 'product', 'supplier', 'purchase', 'sale', 'active'];
  const counts = keys.map((_, i) => (i === 0 ? DEMO_USERS : reached(i)));
  const steps = keys.map((key, i) => ({
    key,
    stage: i,
    count: counts[i],
    pct_of_registered: DEMO_USERS > 0 ? Math.round((100 * counts[i]) / DEMO_USERS) : 0,
    pct_of_prev: i > 0 && counts[i - 1] > 0 ? Math.round((100 * counts[i]) / counts[i - 1]) : 0,
  }));
  const stuck: AdminFunnel['stuck'] = {};
  for (let n = 1; n <= 5; n++) {
    stuck[String(n)] = rows
      .filter((r) => r.stage === n)
      .sort((a, b) => b.f.createdAt.getTime() - a.f.createdAt.getTime())
      .map((r) => ({ id: r.f.shop.id, name: r.f.shop.name }));
  }
  return { users: DEMO_USERS, shops: rows.length, users_without_shop: Math.max(DEMO_USERS - rows.length, 0), steps, stuck };
}

/** Demo API: har chaqiruv xotiradagi audit ro'yxatiga yoziladi (haqiqiy rejimdagidek) */
export function createDemoApi(clock: () => Date = () => new Date()): AdminApi {
  const audit: AuditRow[] = [];
  let seq = 0;
  const log = (action: string, target: string | null) => {
    seq += 1;
    audit.unshift({ id: `demo-audit-${seq}`, action, target, at: clock().toISOString() });
  };
  const wait = <T>(value: () => T): Promise<T> => new Promise((resolve, reject) => setTimeout(() => {
    try {
      resolve(value());
    } catch (e) {
      reject(e);
    }
  }, 120));
  return {
    overview: (days) => wait(() => { log('admin_overview', null); return demoOverview(clock(), days); }),
    shops: (q) => wait(() => { log('admin_shops', q?.search?.trim() ? 'search' : 'list'); return demoShops(clock(), q); }),
    shopDetail: (id) => wait(() => { log('admin_shop_detail', id); return demoShopDetail(clock(), id); }),
    funnel: () => wait(() => { log('admin_funnel', null); return demoFunnel(clock()); }),
    myAudit: (limit = 100) => wait(() => { log('admin_my_audit', null); return audit.slice(0, Math.min(Math.max(limit, 1), 100)); }),
  };
}
