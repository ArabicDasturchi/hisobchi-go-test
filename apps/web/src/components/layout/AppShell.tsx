'use client';
import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, Store, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { uz } from '@/i18n/uz';
import { useAuth } from '../AuthProvider';
import { Logo, LogoMark } from '../Logo';
import { useShop } from '../ShopDataProvider';
import { Avatar, cn } from '../ui/primitives';
import { BOTTOM_ITEMS, isActive, NAV_GROUPS, parentSection, pageTitle, SETTINGS_ITEM, type NavItem } from './nav';
import { SyncIndicator } from './SyncIndicator';
import { ThemeToggle } from './ThemeToggle';

const COLLAPSE_KEY = 'hg-sidebar-collapsed';

/** Ism kiritilgan bo'lsa — ism, aks holda email */
function displayName(user: ReturnType<typeof useAuth>['user']): string {
  const name = user?.user_metadata?.full_name;
  return typeof name === 'string' && name.trim() ? name : (user?.email ?? '');
}

function NavLink({ item, compact, onNavigate }: { item: NavItem; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { pendingDrafts } = useShop();
  const active = isActive(pathname, item.href);
  const badge = item.href === '/drafts' ? pendingDrafts : 0;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-[13px] font-medium transition-colors',
        compact ? 'h-9 w-9 justify-center' : 'h-8 gap-2.5 px-2.5',
        active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'text-muted hover:bg-subtle hover:text-fg',
      )}
    >
      {active && !compact && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-500" aria-hidden />}
      <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted group-hover:text-fg')} />
      {!compact && <span className="truncate">{item.label}</span>}
      {badge > 0 && (
        <span
          className={cn(
            'rounded-full bg-amber-500 text-[10px] font-semibold leading-none text-white',
            compact ? 'absolute right-0.5 top-0.5 h-2 w-2' : 'ml-auto px-1.5 py-1',
          )}
          aria-label={`${badge} ta tasdiqlanmagan qoralama`}
        >
          {compact ? '' : badge}
        </span>
      )}
    </Link>
  );
}

