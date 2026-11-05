'use client';
import { sumAmounts, tashkentDate } from '@hisobchi/core';
import { BookDown, BookUp, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Money } from '@/components/shared';
import { useShop } from '@/components/ShopDataProvider';
import { useBooks } from '@/components/useBooks';
import { Badge, Card, EmptyState, ErrorState, Input, LinkButton, PageHeader, SearchInput, Segmented, TableSkeleton } from '@/components/ui/primitives';
import { customerStatement, inDayRange, isActiveSettlement, supplierStatement, type DayRange } from '@/lib/data/books';
import { formatQty } from '@/lib/money';
import { uz } from '@/i18n/uz';

type View = 'date' | 'partner';
type Preset = 'today' | 'week' | 'month' | 'all' | 'custom';
const norm = (s: string) => s.toLocaleLowerCase('uz').trim();

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
const show = (d: string) => d.split('-').reverse().join('.');

function presetRange(p: Exclude<Preset, 'custom'>): DayRange {
  const today = tashkentDate(new Date().toISOString());
  if (p === 'today') return { from: today, to: today };
  if (p === 'week') return { from: addDays(today, -6), to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: null, to: null };
}

/**
 * Kirim daftari (/books/in) va Chiqim daftari (/books/out) — faqat ko'rish.
 * Ko'rinish: sana bo'yicha (kun jami) yoki hamkor bo'yicha (Eski, Tovar, Jami, Berildi, Ostatka).
 */
