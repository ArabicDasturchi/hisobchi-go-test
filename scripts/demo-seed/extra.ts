/**
 * Demo uchun KENGAYTIRILGAN soxta ma'lumot (PANEL-2 S8): katalog, mijozlar, savdolar, ta'minotchilar va kirimlar.
 * Hammasi to'qilgan: haqiqiy shaxs, telefon raqami, haqiqiy qarz summalari YO'Q. Nomlar "(demo)" bilan.
 * Faqat ma'lumot: jami yig'indi yo'q (jamilarni `@hisobchi/core` hisoblaydi, `apps/web/src/lib/demo/seedExtra.ts`).
 */

export type ExtraUnit = 'dona' | 'pachka' | 'kg';

export interface ExtraProduct {
  key: string;
  name: string;
  unit: ExtraUnit;
  /** Sotuv narxi; null = narxi yo'q (savdoda qo'lda kiritiladi) */
  salePrice: number | null;
  /** Tan narx; null = noma'lum (foydaga kirmaydi). Kirimli tovarlarda kirim narxi ustun */
  costPrice: number | null;
  /** Boshlang'ich qoldiq (inventarizatsiya, kirimsiz) */
  openingStock?: number;
}

export const EXTRA_PRODUCTS: readonly ExtraProduct[] = [
  { key: 'sovun', name: 'Sovun', unit: 'dona', salePrice: 6_000, costPrice: 4_500 },
  { key: 'shampun', name: 'Shampun 400 ml', unit: 'dona', salePrice: 32_000, costPrice: 26_000 },
  { key: 'tishpasta', name: 'Tish pastasi', unit: 'dona', salePrice: 14_000, costPrice: 10_500 },
  { key: 'kukun', name: 'Kir yuvish kukuni 3 kg', unit: 'pachka', salePrice: 68_000, costPrice: 55_000 },
  { key: 'salfetka', name: 'Salfetka', unit: 'pachka', salePrice: 4_000, costPrice: 2_800 },
  { key: 'pechenye', name: 'Pechenye', unit: 'pachka', salePrice: 9_000, costPrice: 6_500 },
  { key: 'konfet', name: 'Konfet aralash', unit: 'pachka', salePrice: 22_000, costPrice: 16_000 },
  { key: 'limonad', name: 'Limonad 1,5 l', unit: 'dona', salePrice: 8_500, costPrice: 6_200 },
  { key: 'suv', name: 'Suv 5 l', unit: 'dona', salePrice: 7_000, costPrice: 4_800 },
  { key: 'chips', name: 'Chips', unit: 'dona', salePrice: 7_500, costPrice: 5_400 },
  { key: 'spagetti', name: 'Spagetti', unit: 'pachka', salePrice: 6_500, costPrice: 4_700 },
  { key: 'guruch5', name: 'Guruch (lazer) 5 kg', unit: 'pachka', salePrice: 78_000, costPrice: 65_000 },
  { key: 'qand', name: 'Qand', unit: 'kg', salePrice: 14_500, costPrice: 12_500 },
  { key: 'sut', name: 'Sut 1 l', unit: 'dona', salePrice: 11_000, costPrice: 9_000 },
  { key: 'tuxum', name: 'Tuxum (10 dona)', unit: 'pachka', salePrice: 28_000, costPrice: 23_000 },
  { key: 'non', name: 'Non', unit: 'dona', salePrice: 4_000, costPrice: 3_000 },
  { key: 'kolbasa', name: 'Kolbasa', unit: 'kg', salePrice: 78_000, costPrice: 66_000 },
  { key: 'sosiska', name: 'Sosiska', unit: 'pachka', salePrice: 24_000, costPrice: 19_000 },
  // Tan narxi yo'q (kirim yozilmagan): foydaga kirmaydi, "tan narxi yo'q" ko'rsatiladi
  { key: 'sirka', name: 'Sirka', unit: 'dona', salePrice: 5_000, costPrice: null, openingStock: 6 },
  { key: 'mayonez', name: 'Mayonez', unit: 'dona', salePrice: 12_000, costPrice: null, openingStock: 4 },
  // Sotuv narxi ham yo'q: savdoda narx qo'lda kiritiladi
  { key: 'aksiya', name: 'Aksiya to\'plami', unit: 'pachka', salePrice: null, costPrice: null },
];

export const EXTRA_CUSTOMERS = [
  { key: 'sardor', name: "Sardor do'koni (demo)" },
  { key: 'malika', name: 'Malika opa (demo)' },
  { key: 'bobur', name: 'Bobur savdo (demo)' },
  { key: 'nodira', name: 'Nodira kafe (demo)' },
  { key: 'jasur', name: 'Jasur aka (demo)' },
  { key: 'zilola', name: 'Zilola xonim (demo)' },
] as const;

export const EXTRA_SUPPLIERS = [
  /** Boshlang'ich qarz (ochilish qoldig'i) — to'qilgan summa */
  { key: 'rahim', name: 'Rahim aka (demo)', opening: 3_200_000 },
  { key: 'abbos', name: 'Abbosxon (demo)', opening: 0 },
] as const;

