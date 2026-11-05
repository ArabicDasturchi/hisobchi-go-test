'use client';
import { Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Money } from '@/components/shared';
import { useBooks } from '@/components/useBooks';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, SearchInput, Segmented, TableSkeleton } from '@/components/ui/primitives';
import { stockView } from '@/lib/data/books';
import { formatQty } from '@/lib/money';
import { uz } from '@/i18n/uz';

type Filter = 'active' | 'negative' | 'all';
const norm = (s: string) => s.toLocaleLowerCase('uz').trim();

/** Ombor — faqat ko'rish. Kirim va tuzatish mobil ilovada kiritiladi. */
export default function WarehousePage() {
  const { data, error, loading, reload } = useBooks();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');

  const rows = useMemo(() => {
    const q = norm(query);
    return (data?.stock ?? [])
      .map((i) => ({ i, v: stockView(i) }))
      .filter(({ i, v }) => (filter === 'all' ? true : filter === 'negative' ? v.level === 'negative' : i.is_active))
      .filter(({ i }) => !q || norm(i.name).includes(q));
  }, [data, query, filter]);

  if (error && !data) {
    return (
      <>
        <PageHeader title={uz.nav.warehouse} />
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }
  const negative = (data?.stock ?? []).filter((i) => stockView(i).level === 'negative').length;

  return (
    <>
      <PageHeader title={uz.nav.warehouse} description="Qoldiq = kirim − savdo ± tuzatish. Kirim va tuzatish mobil ilovada kiritiladi." />
      {negative > 0 && (
        <Alert tone="amber" className="mb-4">
          {negative} ta tovarning qoldig&apos;i manfiy: kirim yozilmagan bo&apos;lishi mumkin.
        </Alert>
      )}
      <Card>
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Tovar nomi" className="lg:w-72" />
          <Segmented<Filter>
            ariaLabel="Filtr"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Faol' },
              { value: 'negative', label: 'Manfiy qoldiq' },
              { value: 'all', label: 'Arxiv bilan' },
            ]}
          />
        </div>
        {loading && !data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Warehouse className="h-5 w-5" />} title="Tovar topilmadi" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-surface-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Tovar</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qoldiq</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tan narx</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sotuv narxi</th>
                  <th className="px-4 py-2.5 text-right font-medium">Birlik foydasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ i, v }) => (
                  <tr key={i.product_id} className={v.level === 'negative' ? 'bg-amber-50 dark:bg-amber-500/10' : undefined}>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {i.name} {!i.is_active && <Badge>arxiv</Badge>}
                    </td>
                    <td className={`tabular px-4 py-2.5 text-right font-semibold ${v.level === 'negative' ? 'text-amber-700 dark:text-amber-400' : 'text-fg'}`}>
                      {formatQty(i.qty_milli)} {uz.units[i.unit]}
                    </td>
                    <td className="px-4 py-2.5 text-right">{i.cost_price === null ? <span className="text-muted">—</span> : <Money value={i.cost_price} />}</td>
                    <td className="px-4 py-2.5 text-right">{i.sale_price === null ? <span className="text-muted">—</span> : <Money value={i.sale_price} />}</td>
                    <td className="px-4 py-2.5 text-right">{v.margin === null ? <span className="text-muted">—</span> : <Money value={v.margin} signed className={v.margin < 0n ? 'text-rose-600' : undefined} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
