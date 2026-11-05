'use client';
import { Archive, ArchiveRestore, PackagePlus, Pencil, Plus, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SupplierFormModal } from '@/components/forms/SupplierFormModal';
import { Money } from '@/components/shared';
import { useBooks } from '@/components/useBooks';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LinkButton, PageHeader, SearchInput, Segmented, TableSkeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useShop } from '@/components/ShopDataProvider';
import { supplierTotals, type Supplier } from '@/lib/data/books';
import { setSupplierActive } from '@/lib/data/purchases';
import { errorMessage } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';
import { uz } from '@/i18n/uz';

type Filter = 'active' | 'debt' | 'all';
const norm = (s: string) => s.toLocaleLowerCase('uz').trim();

/** Ta'minotchilar: qo'shish, tahrirlash, arxivlash, boshlang'ich qarz. Qarz = kirimlar (ochilish qoldig'i ham) − to'lovlar (bekor qilinganlarsiz). */
export default function SuppliersPage() {
  const { data, error, loading, reload } = useBooks();
  const { shopId } = useShop();
  const toast = useToast();
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined); // undefined = yopiq, null = yangi
  const [actionError, setActionError] = useState<string | null>(null);
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

  async function toggleActive(s: Supplier) {
    setActionError(null);
    try {
      await setSupplierActive(getSupabase(), shopId, s.id, !s.is_active);
      toast.success(s.is_active ? `«${s.name}» arxivlandi.` : `«${s.name}» qaytarildi.`);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

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
      <PageHeader
        title={uz.nav.suppliers}
        description="Ta'minotchi qo'shing, boshlang'ich qarzni kiriting, kirim yozing. Qarz kirimlardan o'zi hisoblanadi."
        actions={
          <>
            <LinkButton href="/purchases/new" variant="outline" icon={<PackagePlus className="h-4 w-4" />}>
              Kirim yozish
            </LinkButton>
            <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
              Ta&apos;minotchi qo&apos;shish
            </Button>
          </>
        }
      />
      {actionError && (
        <Alert tone="red" className="mb-3">
          {actionError}
        </Alert>
      )}
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
          <EmptyState icon={<Truck className="h-5 w-5" />} title="Ta'minotchi topilmadi" description="«Ta'minotchi qo'shish» tugmasi bilan birinchisini kiriting." />
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
                  <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Amallar</span></th>
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        {s.is_active && (
                          <LinkButton href={`/purchases/new?supplier=${s.id}`} size="sm" variant="outline">
                            Kirim
                          </LinkButton>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => setEditing(s)} aria-label={`${s.name}ni tahrirlash`} title="Tahrirlash">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => void toggleActive(s)} aria-label={s.is_active ? `${s.name}ni arxivlash` : `${s.name}ni qaytarish`} title={s.is_active ? 'Arxivlash' : 'Qaytarish'}>
                          {s.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SupplierFormModal open={editing !== undefined} onClose={() => setEditing(undefined)} supplier={editing ?? null} onSaved={() => void reload()} />
    </>
  );
}
