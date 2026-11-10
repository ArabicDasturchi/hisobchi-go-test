'use client';
import Link from 'next/link';
import { cn } from '@/components/ui/primitives';

/** Telefonda "Baza" ichidagi bo'limlar: Mahsulotlar | Ombor (PC da chap menyu bor) */
export function BaseTabs({ current }: { current: 'products' | 'warehouse' }) {
  const item = (href: string, key: 'products' | 'warehouse', label: string) => (
    <Link
      key={key}
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={cn('flex min-h-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-medium', current === key ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-muted')}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Baza bo'limlari" className="mb-3 flex w-fit gap-1 rounded-full border border-line bg-surface p-1 md:hidden">
      {item('/products', 'products', 'Mahsulotlar')}
      {item('/warehouse', 'warehouse', 'Ombor')}
    </nav>
  );
}
