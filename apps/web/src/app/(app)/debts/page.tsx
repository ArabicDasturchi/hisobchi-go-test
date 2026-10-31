'use client';
import { ChevronRight, HandCoins, ReceiptText, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PaymentModal } from '@/components/forms/PaymentModal';
import { DataGate, Money, ResponsiveTable, StatCard } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Avatar, Badge, Button, Card, EmptyState, LinkButton, PageHeader, SearchInput, Segmented, Select, TableSkeleton } from '@/components/ui/primitives';
import { computeTotals, type CustomerBalance } from '@/lib/data/ledger';
import type { Customer } from '@/lib/data/types';
import { formatDate } from '@/lib/dates';

type Status = 'debt' | 'settled' | 'credit';
type Filter = Status | 'all';
type Sort = 'debt' | 'name' | 'recent';

interface Row {
  c: Customer;
  b: CustomerBalance;
  status: Status;
}

/** Qarz holati — ledger qoidasi bo'yicha (qarz = savdolar − bekor qilinmagan to'lovlar) */
function statusOf(b: CustomerBalance): Status {
  return b.debt > 0n ? 'debt' : b.debt < 0n ? 'credit' : 'settled';
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'debt') return <Badge tone="red">Qarzdor</Badge>;
  if (status === 'credit') return <Badge tone="blue">Ortiqcha to&apos;lov</Badge>;
  return <Badge tone="green">To&apos;langan</Badge>;
}

