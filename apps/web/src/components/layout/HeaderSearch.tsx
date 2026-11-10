'use client';
import { Search, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { searchPlaceholder } from './nav';
import { usePageQuery } from './pageQuery';

function Field({ placeholder }: { placeholder: string }) {
  const [q, setQ] = usePageQuery();
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-sm text-fg outline-none placeholder:text-muted focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
      />
      {q && (
        <button type="button" onClick={() => setQ('')} aria-label="Qidiruvni tozalash" className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** PC: tepada sahifaga mos qidiruv (Hisobotlar, Sozlamalar va panelda yo'q) */
export function HeaderSearch() {
  const placeholder = searchPlaceholder(usePathname());
  if (!placeholder) return null;
  return (
    <Suspense>
      <Field placeholder={placeholder} />
    </Suspense>
  );
}
