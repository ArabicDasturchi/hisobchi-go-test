import { BookOpen, LayoutDashboard, Package, Receipt, Settings, Sparkles, Truck, Users, Warehouse, type LucideIcon } from 'lucide-react';
import { uz } from '@/i18n/uz';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Faol deb hisoblanadigan qo'shimcha yo'l boshlanmalari (masalan, "Daftarlar" ham mijozlar, ham ta'minotchilar) */
  also?: readonly string[];
}

export interface NavGroup {
  label: string | null;
  items: readonly NavItem[];
}

const I = {
  dashboard: { href: '/dashboard', label: uz.nav.dashboard, icon: LayoutDashboard },
  sales: { href: '/sales', label: uz.nav.sales, icon: Receipt },
  drafts: { href: '/drafts', label: uz.nav.drafts, icon: Sparkles },
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
  { label: uz.nav.groupMain, items: [I.dashboard, I.sales, I.drafts] },
  { label: uz.nav.groupLedgers, items: [I.suppliers, I.customers] },
  { label: uz.nav.groupBase, items: [I.products, I.warehouse] },
];

export const SETTINGS_ITEM: NavItem = I.settings;

export const NAV_ITEMS: readonly NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), I.settings];

/** Telefonda pastki panel: Bosh sahifa, Savdolar, Daftarlar, Menyu (Menyu — tugma, AppShell qo'shadi) */
export const LEDGERS_ITEM: NavItem = { href: '/customers', label: uz.nav.ledgers, icon: BookOpen, also: ['/suppliers'] };
export const BOTTOM_ITEMS: readonly NavItem[] = [I.dashboard, I.sales, LEDGERS_ITEM];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isItemActive(pathname: string, item: NavItem): boolean {
  return isActive(pathname, item.href) || (item.also ?? []).some((h) => isActive(pathname, h));
}

/** Header'dagi sarlavha: aniq ichki sahifalar, aks holda bo'lim nomi */
export function pageTitle(pathname: string): string {
  if (pathname === '/sales/new') return uz.nav.newSale;
  if (/^\/sales\/[^/]+$/.test(pathname)) return 'Savdo tafsiloti';
  if (pathname === '/purchases/new') return 'Kirim yozish';
  if (pathname === '/dashboard/report') return uz.nav.report;
  if (/^\/customers\/[^/]+$/.test(pathname)) return 'Mijoz daftari';
  if (/^\/suppliers\/[^/]+$/.test(pathname)) return "Ta'minotchi daftari";
  return NAV_ITEMS.find((i) => isActive(pathname, i.href))?.label ?? uz.app.name;
}

/** Ichki sahifa bo'lsa — ota bo'lim (breadcrumb uchun) */
export function parentSection(pathname: string): NavItem | null {
  if (pathname === '/purchases/new') return I.suppliers;
  const item = NAV_ITEMS.find((i) => isActive(pathname, i.href));
  return item && item.href !== pathname ? item : null;
}
