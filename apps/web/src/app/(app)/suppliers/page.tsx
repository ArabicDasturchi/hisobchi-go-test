'use client';
import { PackagePlus, Plus, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PartnerList } from '@/components/partners/PartnerList';
import { usePageQuery } from '@/components/layout/pageQuery';
import { useToast } from '@/components/ui/Toast';
import { updateSupplier } from '@/lib/data/purchases';
import { getSupabase } from '@/lib/supabase/client';
import { SupplierFormModal } from '@/components/forms/SupplierFormModal';
import { Money } from '@/components/shared';
import { useShop } from '@/components/ShopDataProvider';
import { useBooks } from '@/components/useBooks';
import { Alert, Button, Card, EmptyState, ErrorState, LinkButton, PageHeader, SearchInput, Segmented, Select, TableSkeleton } from '@/components/ui/primitives';
import { filterPartners, type ListFilter, type ListSort } from '@/lib/ledgerView';
import { can } from '@/lib/permissions';
import { safeSupplierBook } from '@/lib/supplierBook';
import { uz } from '@/i18n/uz';

/** Ta'minotchilar daftari: «Mening qarzim» kartasi + ro'yxat; ta'minotchini bosganda uning varag'i (/suppliers/[id]) */
export default function SuppliersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useBooks();
  const { membership, shopId } = useShop();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = usePageQuery();
  const [filter, setFilter] = useState<ListFilter>('all');
  const [sort, setSort] = useState<ListSort>('debt');
  const canManage = can(membership.role, 'partner.manage');
  const notesById = useMemo(() => new Map((data?.suppliers ?? []).map((x) => [x.id, x.notes ?? ''])), [data]);

  const book = useMemo(() => (data ? safeSupplierBook(data) : null), [data]);
  const rows = useMemo(() => (book ? filterPartners(book.rows, { query, filter, sort }) : []), [book, query, filter, sort]);

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
        description="Har ta'minotchi — bitta daftar varag‘i: kirim, to‘lov va qarzingiz shu yerda."
        actions={
          <>
            <LinkButton href="/dashboard?amal=kirim" variant="outline" icon={<PackagePlus className="h-4 w-4" />}>
              Kirim yozish
            </LinkButton>
            {canManage && (
              <Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
                Ta&apos;minotchi qo&apos;shish
              </Button>
            )}
          </>
        }
      />

      {book && !book.ok && (
        <Alert tone="red" title="Hisob mos kelmadi" className="mb-3">
          {book.message}
        </Alert>
      )}
      {book?.ok && (
        <Card className="mb-3 grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0" data-testid="my-debt-card">
          <div className="p-4">
            <p className="text-sm font-medium text-muted">Mening qarzim</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              <Money value={book.card.iOwe} />
            </p>
          </div>
          <div className="p-4">
            <p className="text-sm font-medium text-muted">Qarzim bor ta&apos;minotchilar</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-fg">{book.card.creditorCount} ta</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Nom yoki telefon" className="lg:max-w-sm lg:flex-1" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Segmented<ListFilter>
              ariaLabel="Filtr"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'debtors', label: 'Qarzim bor' },
                { value: 'all', label: 'Hammasi' },
                { value: 'archive', label: 'Arxiv' },
              ]}
            />
            <Select aria-label="Saralash" value={sort} onChange={(e) => setSort(e.target.value as ListSort)} className="h-9 w-auto py-0 text-xs sm:text-sm">
              <option value="debt">Qarz kattasi</option>
              <option value="recent">Oxirgi harakat</option>
            </Select>
          </div>
        </div>
        {loading && !data ? (
          <TableSkeleton />
        ) : (data?.suppliers.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Truck className="h-5 w-5" />}
            title="Birinchi ta‘minotchini qo‘shing"
            description="Boshlang‘ich qarzni kiriting, so‘ng kirim va to‘lovlarni varaqqa yozing."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
                  Ta&apos;minotchi qo&apos;shish
                </Button>
              ) : undefined
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" description={filter === 'debtors' && !query ? "Hozir qarzingiz bor ta'minotchi yo'q." : "Qidiruv yoki filterni o'zgartirib ko'ring."} />
        ) : (
          <PartnerList
            rows={rows}
            notes={notesById}
            base="/suppliers"
            canManage={canManage}
            balanceHeader="Qarzim"
            onSave={async (id, v) => {
              const sup = data?.suppliers.find((x) => x.id === id);
              await updateSupplier(getSupabase(), shopId, id, { name: v.name, phone: sup?.phone ?? null, notes: v.notes });
              await reload();
              toast.success("Ta'minotchi yangilandi.");
            }}
          />
        )}
      </Card>
      <SupplierFormModal open={adding} onClose={() => setAdding(false)} supplier={null} onSaved={(s) => { void reload(); router.push(`/suppliers/${s.id}`); }} />
    </>
  );
}
