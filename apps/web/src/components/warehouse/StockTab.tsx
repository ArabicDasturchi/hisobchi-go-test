'use client';
/**
 * Ombor / Qoldiq — NARXLAR MARKAZI: tovar, [qoldiq], birlik, tan narx, sotuv narxi, [optom narx va boshlanadigan miqdor].
 * [..] ombor sozlamalariga qarab ko'rinadi: qoldiq faqat "Baza" yoqiq bo'lsa, optom faqat "Optom/dona" yoqiq bo'lsa.
 * Narx tahriri: bitta UPDATE (faqat o'zgargan ustunlar). Ustama %: tan narxdan sotuv narxi TAKLIFI (qo'lda narx o'zgarmaydi).
 * Qoldiq tahriri ustiga yozmaydi: tuzatish yozuvi (`adjust_stock`), farq ko'rsatiladi ("12 → 10, farq −2"),
 * sabab majburiy, jurnalga qo'shiladi. Qoldiq katagini ikki marta bosish yoki "Tuzatish" tugmasi qator rejimini ochadi.
 */
import { Download } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { EditableCell } from '@/components/edit/EditableCell';
import { EditableRow, RowActions, RowError } from '@/components/edit/EditableRow';
import { useRowEdit } from '@/components/edit/useRowEdit';
import { usePageQuery } from '@/components/layout/pageQuery';
import { Money } from '@/components/shared';
import { useShop } from '@/components/ShopDataProvider';
import { Alert, Badge, Button, Card, cn, EmptyState, SearchInput, TableSkeleton } from '@/components/ui/primitives';
import { WarehouseSettings } from '@/components/warehouse/WarehouseSettings';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import type { BooksData, StockItem } from '@/lib/data/books';
import { updateProductPrices } from '@/lib/data/api';
import { adjustStock } from '@/lib/data/purchases';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatMoneyInput, formatQty, parseMoneyInput, parseQtyInput } from '@/lib/money';
import { can } from '@/lib/permissions';
import { buildPricePatch, costAboveSaleWarning, markupHint, suggestedSaleText, wholesaleAboveSaleWarning, type PricingSettings } from '@/lib/shopPricing';
import { getSupabase } from '@/lib/supabase/client';
import type { FieldDef } from '@/lib/rowEdit';
import { adjustDiffText, filterStock, stockFields, STOCK_REASONS, stockCounts, type StockFilter, parseActualQty } from '@/lib/stockView';

/**
 * Ustunlar sozlamaga qarab: telefonda 2 ustunli kartochka (nom to'liq ko'rinadi), kompyuterda bir qator.
 * Tailwind sinflari to'liq yozilgan (dinamik yig'ilmaydi).
 */
function gridClass(p: Pick<PricingSettings, 'stockEnabled' | 'wholesaleEnabled'>): string {
  const base = 'grid grid-cols-2 items-start gap-x-3 gap-y-2 md:items-center';
  if (p.stockEnabled && p.wholesaleEnabled) return `${base} md:grid-cols-[minmax(8rem,2fr)_6rem_3.5rem_8.5rem_8.5rem_8.5rem_11rem]`;
  if (p.stockEnabled) return `${base} md:grid-cols-[minmax(8rem,2fr)_6rem_3.5rem_8.5rem_8.5rem_11rem]`;
  if (p.wholesaleEnabled) return `${base} md:grid-cols-[minmax(8rem,2fr)_3.5rem_8.5rem_8.5rem_8.5rem_11rem]`;
  return `${base} md:grid-cols-[minmax(8rem,2fr)_3.5rem_8.5rem_8.5rem_11rem]`;
}

const priceFields = (): FieldDef[] => [
  // Tan va sotuv narxi tekshiruvda ixtiyoriy: tan narxi yo'q tovarga (kirim yozilmagan, yolg'on 0 kerak emas) optom yoki sotuv narxini
  // yozish mumkin bo'lsin. Bo'sh qiymat yozilmaydi (`buildPricePatch`); mavjud tan va sotuv narxini bo'shatib bo'lmaydi (xato).
  // Majburiylik amber "tan narx kiriting"/"narx kiriting" belgilari va "Narxi yo'q" filtri bilan ko'rsatiladi.
  { key: 'cost', label: 'Tan narx', kind: 'money', allowZero: true, optional: true },
  { key: 'sale', label: 'Sotuv narxi', kind: 'money', allowZero: false, optional: true },
  { key: 'wholesale', label: 'Optom narx', kind: 'money', allowZero: false, optional: true },
  { key: 'minQty', label: 'Optom boshlanadigan miqdor', kind: 'qty', optional: true },
];

