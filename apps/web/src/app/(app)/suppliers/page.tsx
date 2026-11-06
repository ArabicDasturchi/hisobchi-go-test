'use client';
import { ChevronRight, PackagePlus, Phone, Plus, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SupplierFormModal } from '@/components/forms/SupplierFormModal';
import { Money, ResponsiveTable } from '@/components/shared';
import { useShop } from '@/components/ShopDataProvider';
import { useBooks } from '@/components/useBooks';
import { Alert, Avatar, Button, Card, EmptyState, ErrorState, LinkButton, PageHeader, SearchInput, Segmented, Select, TableSkeleton } from '@/components/ui/primitives';
import { formatDate } from '@/lib/dates';
import { filterPartners, type ListFilter, type ListSort } from '@/lib/ledgerView';
import { can } from '@/lib/permissions';
import { safeSupplierBook } from '@/lib/supplierBook';
import { uz } from '@/i18n/uz';

/** Ta'minotchilar daftari: «Mening qarzim» kartasi + ro'yxat; ta'minotchini bosganda uning varag'i (/suppliers/[id]) */
export default function SuppliersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useBooks();
  const { membership } = useShop();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [sort, setSort] = useState<ListSort>('debt');
  const canManage = can(membership.role, 'partner.manage');

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
            <LinkButton href="/purchases/new" variant="outline" icon={<PackagePlus className="h-4 w-4" />}>
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
          <ResponsiveTable
            head={
              <tr>
                <th className="px-4 py-2.5 font-medium">Ta&apos;minotchi</th>
                <th className="px-4 py-2.5 font-medium">Telefon</th>
                <th className="px-4 py-2.5 font-medium">Oxirgi harakat</th>
                <th className="px-4 py-2.5 text-right font-medium">Qarzim</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            }
            mobile={rows.map((r) => (
              <Link key={r.id} href={`/suppliers/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <Avatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                  <p className="truncate text-xs text-muted">{r.phone ?? (r.lastActivity ? formatDate(r.lastActivity) : '—')}</p>
                </div>
                <div className="text-right">
                  <Money value={r.balance > 0n ? r.balance : 0n} className={r.balance > 0n ? 'text-sm font-semibold text-rose-600 dark:text-rose-400' : 'text-sm text-muted'} />
                  <p className="text-[11px] text-muted">{r.balance > 0n ? 'qarzim' : r.balance < 0n ? 'ortiqcha to‘lov' : 'qarz yo‘q'}</p>
                </div>
              </Link>
            ))}
          >
            {rows.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/suppliers/${r.id}`)} className="cursor-pointer transition-colors hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/suppliers/${r.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <Avatar name={r.name} />
                    <span className="truncate font-medium text-fg">{r.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted">
                  {r.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {r.phone}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{r.lastActivity ? formatDate(r.lastActivity) : '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={r.balance} className={r.balance > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted'} />
                </td>
                <td className="px-4 py-2.5 text-muted">
                  <ChevronRight className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </ResponsiveTable>
        )}
      </Card>
      <SupplierFormModal open={adding} onClose={() => setAdding(false)} supplier={null} onSaved={(s) => { void reload(); router.push(`/suppliers/${s.id}`); }} />
    </>
  );
}
