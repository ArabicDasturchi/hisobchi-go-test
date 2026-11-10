'use client';
/**
 * Ombor ichidagi uch ko'rinish: Qoldiq (jadval + tuzatish), Kirim (kirimlar ro'yxati), Chiqim (savdodan chiqqan tovar,
 * tuzatish/yo'qotish). Eski Kirim/Chiqim daftari mantig'i `lib/warehouseView.ts` ga ko'chirilgan; hisob core'da.
 */
import { Download, PackagePlus, SlidersHorizontal, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Money } from '../shared';
import { useShop } from '../ShopDataProvider';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, LinkButton, SearchInput, Segmented, Select, TableSkeleton } from '../ui/primitives';
import type { BooksData, DayRange, StockItem } from '@/lib/data/books';
import { stockView } from '@/lib/data/books';
import { loadOutflowMovements, type StockMovementRow } from '@/lib/data/movements';
import { downloadCsv, toCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { formatQty } from '@/lib/money';
import { can } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/client';
import { outflowItems, outflowTotals, presetRange, receiptDays, todayTashkent, type OutflowType, type Preset } from '@/lib/warehouseView';
import { uz } from '@/i18n/uz';

const norm = (s: string) => s.toLocaleLowerCase('uz').trim();
const show = (d: string) => d.split('-').reverse().join('.');

// ---------------------------------------------------------------------------
// Davr tanlash
// ---------------------------------------------------------------------------

function useRange(initial: Preset) {
  const [preset, setPreset] = useState<Preset>(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const today = useMemo(() => todayTashkent(), []);
  const range: DayRange = preset === 'custom' ? { from: from || null, to: to || null } : presetRange(preset, today);
  const error = range.from && range.to && range.to < range.from ? "Tugash sanasi boshlanishidan oldin bo'lishi mumkin emas" : null;
  const ui = (
    <div className="space-y-2">
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
      {preset === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-2">
          <Input aria-label="Dan" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input aria-label="Gacha" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={error} />
        </div>
      )}
    </div>
  );
  return { range, error, ui };
}

// ---------------------------------------------------------------------------
// Kirim
// ---------------------------------------------------------------------------

export function ReceiptsTab({ books, loading }: { books: BooksData | null; loading: boolean }) {
  const { range, error: rangeErr, ui } = useRange('month');
  const [supplierId, setSupplierId] = useState('');
  const [query, setQuery] = useState('');
  const names = useMemo(() => new Map((books?.suppliers ?? []).map((s) => [s.id, s.name])), [books]);
  const res = useMemo(
    () => (books && !rangeErr ? receiptDays(books.purchases, books.lines, names, { range, supplierId: supplierId || undefined, query }) : { days: [], total: 0n, count: 0 }),
    [books, names, range.from, range.to, supplierId, query, rangeErr], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const exportCsv = () =>
    downloadCsv(
      'ombor-kirim.csv',
      toCsv(['Sana', "Ta'minotchi", 'Summa', 'Holat'], res.days.flatMap((d) => d.items.map((x) => [show(x.date), x.supplierName, x.amount, x.reversed ? 'bekor qilingan' : 'kirim']))),
    );

  return (
    <Card>
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          {ui}
          <LinkButton href="/dashboard?amal=kirim" className="lg:ml-auto" icon={<PackagePlus className="h-4 w-4" />}>
            Kirim yozish
          </LinkButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Ta'minotchi" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-9 w-auto py-0 text-sm">
            <option value="">Barcha ta&apos;minotchilar</option>
            {(books?.suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <SearchInput value={query} onChange={setQuery} placeholder="Ta'minotchi yoki tovar nomi" className="lg:w-72" />
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={res.days.length === 0} icon={<Download className="h-4 w-4" />}>
            Eksport
          </Button>
        </div>
        <p className="text-xs text-muted">
          Jami kirim: <Money value={res.total} className="font-semibold text-fg" /> ({res.count} ta). Bekor qilingan kirimlar va boshlang&apos;ich qarz jamiga kirmaydi.
        </p>
      </div>
      {loading && !books ? (
        <TableSkeleton />
      ) : res.days.length === 0 ? (
        <EmptyState icon={<PackagePlus className="h-5 w-5" />} title="Kirim topilmadi" description="Davrni yoki qidiruvni o'zgartiring, yoki «Kirim yozish» bilan yangisini kiriting." />
      ) : (
        <div className="divide-y divide-line">
          {res.days.map((d) => (
            <div key={d.date}>
              <div className="flex items-center justify-between bg-surface-2 px-4 py-2 text-xs font-medium text-muted">
                <span>{show(d.date)}</span>
                <Money value={d.total} className="font-semibold text-fg" />
              </div>
              {d.items.map((x) => (
                <div key={x.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-fg">
                      <Link href={`/suppliers/${x.supplierId}`} className="hover:underline">
                        {x.supplierName}
                      </Link>{' '}
                      {x.reversed && <Badge tone="red">bekor qilingan</Badge>}
                    </span>
                    <Money value={x.amount} className={x.reversed ? 'text-muted line-through' : 'text-fg'} />
                  </div>
                  {x.lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {x.lines.map((l, i) => (
                        <li key={`${x.id}-${i}`} className="flex justify-between gap-3">
                          <span className="truncate">
                            {l.product_name} — {formatQty(l.qty_milli)} {l.unit} × <Money value={l.unit_cost} />
                          </span>
                          <Money value={l.line_total} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chiqim
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<OutflowType, string> = { sale: 'Savdo', sale_reversal: 'Savdo bekor qilindi', loss: "Yo'qotish (tuzatish)", gain: 'Ortiqcha (tuzatish)' };

export function OutflowTab({ books }: { books: BooksData | null }) {
  const { shopId } = useShop();
  const { range, error: rangeErr, ui } = useRange('month');
  const [type, setType] = useState<OutflowType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; rows: StockMovementRow[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadOutflowMovements(getSupabase(), shopId).then(
      (rows) => alive && setState({ status: 'ok', rows }),
      (e: unknown) => alive && setState({ status: 'error', message: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [shopId, attempt]);

  const names = useMemo(() => new Map((books?.stock ?? []).map((s) => [s.product_id, s.name])), [books]);
  const items = useMemo(() => (state.status === 'ok' && !rangeErr ? outflowItems(state.rows, names, { range, query, type }) : []), [state, names, range.from, range.to, query, type, rangeErr]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => outflowTotals(items), [items]);
  const unit = useMemo(() => new Map((books?.stock ?? []).map((s) => [s.product_id, uz.units[s.unit]])), [books]);

  const exportCsv = () => downloadCsv('ombor-chiqim.csv', toCsv(['Sana', 'Tovar', 'Miqdor', 'Turi', 'Izoh'], items.map((x) => [show(x.date), x.productName, formatQty(x.qtyMilli), TYPE_LABEL[x.type], x.note ?? ''])));

  return (
    <Card>
      <div className="space-y-2.5 border-b border-line p-3">
        {ui}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<OutflowType | 'all'>
            ariaLabel="Turi"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'Hammasi' },
              { value: 'sale', label: 'Savdo' },
              { value: 'loss', label: "Yo'qotish" },
              { value: 'gain', label: 'Ortiqcha' },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Tovar nomi" className="lg:w-64" />
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={items.length === 0} icon={<Download className="h-4 w-4" />}>
            Eksport
          </Button>
        </div>
        <p className="text-xs text-muted">Savdodan chiqqan tovar va qoldiq tuzatishlari (inventarizatsiya). Tuzatish «Qoldiq» ko&apos;rinishida qilinadi.</p>
      </div>
      {state.status === 'loading' ? (
        <TableSkeleton />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Warehouse className="h-5 w-5" />} title="Chiqim topilmadi" description="Davrni o'zgartiring. Savdo yoki tuzatish bo'lganda shu yerda ko'rinadi." />
      ) : (
        <>
          <div className="overflow-x-auto border-b border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Tovar (davr jami)</th>
                  <th className="px-4 py-2 text-right font-medium">Sotildi</th>
                  <th className="px-4 py-2 text-right font-medium">Yo&apos;qotish</th>
                  <th className="px-4 py-2 text-right font-medium">Ortiqcha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {totals.map((t) => (
                  <tr key={t.productId}>
                    <td className="px-4 py-2 font-medium text-fg">{t.productName}</td>
                    <td className="tabular px-4 py-2 text-right">{formatQty(t.sold)} {unit.get(t.productId) ?? ''}</td>
                    <td className="tabular px-4 py-2 text-right text-rose-600 dark:text-rose-400">{t.lost > 0n ? formatQty(t.lost) : '—'}</td>
                    <td className="tabular px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{t.found > 0n ? formatQty(t.found) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line">
            {items.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium text-fg">{x.productName}</span>
                  <span className="ml-2 text-xs text-muted">
                    {show(x.date)} · {x.documentId && (x.type === 'sale' || x.type === 'sale_reversal') ? (
                      <Link href={`/sales/${x.documentId}`} className="hover:underline">
                        {TYPE_LABEL[x.type]}
                      </Link>
                    ) : (
                      TYPE_LABEL[x.type]
                    )}
                    {x.note ? ` · ${x.note}` : ''}
                  </span>
                </span>
                <span className={`tabular whitespace-nowrap font-semibold ${x.qtyMilli < 0n ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {x.qtyMilli > 0n ? '+' : ''}
                  {formatQty(x.qtyMilli)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
