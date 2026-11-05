'use client';
import { Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Money } from '@/components/shared';
import { useBooks } from '@/components/useBooks';
import { Badge, Card, EmptyState, ErrorState, PageHeader, SearchInput, Segmented, TableSkeleton } from '@/components/ui/primitives';
import { supplierTotals } from '@/lib/data/books';
import { uz } from '@/i18n/uz';

type Filter = 'active' | 'debt' | 'all';
const norm = (s: string) => s.toLocaleLowerCase('uz').trim();

/** Ta'minotchilar — faqat ko'rish. Qarz = kirimlar − to'lovlar (bekor qilinganlarsiz). */
export default function SuppliersPage() {
  const { data, error, loading, reload } = useBooks();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');

  const totals = useMemo(() => (data ? supplierTotals(data) : new Map()), [data]);
  const rows = useMemo(() => {
    const q = norm(query);
    return (data?.suppliers ?? [])
      .map((s) => ({ s, t: totals.get(s.id) ?? { goods: 0n, paid: 0n, outstanding: 0n } }))
      .filter(({ s, t }) => (filter === 'all' ? true : filter === 'debt' ? t.outstanding > 0n : s.is_active))
      .filter(({ s }) => !q || norm(s.name).includes(q) || (s.phone ?? '').includes(query.trim()));
  }, [data, totals, query, filter]);

  if (error && !data) {
    return (
      <>
        <PageHeader title={uz.nav.suppliers} />
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={uz.nav.suppliers} description="Ta'minotchi va kirim mobil ilovada kiritiladi; bu yerda faqat ko'rish." />
      <Card>
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Nom yoki telefon" className="lg:w-72" />
          <Segmented<Filter>
            ariaLabel="Filtr"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Faol' },
              { value: 'debt', label: 'Qarzimiz bor' },
              { value: 'all', label: 'Arxiv bilan' },
            ]}
          />
        </div>
        {loading && !data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Truck className="h-5 w-5" />} title="Ta'minotchi topilmadi" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-surface-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Ta&apos;minotchi</th>
                  <th className="px-4 py-2.5 font-medium">Telefon</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tovar (kirim)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Berildi</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ostatka (qarzimiz)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ s, t }) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {s.name} {!s.is_active && <Badge>arxiv</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{s.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right"><Money value={t.goods} /></td>
                    <td className="px-4 py-2.5 text-right"><Money value={t.paid} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Money value={t.outstanding} className={t.outstanding > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted'} />
                    </td>
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