const cmpBig = (a: bigint, b: bigint) => (a === b ? 0 : a < b ? 1 : -1);
const norm = (s: string) => s.toLocaleLowerCase('uz').replace(/[ʻʼ‘’`']/g, "'").trim();

function Debts({ data }: { data: ShopData }) {
  const { balances } = useShop();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('debt');
  const [sort, setSort] = useState<Sort>('debt');
  const [paying, setPaying] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(data.sales, data.payments), [data]);

  // Faqat savdo yoki to'lov tarixi bor mijozlar (hisob-kitobga aloqasi bor)
  const all = useMemo<Row[]>(
    () =>
      data.customers.flatMap((c) => {
        const b = balances.get(c.id);
        return b && (b.saleCount > 0 || b.paid > 0n || b.sales > 0n) ? [{ c, b, status: statusOf(b) }] : [];
      }),
    [data.customers, balances],
  );
  const counts = useMemo(() => ({ debt: all.filter((r) => r.status === 'debt').length, settled: all.filter((r) => r.status === 'settled').length, credit: all.filter((r) => r.status === 'credit').length }), [all]);

  const rows = useMemo(() => {
    const q = norm(query);
    const qDigits = query.replace(/\D/g, '');
    const list = all.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return norm(r.c.name).includes(q) || (qDigits.length > 0 && (r.c.phone ?? '').replace(/\D/g, '').includes(qDigits));
    });
    list.sort((x, y) => {
      if (sort === 'name') return x.c.name.localeCompare(y.c.name, 'uz');
      if (sort === 'recent') return new Date(y.b.lastActivity ?? 0).getTime() - new Date(x.b.lastActivity ?? 0).getTime();
      return cmpBig(x.b.debt, y.b.debt) || x.c.name.localeCompare(y.c.name, 'uz');
    });
    return list;
  }, [all, query, filter, sort]);

  const payBtn = (r: Row) =>
    r.status === 'debt' ? (
      <Button size="sm" variant="outline" onClick={() => setPaying(r.c.id)} icon={<Wallet className="h-3.5 w-3.5" />}>
        To&apos;lov
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title="Qarzlar"
        description="Mijozlar qarzi: savdolar va to'lovlar asosida"
        actions={
          <Button onClick={() => setPaying('')} disabled={counts.debt === 0} icon={<Wallet className="h-4 w-4" />}>
            To&apos;lov qabul qilish
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Jami qarzdorlik" value={<Money value={totals.totalDebt} />} hint={`${totals.debtorCount} ta qarzdor`} icon={HandCoins} accent="rose" />
        <StatCard label="Qabul qilingan to'lovlar" value={<Money value={totals.totalPaid} />} hint="Bekor qilinganlarsiz" icon={Wallet} accent="emerald" />
        <StatCard label="To'liq hisob-kitob" value={`${counts.settled} ta`} hint="Qarzi yo'q mijozlar" icon={Users} accent="blue" />
        <StatCard label="Ortiqcha to'lov" value={<Money value={totals.totalCredit} />} hint={`${counts.credit} ta mijoz`} icon={ReceiptText} accent="slate" />
      </div>

      <Card className="mt-3">
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Mijoz ismi yoki telefon" className="lg:max-w-xs lg:flex-1" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Segmented
              ariaLabel="Holat"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'debt', label: `Qarzdor (${counts.debt})` },
                { value: 'settled', label: `To'langan (${counts.settled})` },
                { value: 'credit', label: `Ortiqcha (${counts.credit})` },
                { value: 'all', label: 'Hammasi' },
              ]}
            />
            <Select aria-label="Saralash" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 w-auto py-0 text-xs">
              <option value="debt">Qarz bo&apos;yicha</option>
              <option value="recent">Oxirgi faollik</option>
              <option value="name">Nomi bo&apos;yicha</option>
            </Select>
          </div>
        </div>

        {all.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="h-5 w-5" />}
            title="Hali qarz yozuvlari yo'q"
            description="Mijozga qarzga savdo qilinganda u shu yerda ko'rinadi."
            action={<LinkButton href="/sales/new" size="sm">Savdo kiritish</LinkButton>}
          />
        ) : rows.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" description={filter === 'debt' && !query ? "Hozir qarzdor mijoz yo'q." : "Qidiruv yoki filterni o'zgartirib ko'ring."} />
        ) : (
          <ResponsiveTable
            head={
              <tr>
                <th className="px-4 py-2 font-medium">Mijoz</th>
                <th className="px-4 py-2 font-medium">Holat</th>
                <th className="px-4 py-2 text-right font-medium">Savdolar</th>
                <th className="px-4 py-2 text-right font-medium">To&apos;langan</th>
                <th className="px-4 py-2 text-right font-medium">Qoldiq</th>
                <th className="px-4 py-2 font-medium">Oxirgi faollik</th>
                <th className="w-px px-4 py-2" />
              </tr>
            }
            mobile={rows.map((r) => (
              <div key={r.c.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={r.c.name} />
                <Link href={`/customers/${r.c.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-fg">{r.c.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <StatusBadge status={r.status} />
                    {r.b.lastActivity ? formatDate(r.b.lastActivity) : ''}
                  </p>
                </Link>
                <div className="flex flex-col items-end gap-1">
                  <Money value={r.b.debt < 0n ? -r.b.debt : r.b.debt} className={r.status === 'debt' ? 'text-[13px] font-semibold text-rose-600 dark:text-rose-400' : 'text-[13px] text-muted'} />
                  {payBtn(r)}
                </div>
              </div>
            ))}
          >
            {rows.map((r) => (
              <tr key={r.c.id} className="transition-colors hover:bg-surface-2">
                <td className="px-4 py-2">
                  <Link href={`/customers/${r.c.id}`} className="flex items-center gap-2.5">
                    <Avatar name={r.c.name} className="h-7 w-7 text-[10px]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{r.c.name}</span>
                      <span className="block text-xs text-muted">{r.c.phone ?? `${r.b.saleCount} ta savdo`}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={r.b.sales} className="text-fg" />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={r.b.paid} className="text-fg" />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money
                    value={r.b.debt < 0n ? -r.b.debt : r.b.debt}
                    className={r.status === 'debt' ? 'font-semibold text-rose-600 dark:text-rose-400' : r.status === 'credit' ? 'text-sky-700 dark:text-sky-300' : 'text-muted'}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{r.b.lastActivity ? formatDate(r.b.lastActivity) : '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {payBtn(r)}
                    <Link href={`/customers/${r.c.id}`} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label={`${r.c.name} — tafsilot va to'lov tarixi`} title="Tafsilot va to'lov tarixi">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </ResponsiveTable>
        )}
      </Card>

      <PaymentModal open={paying !== null} onClose={() => setPaying(null)} customerId={paying || null} />
    </>
  );
}

export default function DebtsPage() {
  return (
    <DataGate skeleton={<Card><TableSkeleton /></Card>}>
      {(data) => <Debts data={data} />}
    </DataGate>
  );
}