export default function BookPage() {
  const params = useParams<{ kind: string }>();
  const kind = params.kind === 'out' ? 'out' : 'in';
  const shop = useShop();
  const books = useBooks();
  const [view, setView] = useState<View>('date');
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  const range: DayRange = preset === 'custom' ? { from: from || null, to: to || null } : presetRange(preset);
  const rangeError = range.from && range.to && range.to < range.from ? "Tugash sanasi boshlanishidan oldin bo'lishi mumkin emas" : null;
  const title = kind === 'in' ? uz.nav.purchasesBook : uz.nav.salesBook;

  const supplierName = useMemo(() => new Map((books.data?.suppliers ?? []).map((s) => [s.id, s.name])), [books.data]);

  const items = useMemo(() => {
    const q = norm(query);
    if (rangeError) return [];
    if (kind === 'in') {
      return (books.data?.purchases ?? [])
        .filter((p) => inDayRange(p.doc_date, range))
        .map((p) => ({ id: p.id, date: p.doc_date, title: `${supplierName.get(p.supplier_id) ?? "Ta'minotchi"}${p.kind === 'opening' ? " · boshlang'ich qarz" : ''}`, amount: p.subtotal, reversed: p.status !== 'posted', href: null as string | null }))
        .filter((x) => !q || norm(x.title).includes(q));
    }
    return (shop.data?.sales ?? [])
      .map((s) => ({ id: s.id, date: tashkentDate(s.created_at), title: (s.customer_id && shop.customerById.get(s.customer_id)?.name) || 'Umumiy xaridor', amount: s.subtotal, reversed: s.status !== 'posted', href: `/sales/${s.id}` as string | null }))
      .filter((x) => inDayRange(x.date, range))
      .filter((x) => !q || norm(x.title).includes(q));
  }, [kind, books.data, shop.data, shop.customerById, supplierName, query, range.from, range.to, rangeError]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);

  const partners = useMemo(() => {
    if (view !== 'partner' || rangeError) return [];
    const q = norm(query);
    if (kind === 'in') {
      return (books.data?.suppliers ?? [])
        .filter((s) => !q || norm(s.name).includes(q))
        .map((s) => ({ id: s.id, name: s.name, st: books.data ? supplierStatement(books.data, s.id, range) : null }))
        .filter((r) => r.st && isActiveSettlement(r.st));
    }
    return (shop.data?.customers ?? [])
      .filter((c) => !q || norm(c.name).includes(q))
      .map((c) => ({ id: c.id, name: c.name, st: shop.data ? customerStatement(shop.data.sales, shop.data.payments, c.id, range) : null }))
      .filter((r) => r.st && isActiveSettlement(r.st));
  }, [view, kind, books.data, shop.data, query, range.from, range.to, rangeError]);

  const needsBooks = kind === 'in' || view === 'partner';
  if (needsBooks && kind === 'in' && books.error && !books.data) {
    return (
      <>
        <PageHeader title={title} />
        <Card>
          <ErrorState message={books.error} onRetry={() => void books.reload()} />
        </Card>
      </>
    );
  }
  const loading = (kind === 'in' && books.loading && !books.data) || (shop.loading && !shop.data);

  return (
    <>
      <PageHeader
        title={title}
        description={kind === 'in' ? "Kirimlar va ta'minotchilar hisobi. Yangi kirim «Kirim yozish» orqali kiritiladi." : 'Savdolar daftari. Yangi savdo «Yangi savdo» orqali kiritiladi.'}
        actions={
          kind === 'in' ? (
            <LinkButton href="/purchases/new" icon={<PackagePlus className="h-4 w-4" />}>
              Kirim yozish
            </LinkButton>
          ) : undefined
        }
      />
      <Card>
        <div className="space-y-2.5 border-b border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<View>
              ariaLabel="Ko'rinish"
              value={view}
              onChange={setView}
              options={[
                { value: 'date', label: "Sana bo'yicha" },
                { value: 'partner', label: kind === 'in' ? "Ta'minotchi bo'yicha" : "Mijoz bo'yicha" },
              ]}
            />
            <Segmented<Preset>
              ariaLabel="Davr"
              value={preset}
              onChange={setPreset}
              options={[
                { value: 'today', label: 'Bugun' },
                { value: 'week', label: '7 kun' },
                { value: 'month', label: 'Shu oy' },
                { value: 'all', label: 'Hammasi' },
                { value: 'custom', label: 'Sana tanlash' },
              ]}
            />
          </div>
          {preset === 'custom' && (
            <div className="grid max-w-md grid-cols-2 gap-2">
              <Input label="Dan" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input label="Gacha" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={rangeError ?? undefined} />
            </div>
          )}
          <SearchInput value={query} onChange={setQuery} placeholder={kind === 'in' ? "Ta'minotchi nomi" : 'Mijoz nomi'} className="lg:w-72" />
          <p className="text-xs text-muted">
            Davr: {range.from ? show(range.from) : 'boshidan'} — {range.to ? show(range.to) : 'hozirgacha'}. Bekor qilingan hujjatlar jamiga kirmaydi.
          </p>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : view === 'date' ? (
          groups.length === 0 ? (
            <EmptyState icon={kind === 'in' ? <BookDown className="h-5 w-5" /> : <BookUp className="h-5 w-5" />} title="Hujjat topilmadi" description="Davrni yoki qidiruvni o'zgartiring." />
          ) : (
            <div className="divide-y divide-line">
              {groups.map(([date, list]) => (
                <div key={date}>
                  <div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-xs font-medium text-muted">
                    <span>{show(date)}</span>
                    <Money value={sumAmounts(list.filter((x) => !x.reversed).map((x) => x.amount))} className="font-semibold text-fg" />
                  </div>
                  {list.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-fg">
                        {x.href ? <Link href={x.href} className="hover:underline">{x.title}</Link> : x.title}{' '}
                        {x.reversed && <Badge tone="red">bekor qilingan</Badge>}
                      </span>
                      <Money value={x.amount} className={x.reversed ? 'text-muted line-through' : 'text-fg'} />
                    </div>
                  ))}
                  {kind === 'in' && (
                    <PurchaseLines ids={list.map((x) => x.id)} lines={books.data?.lines ?? []} />
                  )}
                </div>
              ))}
            </div>
          )
        ) : partners.length === 0 ? (
          <EmptyState title="Harakat topilmadi" description="Tanlangan davrda hamkor bo'yicha yozuv yo'q." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-surface-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{kind === 'in' ? "Ta'minotchi" : 'Mijoz'}</th>
                  <th className="px-4 py-2.5 text-right font-medium">Eski</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tovar</th>
                  <th className="px-4 py-2.5 text-right font-medium">Jami</th>
                  <th className="px-4 py-2.5 text-right font-medium">Berildi</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ostatka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {partners.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-fg">{r.name}</td>
                    <td className="px-4 py-2.5 text-right"><Money value={r.st!.opening} /></td>
                    <td className="px-4 py-2.5 text-right"><Money value={r.st!.goods} /></td>
                    <td className="px-4 py-2.5 text-right"><Money value={r.st!.total} /></td>
                    <td className="px-4 py-2.5 text-right"><Money value={r.st!.paid} /></td>
                    <td className="px-4 py-2.5 text-right"><Money value={r.st!.balance} className={r.st!.balance > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted'} /></td>
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

/** Kirim qatorlari (tovar, miqdor, tan narx) — kun ostida yig'ilgan ko'rinish */
function PurchaseLines({ ids, lines }: { ids: string[]; lines: { document_id: string; product_name: string; qty_milli: bigint; unit: string; unit_cost: bigint; line_total: bigint }[] }) {
  const set = new Set(ids);
  const rows = lines.filter((l) => set.has(l.document_id));
  if (rows.length === 0) return null;
  return (
    <details className="border-t border-line px-4 py-2 text-xs text-muted">
      <summary className="cursor-pointer">Tovarlar ({rows.length})</summary>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map((l, i) => (
          <li key={`${l.document_id}-${i}`} className="flex justify-between gap-3">
            <span className="truncate">
              {l.product_name} — {formatQty(l.qty_milli)} {l.unit} × <Money value={l.unit_cost} />
            </span>
            <Money value={l.line_total} />
          </li>
        ))}
      </ul>
    </details>
  );
}
