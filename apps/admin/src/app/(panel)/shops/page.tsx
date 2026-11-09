'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StageBadge, StaleBadge } from '@/components/badges';
import { Button, Card, EmptyState, ErrorBox, LoadingBlock, PageTitle } from '@/components/ui';
import { formatCount, formatDate, timeAgo } from '@/lib/format';
import type { AdminShopRow, ShopsSort } from '@/lib/types';
import { useAsync } from '@/lib/useApi';

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Owner({ row }: { row: AdminShopRow }) {
  return (
    <>
      <span className="block font-medium">{row.owner_name ?? '—'}</span>
      <span className="block text-xs text-muted [overflow-wrap:anywhere]">{row.owner_email ?? ''}</span>
    </>
  );
}

export default function ShopsPage() {
  const [input, setInput] = useState('');
  const search = useDebounced(input.trim(), 300);
  const [sort, setSort] = useState<ShopsSort>('activity');
  const [page, setPage] = useState(0);

  // Qidiruv yoki tartib o'zgarsa birinchi sahifaga qaytish (hodisa ichida, effektda emas)
  const onSearch = (v: string) => {
    setInput(v);
    setPage(0);
  };
  const onSort = (v: ShopsSort) => {
    setSort(v);
    setPage(0);
  };

  const { data, error, loading, reload } = useAsync(
    (api) => api.shops({ search, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [search, sort, page],
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageTitle sub="Faqat sonlar va holatlar. Mijoz, ta'minotchi va summa ma'lumotlari ko'rsatilmaydi.">Do&apos;konlar</PageTitle>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="block flex-1">
          <span className="sr-only">Qidiruv</span>
          <input
            type="search"
            value={input}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Do'kon nomi, egasining ismi yoki emaili"
            className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg"
          />
        </label>
        <div role="group" aria-label="Tartiblash" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {([['activity', 'Oxirgi faollik'], ['new', 'Yangi ochilgan']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => onSort(value)}
              className={`min-h-9 rounded-lg px-3 text-sm font-medium ${sort === value ? 'bg-accent text-white' : 'text-muted hover:bg-subtle'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <LoadingBlock rows={4} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !error && data.total === 0 && (
        <EmptyState title={search ? 'Hech narsa topilmadi' : "Hali do'kon yo'q"} hint={search ? "Boshqa so'z bilan qidirib ko'ring." : "Birinchi do'kon yaratilgach, shu yerda ko'rinadi."} />
      )}

      {data && !error && data.total > 0 && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          {/* Kompyuter: jadval */}
          <Card className="hidden overflow-x-auto p-0 sm:block sm:p-0">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Do&apos;kon</th>
                  <th className="px-4 py-3 font-semibold">Egasi</th>
                  <th className="px-4 py-3 font-semibold">Ochilgan</th>
                  <th className="px-4 py-3 font-semibold">Oxirgi faollik</th>
                  <th className="px-4 py-3 text-right font-semibold">Tovar</th>
                  <th className="px-4 py-3 text-right font-semibold">Mijoz</th>
                  <th className="px-4 py-3 text-right font-semibold">Savdo</th>
                  <th className="px-4 py-3 font-semibold">Bosqich</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className={`border-b border-line last:border-0 hover:bg-subtle ${r.is_stale ? 'bg-warn-bg/40' : ''}`}>
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/shops/${r.id}`} className="underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Owner row={r} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="block">{timeAgo(r.last_activity_at)}</span>
                      <StaleBadge stale={r.is_stale} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCount(r.products)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCount(r.customers)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCount(r.sales)}</td>
                    <td className="px-4 py-3">
                      <StageBadge stage={r.stage} short />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Telefon: kartalar */}
          <ul className="space-y-3 sm:hidden">
            {data.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/shops/${r.id}`} className={`block rounded-2xl border border-line p-4 ${r.is_stale ? 'bg-warn-bg/40' : 'bg-surface'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-semibold">{r.name}</span>
                    <StageBadge stage={r.stage} short />
                  </div>
                  <div className="mt-1 text-sm">
                    <Owner row={r} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>Ochilgan {formatDate(r.created_at)}</span>
                    <span>{timeAgo(r.last_activity_at)}</span>
                    <StaleBadge stale={r.is_stale} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                    <span className="rounded-lg bg-subtle py-1.5"><b className="tabular-nums">{formatCount(r.products)}</b> <span className="text-muted">tovar</span></span>
                    <span className="rounded-lg bg-subtle py-1.5"><b className="tabular-nums">{formatCount(r.customers)}</b> <span className="text-muted">mijoz</span></span>
                    <span className="rounded-lg bg-subtle py-1.5"><b className="tabular-nums">{formatCount(r.sales)}</b> <span className="text-muted">savdo</span></span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Jami {formatCount(data.total)} ta · {page + 1}/{pages} sahifa
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Oldingi
              </Button>
              <Button variant="ghost" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
