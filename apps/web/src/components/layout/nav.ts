import { BarChart3, BookOpen, Boxes, LayoutDashboard, MoreHorizontal, Package, Receipt, Settings, ShoppingBasket, Truck, Users, Warehouse, type LucideIcon } from 'lucide-react';
import { uz } from '@/i18n/uz';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Faol deb hisoblanadigan qo'shimcha yo'l boshlanmalari (masalan, "Daftarlar" ham mijozlar, ham ta'minotchilar) */
  also?: readonly string[];
  /** Faqat aynan shu yo'lda faol (Boshqaruv paneli `/dashboard/report` da faol emas) */
  exact?: boolean;
  /** Telefonda pastki menyu uchun qisqa nom */
  short?: string;
}

export interface NavGroup {
  label: string | null;
  items: readonly NavItem[];
}

const I = {
  dashboard: { href: '/dashboard', label: uz.nav.dashboard, icon: LayoutDashboard, exact: true, short: 'Panel' },
  report: { href: '/dashboard/report', label: uz.nav.reports, icon: BarChart3 },
  sales: { href: '/sales', label: uz.nav.sales, icon: Receipt },
  // F2: "Qoralamalar" → "Savat" (yarim qolgan savdolar + AI qoralamalari)
  drafts: { href: '/drafts', label: uz.nav.drafts, icon: ShoppingBasket },
  suppliers: { href: '/suppliers', label: uz.nav.suppliers, icon: Truck },
  customers: { href: '/customers', label: uz.nav.customers, icon: Users },
  products: { href: '/products', label: uz.nav.products, icon: Package },
  warehouse: { href: '/warehouse', label: uz.nav.warehouse, icon: Warehouse },
  settings: { href: '/settings', label: uz.nav.settings, icon: Settings },
} satisfies Record<string, NavItem>;

/**
 * Yon menyu — aynan shu tartib, boshqa band yo'q. To'lovlar, Qarzlar, Kirim/Chiqim daftari va Hisobotlar alohida
 * bo'lim emas: ular daftar (mijoz/ta'minotchi varag'i), ombor va Bosh sahifa ichida (qarorlar: docs/QARORLAR.md).
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: uz.nav.groupMain, items: [I.dashboard, I.sales, I.drafts, I.report] },
  { label: uz.nav.groupLedgers, items: [I.suppliers, I.customers] },
  { label: uz.nav.groupBase, items: [I.products, I.warehouse] },
];

export const SETTINGS_ITEM: NavItem = I.settings;

export const NAV_ITEMS: readonly NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), I.settings];

/**
 * Telefonda pastki menyu (boshqa sahifalarda; panelda pastki menyu yo'q, tepada hamburger):
 * Panel, Savdolar, Daftarlar, Baza, Yana. Moslik: Mijozlar/Ta'minotchilar -> Daftarlar, Mahsulotlar/Ombor -> Baza,
 * Savat/Hisobotlar/Sozlamalar -> Yana.
 */
export const LEDGERS_ITEM: NavItem = { href: '/customers', label: uz.nav.ledgers, icon: BookOpen, also: ['/suppliers'] };
export const BASE_ITEM: NavItem = { href: '/products', label: uz.nav.groupBase, icon: Boxes, also: ['/warehouse'] };
export const MORE_ITEM: NavItem = { href: '/drafts', label: uz.nav.more, icon: MoreHorizontal, also: ['/dashboard/report', '/settings'] };
export const BOTTOM_ITEMS: readonly NavItem[] = [I.dashboard, I.sales, LEDGERS_ITEM, BASE_ITEM];
/** "Yana" varag'idagi bandlar */
export const MORE_LINKS: readonly NavItem[] = [I.drafts, I.report, I.settings];

/** Kiritish oynasi faqat Boshqaruv panelida */
export const hasComposer = (pathname: string) => pathname === '/dashboard';

/** PC tepasidagi qidiruv maydoni: sahifaga mos yozuv; Hisobotlar, Sozlamalar va panelda qidiruv yo'q */
export function searchPlaceholder(pathname: string): string | null {
  if (pathname === '/products') return 'Mahsulot qidirish';
  if (pathname === '/warehouse') return 'Tovar qidirish';
  if (pathname === '/drafts') return 'Qoralama qidirish';
  if (pathname === '/customers' || /^\/customers\/[^/]+$/.test(pathname)) return 'Mijoz qidirish';
  if (pathname === '/suppliers' || /^\/suppliers\/[^/]+$/.test(pathname)) return "Ta'minotchi qidirish";
  if (pathname === '/sales') return "Raqam yoki mijoz bo'yicha qidirish";
  return null;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return isActive(pathname, item.href) || (item.also ?? []).some((h) => isActive(pathname, h));
}

/** Header'dagi sarlavha: aniq ichki sahifalar, aks holda bo'lim nomi */
export function pageTitle(pathname: string): string {
  if (pathname === '/sales/new') return uz.nav.newSale;
  if (/^\/sales\/[^/]+$/.test(pathname)) return 'Savdo tafsiloti';
  if (pathname === '/purchases/new') return 'Kirim yozish';
  if (pathname === '/dashboard/report') return uz.nav.reports;
  if (pathname === '/settings/history') return "O'zgarishlar tarixi";
  if (/^\/customers\/[^/]+$/.test(pathname)) return 'Mijoz daftari';
  if (/^\/suppliers\/[^/]+$/.test(pathname)) return "Ta'minotchi daftari";
  return NAV_ITEMS.find((i) => isItemActive(pathname, i))?.label ?? uz.app.name;
}

/** Ichki sahifa bo'lsa — ota bo'lim (breadcrumb uchun) */
export function parentSection(pathname: string): NavItem | null {
  if (pathname === '/purchases/new') return I.suppliers;
  const item = NAV_ITEMS.find((i) => isItemActive(pathname, i));
  return item && item.href !== pathname ? item : null;
}