export interface ExtraPurchase {
  supplier: string;
  /** necha kun oldin */
  daysAgo: number;
  lines: readonly { product: string; qty: number; unitCost: number }[];
  /** Berilgan summa (0 = hammasi qarzga) */
  paid: number;
  method: 'naqd' | 'karta' | 'otkazma';
}

export const EXTRA_PURCHASES: readonly ExtraPurchase[] = [
  {
    supplier: 'rahim',
    daysAgo: 20,
    lines: [
      { product: 'sovun', qty: 200, unitCost: 4_500 },
      { product: 'shampun', qty: 60, unitCost: 26_000 },
      { product: 'tishpasta', qty: 100, unitCost: 10_500 },
      { product: 'kukun', qty: 30, unitCost: 55_000 },
    ],
    paid: 2_000_000,
    method: 'naqd',
  },
  {
    supplier: 'abbos',
    daysAgo: 12,
    lines: [
      { product: 'pechenye', qty: 150, unitCost: 6_500 },
      { product: 'konfet', qty: 80, unitCost: 16_000 },
      { product: 'limonad', qty: 120, unitCost: 6_200 },
      { product: 'suv', qty: 100, unitCost: 4_800 },
      { product: 'chips', qty: 200, unitCost: 5_400 },
      { product: 'non', qty: 100, unitCost: 3_000 },
      { product: 'kolbasa', qty: 20, unitCost: 66_000 },
      { product: 'sosiska', qty: 40, unitCost: 19_000 },
      { product: 'salfetka', qty: 100, unitCost: 2_800 },
    ],
    paid: 3_000_000,
    method: 'otkazma',
  },
  {
    supplier: 'rahim',
    daysAgo: 6,
    lines: [
      { product: 'spagetti', qty: 120, unitCost: 4_700 },
      { product: 'guruch5', qty: 40, unitCost: 65_000 },
      { product: 'qand', qty: 100, unitCost: 12_500 },
      { product: 'sut', qty: 60, unitCost: 9_000 },
      { product: 'tuxum', qty: 50, unitCost: 23_000 },
    ],
    paid: 1_500_000,
    method: 'karta',
  },
];

export interface ExtraSale {
  /** null = mijozsiz naqd savdo */
  customer: string | null;
  /** Necha SOAT oldin (bugungi savdolar uchun kichik son) */
  hoursAgo: number;
  lines: readonly [product: string, qty: number][];
  /** 'cash' = to'liq to'langan; 'debt' = hammasi qarzga; son = qisman to'langan summa */
  pay: 'cash' | 'debt' | number;
  method?: 'naqd' | 'karta' | 'otkazma';
}

const H = 24;
export const EXTRA_SALES: readonly ExtraSale[] = [
  { customer: null, hoursAgo: 1, lines: [['sovun', 5], ['non', 6], ['suv', 2]], pay: 'cash' },
  { customer: 'sardor', hoursAgo: 3, lines: [['pechenye', 20], ['konfet', 10], ['chips', 30]], pay: 'debt' },
  { customer: null, hoursAgo: 4, lines: [['sut', 4], ['tuxum', 2]], pay: 'cash' },
  { customer: 'malika', hoursAgo: 1 * H + 2, lines: [['shampun', 6], ['tishpasta', 12], ['kukun', 4]], pay: 150_000, method: 'naqd' },
  { customer: null, hoursAgo: 1 * H + 5, lines: [['limonad', 10], ['chips', 8]], pay: 'cash' },
  { customer: 'bobur', hoursAgo: 2 * H + 1, lines: [['guruch5', 6], ['qand', 20], ['spagetti', 24]], pay: 'debt' },
  { customer: 'nodira', hoursAgo: 2 * H + 6, lines: [['sut', 12], ['tuxum', 8], ['sosiska', 6]], pay: 'cash' },
  { customer: 'jasur', hoursAgo: 3 * H + 3, lines: [['kolbasa', 3], ['non', 20]], pay: 120_000, method: 'karta' },
  { customer: null, hoursAgo: 3 * H + 8, lines: [['sirka', 3], ['mayonez', 4]], pay: 'cash' },
  { customer: 'zilola', hoursAgo: 4 * H + 2, lines: [['sovun', 24], ['salfetka', 30], ['tishpasta', 10]], pay: 'debt' },
  { customer: 'jasur', hoursAgo: 5 * H + 4, lines: [['limonad', 30], ['suv', 25], ['chips', 40]], pay: 200_000, method: 'otkazma' },
  { customer: null, hoursAgo: 5 * H + 9, lines: [['non', 10], ['sut', 3]], pay: 'cash' },
  { customer: 'sardor', hoursAgo: 6 * H + 1, lines: [['kukun', 5], ['shampun', 8]], pay: 100_000, method: 'naqd' },
  { customer: 'malika', hoursAgo: 8 * H + 5, lines: [['konfet', 12], ['pechenye', 24]], pay: 'cash' },
  { customer: 'bobur', hoursAgo: 9 * H + 2, lines: [['qand', 15], ['guruch5', 3]], pay: 'cash' },
  { customer: null, hoursAgo: 10 * H + 6, lines: [['tishpasta', 4], ['sovun', 8]], pay: 'cash' },
  { customer: 'nodira', hoursAgo: 12 * H + 3, lines: [['tuxum', 10], ['sut', 10], ['kolbasa', 2]], pay: 'debt' },
];