function NavSections({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav className={cn('flex flex-col', compact ? 'items-center gap-1' : 'gap-3')} aria-label="Asosiy menyu">
      {NAV_GROUPS.map((g, gi) => (
        <div key={gi} className={cn('flex flex-col gap-0.5', compact && 'items-center')}>
          {g.label && !compact && <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/80">{g.label}</p>}
          {g.label && compact && gi > 0 && <span className="my-1 h-px w-6 bg-line" aria-hidden />}
          {g.items.map((item) => (
            <NavLink key={item.href} item={item} compact={compact} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function ShopChip({ compact }: { compact?: boolean }) {
  const { membership } = useShop();
  if (compact) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-muted" title={membership.shop.name}>
        <Store className="h-4 w-4" />
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <Store className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-fg">{membership.shop.name}</p>
        <p className="text-[11px] text-muted">{uz.roles[membership.role]}</p>
      </div>
    </div>
  );
}

function NewSaleLink({ compact }: { compact?: boolean }) {
  return (
    <Link
      href="/sales/new"
      title={compact ? uz.nav.newSale : undefined}
      aria-label={compact ? uz.nav.newSale : undefined}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400',
        compact ? 'h-9 w-9' : 'h-9 px-3',
      )}
    >
      <Plus className="h-4 w-4" />
      {!compact && uz.nav.newSale}
    </Link>
  );
}

/** Profil menyusi: ism/email, sozlamalar, chiqish (faqat haqiqiy amallar) */
function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = displayName(user);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profil menyusi"
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors hover:bg-subtle"
      >
        <Avatar name={name || '?'} className="h-7 w-7 text-[10px]" />
        <span className="hidden max-w-[160px] truncate text-[13px] font-medium text-fg xl:inline">{name}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-60 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[13px] font-semibold text-fg">{name}</p>
            {user?.email && user.email !== name && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          <div className="p-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-fg hover:bg-subtle"
            >
              <Settings className="h-4 w-4 text-muted" /> {uz.nav.settings}
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await signOut();
              }}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut className="h-4 w-4" /> {uz.nav.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobil: chap tomondan chiquvchi to'liq menyu */
function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signOut } = useAuth();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[80%] max-w-[280px] animate-slide-in flex-col border-r border-line bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-3 flex items-center justify-between px-1">
          <Logo />
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Menyuni yopish">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ShopChip />
        <div className="mt-3">
          <NewSaleLink />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavSections onNavigate={onClose} />
          <div className="mt-3 border-t border-line pt-3">
            <NavLink item={SETTINGS_ITEM} onNavigate={onClose} />
          </div>
        </div>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <SyncIndicator />
          <p className="truncate px-1 text-xs text-muted">{displayName(user)}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" />
            {uz.nav.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { pendingDrafts } = useShop();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn('flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}
      >
        <item.icon className="h-5 w-5" />
        {item.label}
      </Link>
    );
  };
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Pastki menyu">
      <div className="mx-auto flex max-w-lg items-stretch">
        {BOTTOM_ITEMS.slice(0, 2).map(link)}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/sales/new"
            className="-mt-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 dark:bg-emerald-500 dark:text-emerald-950"
            aria-label={uz.nav.newSale}
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
        {BOTTOM_ITEMS.slice(2).map(link)}
        <button type="button" onClick={onMenu} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-muted">
          <span className="relative">
            <Menu className="h-5 w-5" />
            {pendingDrafts > 0 && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-500" aria-label={`${pendingDrafts} ta tasdiqlanmagan qoralama`} />}
          </span>
          {uz.nav.menu}
        </button>
      </div>
    </nav>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const { membership } = useShop();
  const parent = parentSection(pathname);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <span className="hidden truncate text-muted lg:inline">{membership.shop.name}</span>
      <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted/60 lg:block" aria-hidden />
      {parent && (
        <>
          <Link href={parent.href} className="truncate text-muted hover:text-fg">
            {parent.label}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" aria-hidden />
        </>
      )}
      <span className="truncate font-semibold text-fg">{pageTitle(pathname)}</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Sahifa almashganda drawer yopiladi
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  // Desktop sidebar holati shu qurilmada eslab qolinadi (SSR bilan mos bo'lishi uchun mount'dan keyin o'qiladi)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage faqat mount'dan keyin mavjud
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      // saqlash mavjud emas — standart holat
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // e'tiborsiz
      }
      return !c;
    });
  };

  return (
    <div className="min-h-dvh">
      <a href="#main" className="no-print sr-only z-[70] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Asosiy mazmunga o&apos;tish
      </a>

      {/* Desktop (≥1024): to'liq yoki yig'ilgan sidebar */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-150 lg:flex',
          collapsed ? 'w-16 items-center px-2' : 'w-[232px] px-3',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'px-1')}>
          <Link href="/dashboard" aria-label="Bosh sahifa">
            {collapsed ? <LogoMark className="h-8 w-8" /> : <Logo />}
          </Link>
        </div>
        <ShopChip compact={collapsed} />
        <div className="mt-3">
          <NewSaleLink compact={collapsed} />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavSections compact={collapsed} />
        </div>
        <div className={cn('flex flex-col gap-0.5 border-t border-line py-2.5', collapsed && 'items-center')}>
          <NavLink item={SETTINGS_ITEM} compact={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Menyuni kengaytirish' : "Menyuni yig'ish"}
            title={collapsed ? 'Menyuni kengaytirish' : "Menyuni yig'ish"}
            className={cn('flex items-center rounded-lg text-[13px] text-muted transition-colors hover:bg-subtle hover:text-fg', collapsed ? 'h-9 w-9 justify-center' : 'h-8 gap-2.5 px-2.5')}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Menyuni yig'ish"}
          </button>
        </div>
      </aside>

      {/* Planshet (768–1023): ixcham ikonkali menyu */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center border-r border-line bg-surface px-2 md:flex lg:hidden">
        <div className="flex h-14 shrink-0 items-center">
          <Link href="/dashboard" aria-label="Bosh sahifa">
            <LogoMark className="h-8 w-8" />
          </Link>
        </div>
        <NewSaleLink compact />
        <div className="mt-3 flex-1 overflow-y-auto">
          <NavSections compact />
        </div>
        <div className="border-t border-line py-2.5">
          <NavLink item={SETTINGS_ITEM} compact />
        </div>
      </aside>

      <div className={cn('transition-[padding] duration-150 md:pl-16', collapsed ? 'lg:pl-16' : 'lg:pl-[232px]')}>
        <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:px-4 lg:px-6">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg md:hidden" aria-label="Menyuni ochish">
              <Menu className="h-5 w-5" />
            </button>
            <div className="md:hidden">
              <LogoMark className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <Breadcrumb />
            </div>
            <div className="flex items-center gap-1">
              <div className="hidden sm:block">
                <SyncIndicator />
              </div>
              <div className="sm:hidden">
                <SyncIndicator compact />
              </div>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-3 pb-24 pt-4 outline-none sm:px-4 md:pb-8 lg:px-6">
          {children}
        </main>
      </div>

      <BottomNav onMenu={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={closeDrawer} />
    </div>
  );
}
