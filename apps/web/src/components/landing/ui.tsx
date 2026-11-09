import Link from 'next/link';
import type { ReactNode } from 'react';

const BTN =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold transition-colors duration-150';

export function CtaPrimary({ href = '/register', children }: { href?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`${BTN} bg-emerald-700 text-white shadow-sm shadow-emerald-700/25 hover:bg-emerald-800 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400`}
    >
      {children}
    </Link>
  );
}

export function CtaSecondary({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${BTN} border border-line bg-surface text-fg hover:bg-subtle`}>
      {children}
    </Link>
  );
}

export function Section({
  id,
  title,
  lead,
  children,
  tone,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
  tone?: 'alt';
}) {
  return (
    <section id={id} className={tone === 'alt' ? 'border-y border-line bg-surface-2' : ''}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h2>
        {lead && <p className="mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-300">{lead}</p>}
        <div className="mt-8 sm:mt-10">{children}</div>
      </div>
    </section>
  );
}
