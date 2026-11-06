'use client';
import { ChevronRight, HandCoins, Phone, Plus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CustomerFormModal } from '@/components/forms/CustomerFormModal';
import { PaymentModal } from '@/components/forms/PaymentModal';
import { DataGate, Money, ResponsiveTable } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert, Avatar, Button, Card, EmptyState, PageHeader, SearchInput, Segmented, Select, TableSkeleton } from '@/components/ui/primitives';
import { buildCustomerBook } from '@/lib/customerBook';
import { formatDate } from '@/lib/dates';
import { filterPartners, type ListFilter, type ListSort } from '@/lib/ledgerView';
import { can } from '@/lib/permissions';

/** Mijozlar daftari: qarz bo'yicha ro'yxat + umumiy qarz kartasi; mijozni bosganda uning varag'i (/customers/[id]) ochiladi */
function Customers({ data }: { data: ShopData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { membership } = useShop();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>(params.get('filter') === 'debt' ? 'debtors' : 'all');
  const [sort, setSort] = useState<ListSort>('debt');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(params.get('pay') === '1');

  const book = useMemo(() => buildCustomerBook(data.customers, data.sales, data.payments), [data.customers, data.sales, data.payments]);
  const rows = useMemo(() => filterPartners(book.rows, { query, filter, sort }), [book.rows, query, filter, sort]);
  const aged = useMemo(() => new Map(book.rows.map((r) => [r.id, r.aged])), [book.rows]);
  const canWrite = can(membership.role, 'ledger.write');
  const canManage = can(membership.role, 'partner.manage');

  return (
    <>
      <PageHeader
        title="Mijozlar"
        description="Har mijoz — bitta daftar varag‘i: savdo, to‘lov va qarz shu yerda."
        actions={
          <>
            <Button variant="outline" onClick={() => setPaying(true)} disabled={!canWrite || !book.rows.some((r) => r.balance > 0n)} icon={<Wallet className="h-4 w-4" />}>
              To&apos;lov oldim
            </Button>
            {canManage && (
              <Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
                Mijoz qo&apos;shish
              </Button>
            )}
          </>
        }
      />

      {!book.ok && (
        <Alert tone="red" title="Hisob mos kelmadi" className="mb-3">
          {book.message}
        </Alert>
      )}

      {book.ok && (
        <Card className="mb-3 grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-testid="debt-card">
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <HandCoins className="h-4 w-4" /> Jami qarz
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              <Money value={book.card.totalDebt} />
            </p>
          </div>
          <div className="p-4">
            <p className="text-sm font-medium text-muted">Qarzdorlar</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-fg">{book.card.debtorCount} ta</p>
          </div>
          <div className="p-4">
            <p className="text-sm font-medium text-muted">30 kundan oshgan qarz</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              <Money value={book.card.aged} />
            </p>
            <p className="text-xs text-muted">{book.card.agedCount > 0 ? `${book.card.agedCount} ta mijoz` : 'Eskirgan qarz yo‘q'}</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Ism yoki telefon bo'yicha qidirish" className="lg:max-w-sm lg:flex-1" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Segmented<ListFilter>
              ariaLabel="Filtr"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'debtors', label: 'Qarzdorlar' },
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

        {data.customers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Birinchi mijozni qo‘shing"
            description="Qarzga savdo qilish va to'lovlarni kuzatish uchun mijoz varag‘i kerak."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" />}>
                  Mijoz qo&apos;shish
                </Button>
              ) : undefined
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" description={filter === 'debtors' && !query ? "Hozir qarzdor mijoz yo'q." : "Qidiruv yoki filterni o'zgartirib ko'ring."} />
        ) : (
          <ResponsiveTable
            head={
              <tr>
                <th className="px-4 py-2.5 font-medium">Mijoz</th>
                <th className="px-4 py-2.5 font-medium">Telefon</th>
                <th className="px-4 py-2.5 font-medium">Oxirgi harakat</th>
                <th className="px-4 py-2.5 text-right font-medium">30+ kun</th>
                <th className="px-4 py-2.5 text-right font-medium">Qarz</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            }
            mobile={rows.map((r) => (
              <Link key={r.id} href={`/customers/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <Avatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                  <p className="truncate text-xs text-muted">{r.phone ?? (r.lastActivity ? formatDate(r.lastActivity) : '—')}</p>
                </div>
                <div className="text-right">
                  <Money value={r.balance > 0n ? r.balance : 0n} className={r.balance > 0n ? 'text-sm font-semibold text-rose-600 dark:text-rose-400' : 'text-sm text-muted'} />
                  <p className="text-[11px] text-muted">{r.balance > 0n ? ((aged.get(r.id) ?? 0n) > 0n ? '30+ kun' : 'qarz') : r.balance < 0n ? 'ortiqcha to‘lov' : 'qarzsiz'}</p>
                </div>
              </Link>
            ))}
          >
            {rows.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/customers/${r.id}`)} className="cursor-pointer transition-colors hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/customers/${r.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
                <td className="px-4 py-2.5 text-right">{(aged.get(r.id) ?? 0n) > 0n ? <Money value={aged.get(r.id) ?? 0n} className="font-medium text-amber-600 dark:text-amber-400" /> : <span className="text-muted">—</span>}</td>
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
      <CustomerFormModal open={adding} onClose={() => setAdding(false)} onSaved={(c) => router.push(`/customers/${c.id}`)} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} customerId={null} />
    </>
  );
}

export default function CustomersPage() {
  return (
    <DataGate skeleton={<Card><TableSkeleton /></Card>}>
      {(data) => (
        <Suspense>
          <Customers data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