const moneyText = (v: bigint | null | undefined) => (v === null || v === undefined ? '' : formatMoneyInput(v.toString()));

/** Telefonda kartochka ichidagi maydon yorlig'i (kompyuterda ustun sarlavhasi bor) */
function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted md:hidden">{label}</span>
      {children}
    </div>
  );
}

function StockRow({ item, reload, canAdjust, pricing }: { item: StockItem; reload: () => Promise<void>; canAdjust: boolean; pricing: PricingSettings }) {
  const { shopId, reload: reloadShop } = useShop();
  const toast = useToast();
  const opId = useRef(crypto.randomUUID());
  const unitLabel = uz.units[item.unit];
  const refreshAll = () => Promise.all([reload(), reloadShop()]).then(() => undefined);

  // ---- Qoldiq tuzatish (faqat "Baza" yoqiq) ----
  const qtyFields = useMemo(() => stockFields(), []);
  const qtyInitial = useMemo(() => ({ qty: formatQty(item.qty_milli), reason: STOCK_REASONS[0] }), [item.qty_milli]);
  const qtyRow = useRowEdit({
    fields: qtyFields,
    initial: qtyInitial,
    onSave: async (v) => {
      const a = parseActualQty(v.qty ?? '');
      if (!a.ok) throw new Error(a.message);
      // Tuzatish yozuvi: eski qoldiq ustiga yozilmaydi, farq jurnalga qo'shiladi (bir martalik kalit: qayta urinish takror yozmaydi)
      await adjustStock(getSupabase(), { shopId, productId: item.product_id, clientOpId: opId.current, deltaMilli: a.value - item.qty_milli, reason: v.reason ?? '' });
      opId.current = crypto.randomUUID();
      await refreshAll();
      toast.success(`${item.name}: qoldiq ${formatQty(a.value)} ga tuzatildi.`);
    },
  });

  // ---- Narxlar: tan narx, sotuv narxi, optom ----
  const fields = useMemo(() => priceFields(), []);
  const initial = useMemo(
    () => ({ cost: moneyText(item.cost_price), sale: moneyText(item.sale_price), wholesale: moneyText(item.wholesale_price), minQty: item.wholesale_min_qty_milli == null ? '' : formatQty(item.wholesale_min_qty_milli) }),
    [item.cost_price, item.sale_price, item.wholesale_price, item.wholesale_min_qty_milli],
  );
  const row = useRowEdit({
    fields,
    initial,
    onSave: async (v) => {
      const next = { cost: v.cost ?? '', sale: v.sale ?? '', wholesale: v.wholesale ?? '', minQty: v.minQty ?? '' };
      const r = buildPricePatch(initial, next, parseQtyInput);
      if (!r.ok) throw new Error(r.message);
      await updateProductPrices(getSupabase(), shopId, item.product_id, r.patch);
      await refreshAll();
      toast.success(`${item.name}: narx saqlandi.`);
    },
  });

  const low = item.qty_milli < 0n || (item.qty_milli >= 0n && item.qty_milli <= 3000n);
  const neg = item.qty_milli < 0n;
  const diff = qtyRow.editing ? adjustDiffText(item.qty_milli, qtyRow.values.qty ?? '') : null;
  const noPrice = item.sale_price === null && item.is_active;
  const noCost = item.cost_price === null && item.is_active;
  const busy = row.busy || qtyRow.busy;

  // Ogohlantirishlar (saqlashni to'smaydi): ko'rinishda saqlangan qiymatlar, tahrirda kiritilayotganlar
  const liveCost = row.editing ? parseMoney(row.values.cost) : item.cost_price;
  const liveSale = row.editing ? parseMoney(row.values.sale) : item.sale_price;
  const liveWholesale = row.editing ? parseMoney(row.values.wholesale) : (item.wholesale_price ?? null);
  const warnings = [costAboveSaleWarning(liveCost, liveSale), pricing.wholesaleEnabled ? wholesaleAboveSaleWarning(liveWholesale, liveSale) : null].filter((w): w is string => w !== null);
  const hint = row.isEditing('sale') ? markupHint(row.values.cost ?? '', row.values.sale ?? '', pricing.markupPercent) : null;
  // Sotuv narxi bo'sh tovarda "narx kiriting" bosilganda ustama taklifi maydonga TAKLIF sifatida yoziladi (foydalanuvchi o'zgartiradi
  // yoki Enter bilan qabul qiladi). Qo'lda kiritilgan narx hech qachon almashtirilmaydi: taklif faqat sotuv narxi bo'shligida.
  const proposed = item.sale_price === null ? suggestedSaleText(initial.cost, pricing.markupPercent) : null;
  const showProposed = row.isEditing('sale') && proposed !== null && (row.values.sale ?? '') === proposed;
  function startSale() {
    row.start('sale');
    if (proposed) row.set('sale', proposed);
  }

  const placeholderBtn = 'min-h-11 whitespace-nowrap rounded-lg border border-dashed border-amber-500 px-3 py-1.5 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10 md:text-right';

  return (
    <EditableRow row={row} as="li" className={cn('px-3 py-3', gridClass(pricing), neg && pricing.stockEnabled ? 'bg-amber-50 dark:bg-amber-500/10' : '')}>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className="break-words text-[15px] font-semibold text-fg">
          {item.name} {!item.is_active && <Badge>arxiv</Badge>}
          <span className="ml-2 text-sm font-normal text-muted md:hidden">{unitLabel}</span>
        </p>
      </div>

      {pricing.stockEnabled && (
        <Labeled label="Qoldiq" className="md:text-right">
          {qtyRow.editing ? (
            <>
              <input
                autoFocus
                aria-label={`Qoldiq: ${item.name}`}
                inputMode="decimal"
                value={qtyRow.values.qty ?? ''}
                disabled={qtyRow.busy}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => qtyRow.set('qty', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void qtyRow.save();
                  } else if (e.key === 'Escape') qtyRow.cancel();
                }}
                aria-invalid={qtyRow.errors.qty ? true : undefined}
                className={cn('h-11 w-full rounded-xl border bg-surface px-3 text-right text-[15px] font-semibold tabular-nums text-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25', qtyRow.errors.qty ? 'border-rose-500' : 'border-line')}
              />
              {qtyRow.errors.qty && (
                <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {qtyRow.errors.qty}
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              disabled={!canAdjust}
              aria-label={`Qoldiq: ${item.name}: tuzatish`}
              title="Ikki marta bosing yoki Enter: qoldiqni tuzatish"
              onDoubleClick={() => qtyRow.start()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F2') {
                  e.preventDefault();
                  qtyRow.start();
                }
              }}
              className="min-h-11 w-full rounded-lg px-2 text-left tabular-nums hover:bg-subtle disabled:hover:bg-transparent md:text-right"
            >
              {low && !neg && <Badge tone="amber" className="mr-2">Kam qoldi</Badge>}
              {neg && <Badge tone="red" className="mr-2">Manfiy</Badge>}
              <span className={cn('text-[15px] font-semibold', neg ? 'text-amber-700 dark:text-amber-400' : 'text-fg')}>{formatQty(item.qty_milli)}</span>
            </button>
          )}
        </Labeled>
      )}

      <span className="hidden text-sm text-muted md:block">{unitLabel}</span>

      <Labeled label="Tan narx">
        {item.cost_price === null && !row.isEditing('cost') ? (
          noCost ? (
            <button type="button" disabled={!canAdjust || busy} onClick={() => row.start('cost')} aria-label={`Tan narx kiriting: ${item.name}`} className={placeholderBtn}>
              tan narx kiriting
            </button>
          ) : (
            <span className="text-muted">—</span>
          )
        ) : (
          <EditableCell field={fields[0]!} row={row} right disabled={!canAdjust} display={<Money value={item.cost_price ?? 0n} className="text-[15px] font-semibold text-fg" />} />
        )}
      </Labeled>

      <Labeled label="Sotuv narxi">
        {item.sale_price === null && !row.isEditing('sale') ? (
          noPrice ? (
            <button type="button" disabled={!canAdjust || busy} onClick={startSale} aria-label={`Narx kiriting: ${item.name}`} className={placeholderBtn}>
              narx kiriting
            </button>
          ) : (
            <span className="text-muted">—</span>
          )
        ) : (
          <EditableCell field={fields[1]!} row={row} right disabled={!canAdjust} display={<Money value={item.sale_price ?? 0n} className="text-[15px] font-semibold text-fg" />} />
        )}
      </Labeled>

      {pricing.wholesaleEnabled && (
        <Labeled label="Optom narx">
          {row.isEditing('wholesale') && <span className="block text-[11px] text-muted">narx va shu miqdordan boshlab</span>}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-1">
            {item.wholesale_price == null && !row.isEditing('wholesale') ? (
              <button type="button" disabled={!canAdjust || busy} onClick={() => row.start()} aria-label={`Optom narx kiriting: ${item.name}`} className="min-h-11 whitespace-nowrap rounded-lg px-2 text-left text-sm text-muted hover:bg-subtle md:text-right">
                optom yo&apos;q
              </button>
            ) : (
              <EditableCell field={fields[2]!} row={row} right disabled={!canAdjust} display={<Money value={item.wholesale_price ?? 0n} className="text-[15px] font-semibold text-fg" />} />
            )}
            {(item.wholesale_min_qty_milli != null || row.isEditing('minQty') || row.isEditing('wholesale')) && (
              <EditableCell
                field={fields[3]!}
                row={row}
                right
                disabled={!canAdjust}
                display={<span className="text-sm text-muted">{item.wholesale_min_qty_milli == null ? 'miqdor kiriting' : `${formatQty(item.wholesale_min_qty_milli)} ${unitLabel} dan`}</span>}
              />
            )}
          </div>
        </Labeled>
      )}

      <div className="col-span-2 flex flex-wrap justify-end gap-2 md:col-span-1">
        <RowActions
          row={row}
          label={`${item.name} narxi`}
          disabled={!canAdjust || qtyRow.editing}
          extra={null}
        />
        {pricing.stockEnabled && !row.editing && !qtyRow.editing && (
          <button type="button" disabled={!canAdjust} onClick={() => qtyRow.start()} className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-fg hover:bg-subtle disabled:opacity-50" aria-label={`${item.name}: qoldiqni tuzatish`}>
            Qoldiq
          </button>
        )}
      </div>

      {(warnings.length > 0 || hint || showProposed || row.errors.cost || row.errors.sale || row.errors.wholesale || row.errors.minQty || row.formError) && (
        <div className="col-span-2 space-y-1 md:col-span-full" data-testid="price-notes">
          {hint && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg" role="status">
              Ustama {pricing.markupPercent}% bo&apos;yicha taklif: <strong className="tabular-nums">{hint.text} so&apos;m</strong>
              {/* onMouseDown: tugma fokusni olmasin (aks holda maydon blur bo'lib tahrir yopiladi va bosish yo'qoladi) */}
              <button type="button" className="min-h-11 rounded-lg border border-emerald-500 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" onMouseDown={(e) => e.preventDefault()} onClick={() => row.set('sale', hint.text)} aria-label="Taklif narxni qo'llash">
                Qo&apos;llash
              </button>
            </p>
          )}
          {showProposed && (
            <p className="text-sm text-fg" role="status">
              Ustama {pricing.markupPercent}% bo&apos;yicha taklif qilindi: o&apos;zgartirishingiz yoki Enter bilan qabul qilishingiz mumkin.
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} role="status" className="text-xs font-medium text-amber-800 dark:text-amber-300">
              {w}
            </p>
          ))}
          {Object.values(row.errors).map((e) => (
            <p key={e} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {e}
            </p>
          ))}
          <RowError row={row} />
        </div>
      )}

      {qtyRow.editing && (
        <div className="col-span-2 space-y-2 rounded-xl border-2 border-emerald-500/60 p-3 md:col-span-full" data-testid="adjust-panel">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Tuzatish: {diff ?? '—'}</p>
          <label className="flex flex-col gap-1 text-sm text-muted sm:max-w-xs">
            Sabab (majburiy)
            <select
              value={qtyRow.values.reason ?? ''}
              disabled={qtyRow.busy}
              onChange={(e) => qtyRow.set('reason', e.target.value)}
              aria-label="Sabab"
              aria-invalid={qtyRow.errors.reason ? true : undefined}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg"
            >
              {STOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {qtyRow.errors.reason && <p role="alert" className="text-xs font-medium text-rose-600">{qtyRow.errors.reason}</p>}
          <p className="text-xs text-muted">Jurnalga yangi yozuv qo&apos;shiladi, eski qoldiq ustiga yozilmaydi.</p>
          <RowError row={qtyRow} />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="h-11" loading={qtyRow.busy} onClick={() => void qtyRow.save()} aria-label={`${item.name}: qoldiqni saqlash`}>
              Saqlash
            </Button>
            <Button size="lg" variant="outline" className="h-11" disabled={qtyRow.busy} onClick={qtyRow.cancel}>
              Bekor
            </Button>
          </div>
        </div>
      )}
    </EditableRow>
  );
}

