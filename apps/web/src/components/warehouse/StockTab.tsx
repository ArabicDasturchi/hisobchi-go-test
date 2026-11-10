'use client';
/**
 * Ombor / Qoldiq (P-10/M-10): tovar, qoldiq, birlik, sotuv narxi. Tan narx va foyda ustuni YO'Q.
 * Qoldiq tahriri ustiga yozmaydi: tuzatish yozuvi (`adjust_stock`), farq ko'rsatiladi ("12 → 10, farq −2"),
 * sabab majburiy, jurnalga qo'shiladi. Qoldiq katagini ikki marta bosish yoki "Tuzatish" tugmasi qator rejimini ochadi.
 */
import { Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { EditableRow, RowActions, RowError } from '@/components/edit/EditableRow';
import { useRowEdit } from '@/components/edit/useRowEdit';
import { usePageQuery } from '@/components/layout/pageQuery';
import { Money } from '@/components/shared';
import { useShop } from '@/components/ShopDataProvider';
import { Alert, Badge, Card, cn, EmptyState, SearchInput, TableSkeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import type { BooksData, StockItem } from '@/lib/data/books';
import { adjustStock } from '@/lib/data/purchases';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatQty } from '@/lib/money';
import { can } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/client';
import { adjustDiffText, filterStock, stockFields, STOCK_REASONS, stockCounts, type StockFilter, parseActualQty } from '@/lib/stockView';

const GRID = 'grid items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,2fr)_8rem_5rem_9rem_auto]';

function StockRow({ item, reload, canAdjust }: { item: StockItem; reload: () => Promise<void>; canAdjust: boolean }) {
  const { shopId } = useShop();
  const toast = useToast();
  const opId = useRef(crypto.randomUUID());
  const fields = useMemo(() => stockFields(), []);
  const initial = useMemo(() => ({ qty: formatQty(item.qty_milli), reason: STOCK_REASONS[0] }), [item.qty_milli]);
  const row = useRowEdit({
    fields,
    initial,
    onSave: async (v) => {
      const a = parseActualQty(v.qty ?? '');
      if (!a.ok) throw new Error(a.message);
      // Tuzatish yozuvi: eski qoldiq ustiga yozilmaydi, farq jurnalga qo'shiladi (bir martalik kalit: qayta urinish takror yozmaydi)
      await adjustStock(getSupabase(), { shopId, productId: item.product_id, clientOpId: opId.current, deltaMilli: a.value - item.qty_milli, reason: v.reason ?? '' });
      opId.current = crypto.randomUUID();
      await reload();
      toast.success(`${item.name}: qoldiq ${formatQty(a.value)} ga tuzatildi.`);
    },
  });
  const low = item.qty_milli < 0n || (item.qty_milli >= 0n && item.qty_milli <= 3000n);
  const neg = item.qty_milli < 0n;
  const diff = row.editing ? adjustDiffText(item.qty_milli, row.values.qty ?? '') : null;
  const noPrice = item.sale_price === null && item.is_active;

  return (
    <EditableRow row={row} as="li" className={cn('px-3 py-2.5', GRID, neg ? 'bg-amber-50 dark:bg-amber-500/10' : '')}>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-fg">
          {item.name} {!item.is_active && <Badge>arxiv</Badge>}
        </p>
      </div>
      <div className="md:text-right">
        {row.editing ? (
          <>
            <input
              autoFocus
              aria-label={`Qoldiq: ${item.name}`}
              inputMode="decimal"
              value={row.values.qty ?? ''}
              disabled={row.busy}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => row.set('qty', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void row.save();
                } else if (e.key === 'Escape') row.cancel();
              }}
              aria-invalid={row.errors.qty ? true : undefined}
              className={cn('h-11 w-full rounded-xl border bg-surface px-3 text-right text-[15px] font-semibold tabular-nums text-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25', row.errors.qty ? 'border-rose-500' : 'border-line')}
            />
            {row.errors.qty && (
              <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                {row.errors.qty}
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={!canAdjust}
            aria-label={`Qoldiq: ${item.name}: tuzatish`}
            title="Ikki marta bosing yoki Enter: qoldiqni tuzatish"
            onDoubleClick={() => row.start()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                row.start();
              }
            }}
            className="min-h-11 w-full rounded-lg px-2 text-left tabular-nums hover:bg-subtle disabled:hover:bg-transparent md:text-right"
          >
            {low && !neg && <Badge tone="amber" className="mr-2">Kam qoldi</Badge>}
            {neg && <Badge tone="red" className="mr-2">Manfiy</Badge>}
            <span className={cn('text-[15px] font-semibold', neg ? 'text-amber-700 dark:text-amber-400' : 'text-fg')}>{formatQty(item.qty_milli)}</span>
          </button>
        )}
      </div>
      <span className="text-sm text-muted">{uz.units[item.unit]}</span>
      <div className="md:text-right">
        {item.sale_price !== null ? (
          <Money value={item.sale_price} className="text-[15px] font-semibold text-fg" />
        ) : noPrice ? (
          <span className="inline-block rounded-lg border border-dashed border-amber-500 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">narx kiriting</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>
      <div className="flex justify-end">
        <RowActions row={row} label={item.name} disabled={!canAdjust} />
      </div>
      {row.editing && (
        <div className="space-y-2 rounded-xl border-2 border-emerald-500/60 p-3 md:col-span-full" data-testid="adjust-panel">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Tuzatish: {diff ?? '—'}</p>
          <label className="flex flex-col gap-1 text-sm text-muted sm:max-w-xs">
            Sabab (majburiy)
            <select
              value={row.values.reason ?? ''}
              disabled={row.busy}
              onChange={(e) => row.set('reason', e.target.value)}
              aria-label="Sabab"
              aria-invalid={row.errors.reason ? true : undefined}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg"
            >
              {STOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {row.errors.reason && <p role="alert" className="text-xs font-medium text-rose-600">{row.errors.reason}</p>}
          <p className="text-xs text-muted">Jurnalga yangi yozuv qo&apos;shiladi, eski qoldiq ustiga yozilmaydi.</p>
          <RowError row={row} />
        </div>
      )}
    </EditableRow>
  );
}

export function StockTab({ books, loading, reload }: { books: BooksData | null; loading: boolean; reload: () => Promise<void> }) {
  const { membership } = useShop();
  const [q, setQ] = usePageQuery();
  const [filter, setFilter] = useState<StockFilter>('all');
  const canAdjust = can(membership.role, 'stock.adjust');
  const stock = books?.stock ?? [];
  const counts = useMemo(() => stockCounts(stock), [stock]);
  const rows = useMemo(() => filterStock(stock, { query: q, filter }), [stock, q, filter]);

  const exportCsv = () => downloadCsv('ombor-qoldiq.csv', toCsv(['Tovar', 'Qoldiq', 'Birlik', 'Sotuv narxi'], rows.map((i) => [i.name, formatQty(i.qty_milli), uz.units[i.unit], i.sale_price])));

  const pill = (value: StockFilter, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(filter === value ? 'all' : value)}
      className={cn('min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors', filter === value ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-line text-fg hover:bg-subtle')}
    >
      {label}
    </button>
  );

  return (
    <>
      {counts.negative > 0 && filter !== 'negative' && (
        <Alert tone="amber" className="mb-3">
          {counts.negative} ta tovarning qoldig&apos;i manfiy: kirim yozilmagan bo&apos;lishi mumkin.
        </Alert>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pill('low', `Kam qolgan (${counts.low})`)}
        {pill('negative', 'Manfiy qoldiq')}
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-subtle disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden /> Eksport
        </button>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Tovar qidirish" className="mb-3 md:hidden" />
      <Card>
        {loading && !books ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="Tovar topilmadi" />
        ) : (
          <>
            <div className={cn('hidden border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid', GRID)} aria-hidden>
              <span>Tovar</span>
              <span className="text-right">Qoldiq</span>
              <span>Birlik</span>
              <span className="text-right">Sotuv narxi</span>
              <span />
            </div>
            <ul className="divide-y divide-line" aria-label="Ombor qoldig'i">
              {rows.map((i) => (
                <StockRow key={i.product_id} item={i} reload={reload} canAdjust={canAdjust} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
