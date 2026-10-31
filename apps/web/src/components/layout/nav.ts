import { BarChart3, HandCoins, LayoutDashboard, Package, Receipt, Settings, Users, Wallet, type LucideIcon } from 'lucide-react';
import { uz } from '@/i18n/uz';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: readonly NavItem[];
}

const I = {
  dashboard: { href: '/dashboard', label: uz.nav.dashboard, icon: LayoutDashboard },
  sales: { href: '/sales', label: uz.nav.sales, icon: Receipt },
  payments: { href: '/payments', label: uz.nav.payments, icon: Wallet },
  debts: { href: '/debts', label: uz.nav.debts, icon: HandCoins },
  customers: { href: '/customers', label: uz.nav.customers, icon: Users },
  products: { href: '/products', label: uz.nav.products, icon: Package },
  reports: { href: '/reports', label: uz.nav.reports, icon: BarChart3 },
  settings: { href: '/settings', label: uz.nav.settings, icon: Settings },
} satisfies Record<string, NavItem>;

/** Sidebar bo'limlari (sozlamalar alohida — pastda) */
export const NAV_GROUPS: readonly NavGroup[] = [
  { label: null, items: [I.dashboard] },
  { label: 'Savdo va pul', items: [I.sales, I.payments, I.debts] },
  { label: "Ma'lumotnomalar", items: [I.customers, I.products] },
  { label: 'Tahlil', items: [I.reports] },
];

export const SETTINGS_ITEM: NavItem = I.settings;

export const NAV_ITEMS: readonly NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), I.settings];

/** Mobil pastki menyu: eng ko'p ishlatiladiganlar (o'rtada "Yangi savdo") */
export const BOTTOM_ITEMS: readonly NavItem[] = [I.dashboard, I.sales, I.debts];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Header'dagi sarlavha: aniq ichki sahifalar, aks holda bo'lim nomi */
export function pageTitle(pathname: string): string {
  if (pathname === '/sales/new') return uz.nav.newSale;
  if (/^\/sales\/[^/]+$/.test(pathname)) return 'Savdo tafsiloti';
  if (/^\/customers\/[^/]+$/.test(pathname)) return 'Mijoz tafsiloti';
  return NAV_ITEMS.find((i) => isActive(pathname, i.href))?.label ?? uz.app.name;
}

/** Ichki sahifa bo'lsa — ota bo'lim (breadcrumb uchun) */
export function parentSection(pathname: string): NavItem | null {
  const item = NAV_ITEMS.find((i) => isActive(pathname, i.href));
  return item && item.href !== pathname ? item : null;
}
