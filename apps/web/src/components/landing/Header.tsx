import Link from 'next/link';
import { Brand } from './Brand';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Hisobchi Go — bosh sahifa">
          <Brand />
        </Link>
        <nav className="flex items-center gap-1.5" aria-label="Asosiy">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-subtle hover:text-fg">
            Kirish
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            Boshlash
          </Link>
        </nav>
      </div>
    </header>
  );
}
