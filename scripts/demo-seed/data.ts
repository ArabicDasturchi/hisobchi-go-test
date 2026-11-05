/**
 * Demo uchun SOXTA ma'lumot (npm run demo). Haqiqiy mijoz yo'q: ismlar to'qilgan, telefon raqami yo'q.
 *
 * Bu fayl faqat ma'lumot (jami yig'indi yo'q). Jamilarni hisoblash:
 *   - mobil web demo: ilovaning o'z ledger/purchasing kodi (core + SQLite ikki mustaqil yo'l);
 *   - veb panel demo: `@hisobchi/core` (`calculateDocument`, `calculatePurchase`) — qarang: apps/web/src/lib/demo.
 * Kutilgan natijalar (testda qat'iy tekshiriladi): savdo 385 000, kirim 1 450 000 / berildi 1 000 000 / ostatka 450 000.
 */

export type DemoUnit = 'dona' | 'kg' | 'litr';

export interface DemoProduct {
  key: string;
  name: string;
  unit: DemoUnit;
  /** Sotuv narxi, so'm */
  salePrice: number;
  /** Boshlang'ich qoldiq (butun birlik); kirim bilan keladigan tovarlarda 0 */
  openingStock: number;
}

export const DEMO_SHOP_NAME = "Demo do'kon (soxta ma'lumot)";

export const DEMO_SUPPLIER = { key: 'sup1', name: 'Anvar ulgurji' };

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { key: 'guruch', name: 'Guruch', unit: 'kg', salePrice: 13_000, openingStock: 0 },
  { key: 'shakar', name: 'Shakar', unit: 'kg', salePrice: 15_000, openingStock: 0 },
  { key: 'makaron', name: 'Makaron', unit: 'kg', salePrice: 9_000, openingStock: 80 },
  { key: 'un', name: 'Un (1-nav)', unit: 'kg', salePrice: 7_500, openingStock: 200 },
  { key: 'yog', name: "Yog' (kungaboqar)", unit: 'litr', salePrice: 24_000, openingStock: 40 },
  { key: 'choy', name: 'Choy (qora)', unit: 'dona', salePrice: 18_000, openingStock: 30 },
  { key: 'tuz', name: 'Tuz', unit: 'kg', salePrice: 2_500, openingStock: 60 },
  { key: 'kartoshka', name: 'Kartoshka', unit: 'kg', salePrice: 6_000, openingStock: 150 },
  { key: 'piyoz', name: 'Piyoz', unit: 'kg', salePrice: 4_500, openingStock: 120 },
];

export const DEMO_CUSTOMERS = [
  { key: 'karim', name: 'Karim aka (demo)' },
  { key: 'dilnoza', name: 'Dilnoza opa (demo)' },
] as const;

/** Kirim: 100 × 9 000 + 50 × 11 000 = 1 450 000; berildi 1 000 000 → ostatka 450 000 */
export const DEMO_PURCHASE = {
  lines: [
    { product: 'guruch', qty: 100, unitCost: 9_000 },
    { product: 'shakar', qty: 50, unitCost: 11_000 },
  ],
  paid: { method: 'naqd' as const, amount: 1_000_000 },
  expectedTotal: 1_450_000,
  expectedOutstanding: 450_000,
} as const;

/** Karim akaga savdo: 10 × 13 000 + 5 × 15 000 + 20 × 9 000 = 385 000 (to'lovsiz: qarzga) */
export const DEMO_SALE = {
  customer: 'karim',
  lines: [
    { product: 'guruch', qty: 10 },
    { product: 'shakar', qty: 5 },
    { product: 'makaron', qty: 20 },
  ],
  expectedTotal: 385_000,
} as const;

/** Bir martalik (ro'yxatsiz) mijozga savdo: to'liq naqd to'lanadi, qarz yaratmaydi */
export const DEMO_WALKIN_SALE = {
  lines: [
    { product: 'un', qty: 3 },
    { product: 'yog', qty: 2 },
  ],
  method: 'naqd' as const,
  /** 3 × 7 500 + 2 × 24 000 */
  expectedTotal: 70_500,
} as const;
