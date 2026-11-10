'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Sahifa qidiruvi `?q=` da: PC da tepadagi qidiruv maydoni va telefonda sahifa ichidagi maydon bitta manba.
 * `replace` ishlatiladi (har harfda orqaga tarixi to'lmasin).
 */
export function usePageQuery(): [string, (v: string) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const q = params.get('q') ?? '';
  const set = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params.toString());
      if (v) next.set('q', v);
      else next.delete('q');
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [q, set];
}
