'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DEMO_MODE } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/client';
import { useTheme } from './ThemeProvider';

export const NAV: { href: string; label: string }[] = [
  { href: '/overview', label: "Umumiy ko'rinish" },
  { href: '/shops', label: "Do'konlar" },
  { href: '/funnel', label: 'Voronka' },
  { href: '/audit', label: 'Jurnal' },
];

export function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setChoice(resolved === 'dark' ? 'light' : 'dark')}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-surface text-sm text-fg hover:bg-subtle"
      aria-label={resolved === 'dark' ? "Yorug' rejim" : "Tungi rejim"}
      title={resolved === 'dark' ? "Yorug' rejim" : 'Tungi rejim'}
    >
      <span aria-hidden>{resolved === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

export async function signOut(): Promise<void> {
  if (!DEMO_MODE) {
    try {
      await getSupabase().auth.signOut();
    } catch {
      // Tarmoq xatosida ham login sahifasiga o'tiladi; proxy sessiyani qayta tekshiradi
    }
  }
}

/** Yuqori panel + menyu: kompyuterda chap tomonda emas, yuqorida (telefonda gorizontal aylantiriladi) */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      {DEMO_MODE && (
        <div className="bg-warn-bg px-4 py-1.5 text-center text-xs font-medium text-warn-fg">
          Demo rejimi: soxta ma&apos;lumot, Supabase&apos;ga ulanmagan
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6">
          <Link href="/overview" className="mr-auto text-base font-bold tracking-tight sm:mr-2">
            Hisobchi Go <span className="rounded-md bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-white">Admin</span>
          </Link>
          <nav aria-label="Asosiy menyu" className="order-last -mx-1 flex w-full min-w-0 gap-1 overflow-x-auto px-1 sm:order-none sm:w-auto sm:flex-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-medium ${active ? 'bg-subtle text-fg' : 'text-muted hover:bg-subtle hover:text-fg'}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg hover:bg-subtle disabled:opacity-60"
          >
            Chiqish
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