/** Kiritish matni → so'm (bo'sh/xato = null): faqat ogohlantirish uchun, hisob core'da */
function parseMoney(raw: string | undefined): bigint | null {
  const r = parseMoneyInput(raw ?? '', { allowZero: true });
  return r.ok ? r.value : null;
}

export function StockTab({ books, loading, reload }: { books: BooksData | null; loading: boolean; reload: () => Promise<void> }) {
  const { membership, pricing } = useShop();
  const [q, setQ] = usePageQuery();
  const [filter, setFilter] = useState<StockFilter>('all');
  const canAdjust = can(membership.role, 'stock.adjust');
  const stock = useMemo(() => books?.stock ?? [], [books]);
  const counts = useMemo(() => stockCounts(stock), [stock]);
  // "Baza" o'chirilganda qoldiq filtri ishlamaydi: tanlangan bo'lsa "Hammasi"ga qaytadi
  const effectiveFilter: StockFilter = !pricing.stockEnabled && (filter === 'low' || filter === 'negative') ? 'all' : filter;
  const rows = useMemo(() => filterStock(stock, { query: q, filter: effectiveFilter, stockEnabled: pricing.stockEnabled }), [stock, q, effectiveFilter, pricing.stockEnabled]);

  const exportCsv = () => {
    const header = ['Tovar', ...(pricing.stockEnabled ? ['Qoldiq'] : []), 'Birlik', 'Tan narx', 'Sotuv narxi', ...(pricing.wholesaleEnabled ? ['Optom narx', 'Optom miqdor'] : [])];
    const data = rows.map((i) => [
      i.name,
      ...(pricing.stockEnabled ? [formatQty(i.qty_milli)] : []),
      uz.units[i.unit],
      i.cost_price,
      i.sale_price,
      ...(pricing.wholesaleEnabled ? [i.wholesale_price ?? null, i.wholesale_min_qty_milli == null ? null : formatQty(i.wholesale_min_qty_milli)] : []),
    ]);
    downloadCsv('ombor.csv', toCsv(header, data));
  };

  const pill = (value: StockFilter, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={effectiveFilter === value}
      onClick={() => setFilter(effectiveFilter === value ? 'all' : value)}
      className={cn('min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors', effectiveFilter === value ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-line text-fg hover:bg-subtle')}
    >
      {label}
    </button>
  );

  return (
    <>
      <WarehouseSettings />
      {pricing.stockEnabled && counts.negative > 0 && effectiveFilter !== 'negative' && (
        <Alert tone="amber" className="mb-3">
          {counts.negative} ta tovarning qoldig&apos;i manfiy: kirim yozilmagan bo&apos;lishi mumkin.
        </Alert>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pricing.stockEnabled && pill('low', `Kam qolgan (${counts.low})`)}
        {pricing.stockEnabled && pill('negative', 'Manfiy qoldiq')}
        {pill('noprice', `Narxi yo'q (${counts.noPrice})`)}
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
            <div className={cn('hidden border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid', gridClass(pricing))} aria-hidden>
              <span>Tovar</span>
              {pricing.stockEnabled && <span className="text-right">Qoldiq</span>}
              <span>Birlik</span>
              <span className="text-right">Tan narx</span>
              <span className="text-right">Sotuv narxi</span>
              {pricing.wholesaleEnabled && <span className="text-right">Optom narx</span>}
              <span />
            </div>
            <ul className="divide-y divide-line" aria-label="Ombor narxlari va qoldig'i">
              {rows.map((i) => (
                <StockRow key={i.product_id} item={i} reload={reload} canAdjust={canAdjust} pricing={pricing} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
