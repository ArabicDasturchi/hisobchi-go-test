'use client';
/**
 * Mahsulotlar (P-09/M-09): nom, birlik, sotuv narxi, holat. Tan narx va foyda ustuni YO'Q (savdogar mijoz ko'rib
 * turganda ro'yxat yozishi mumkin). Nom, birlik, narx va arxivlash joyida tuzatiladi (`updateProduct`).
 * Narxi yo'q mahsulotlar sariq belgi bilan haqiqiy holatda ko'rsatiladi, yashirilmaydi.
 * Takroriy tovar (W4): bir xil nom + birlik saqlanmaydi, boshqa birlik yoki o'xshash nom sariq ogohlantirish oladi,
 * arxivdagi aynan shu tovar faollashtirishga taklif qilinadi (`checkProductDuplicate`, faqat klient tekshiruvi).
 */
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { BaseTabs } from '@/components/base/BaseTabs';
import { EditableCell } from '@/components/edit/EditableCell';
import { EditableRow, RowActions, RowError } from '@/components/edit/EditableRow';
import { useRowEdit } from '@/components/edit/useRowEdit';
import { usePageQuery } from '@/components/layout/pageQuery';
import { DataGate } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert, Badge, Button, Card, cn, EmptyState, Input, SearchInput, Select, TableSkeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import { createProduct, updateProduct } from '@/lib/data/api';
import type { Product, Unit } from '@/lib/data/types';
import { errorMessage } from '@/lib/errors';
import { formatMoneyInput } from '@/lib/money';
import { checkProductDuplicate, identityChanged } from '@/lib/productIdentity';
import { filterProducts, productFields, productInitial, valuesToInput, type ProductFilter } from '@/lib/productsView';
import { validateRow } from '@/lib/rowEdit';
import { getSupabase } from '@/lib/supabase/client';
import { parseEnabledUnits, unitChoices } from '@/lib/units';

const GRID = 'grid items-center gap-x-3 gap-y-0 grid-cols-[minmax(0,1fr)_auto_auto] md:gap-y-1 md:grid-cols-[minmax(0,2fr)_7rem_10rem_5rem_auto]';
/** Telefonda: nom va birlik chapda ustma-ust, narx va tugma o'ngda; tahrirda bir ustun */
const place = (editing: boolean, mobile: string) => (editing ? 'col-span-full' : `${mobile} md:col-auto md:row-auto md:row-span-1`);

function ProductRow({ p, units, products }: { p: Product; units: readonly Unit[]; products: readonly Product[] }) {
  const { shopId, reload } = useShop();
  const toast = useToast();
  const fields = useMemo(() => productFields(units), [units]);
  const initial = useMemo(() => productInitial(p), [p]);
  const row = useRowEdit({
    fields,
    initial,
    onSave: async (v) => {
      const input = valuesToInput(v, p.is_active);
      if (identityChanged(p, input)) {
        const dup = checkProductDuplicate(products, input, { selfId: p.id, mode: 'edit' });
        if (dup.error) throw new Error(dup.error);
      }
      await updateProduct(getSupabase(), shopId, p.id, input);
      await reload();
      toast.success('Mahsulot yangilandi.');
    },
  });
  const [toggling, setToggling] = useState(false);
  const noPrice = p.last_price === null;
  // Tahrir paytida jonli ogohlantirish (sariq): boshqa birlikda yoki o'xshash nomli tovar bor
  const editInput = row.editing ? valuesToInput(row.values, p.is_active) : null;
  const editWarnings = editInput && identityChanged(p, editInput) ? checkProductDuplicate(products, editInput, { selfId: p.id, mode: 'edit' }).warnings : [];

  async function toggleActive() {
    if (toggling) return;
    if (!p.is_active) {
      // Arxivdan qaytarishda faol egizak bo'lsa, katalogda ikki bir xil tovar paydo bo'lmasin
      const dup = checkProductDuplicate(products, { name: p.name, unit: p.unit }, { selfId: p.id, mode: 'edit' });
      if (dup.error) {
        toast.error(dup.error);
        return;
      }
    }
    setToggling(true);
    try {
      await updateProduct(getSupabase(), shopId, p.id, { name: p.name, unit: p.unit, last_price: p.last_price, is_active: !p.is_active });
      await reload();
      toast.success(p.is_active ? 'Mahsulot arxivlandi.' : 'Mahsulot faollashtirildi.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setToggling(false);
    }
  }

  return (
    <EditableRow row={row} as="li" className={cn('px-3 py-2', GRID, noPrice && p.is_active ? 'bg-amber-50 dark:bg-amber-500/10' : '')}>
      <EditableCell field={row.fields[0]!} row={row} className={cn('font-medium text-fg', place(row.editing, 'col-start-1 row-start-1'))} display={<span className="block truncate text-[15px] font-semibold">{p.name}</span>} />
      <EditableCell field={row.fields[1]!} row={row} className={cn('text-sm text-muted', place(row.editing, 'col-start-1 row-start-2'))} display={<span>{uz.units[p.unit] ?? p.unit}</span>} />
      <EditableCell
        field={row.fields[2]!}
        row={row}
        right
        className={cn('md:justify-self-stretch', place(row.editing, 'col-start-2 row-start-1 row-span-2'))}
        display={
          noPrice ? (
            <span className="inline-block rounded-lg border border-dashed border-amber-500 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">narx kiriting</span>
          ) : (
            <span className="text-[15px] font-semibold tabular-nums text-fg">{groupPrice(p.last_price!)} so&apos;m</span>
          )
        }
      />
      <span className="hidden md:block">{p.is_active ? <Badge tone="green">Faol</Badge> : <Badge>Arxiv</Badge>}</span>
      <div className={cn('flex flex-wrap items-center justify-end gap-2', place(row.editing, 'col-start-3 row-start-1 row-span-2'))}>
        <RowActions
          row={row}
          label={p.name}
          extra={
            row.mode?.only === null ? (
              <Button variant="ghost" size="lg" className="h-11" loading={toggling} disabled={row.busy} onClick={() => void toggleActive()}>
                {p.is_active ? 'Arxivlash' : 'Faollashtirish'}
              </Button>
            ) : null
          }
        />
      </div>
      {row.formError && (
        <div className="md:col-span-full">
          <RowError row={row} />
        </div>
      )}
      {editWarnings.length > 0 && (
        <div className="col-span-full mt-1 space-y-1" data-testid="product-duplicate-warning">
          {editWarnings.map((w) => (
            <Alert key={w} tone="amber">
              {w}
            </Alert>
          ))}
        </div>
      )}
    </EditableRow>
  );
}

const groupPrice = (v: bigint) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Yangi mahsulot (P-09n): "Tasdiqlanmagan" paneli; Saqlash bosilmaguncha hech narsa yozilmaydi */
function NewProduct({ units, products, onClose }: { units: readonly Unit[]; products: readonly Product[]; onClose: () => void }) {
  const { shopId, reload } = useShop();
  const toast = useToast();
  const fields = useMemo(() => productFields(units), [units]);
  const [v, setV] = useState({ name: '', unit: units[0] ?? 'dona', price: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reactivate, setReactivate] = useState<Product | null>(null);
  const dup = useMemo(() => checkProductDuplicate(products, { name: v.name, unit: v.unit as Unit }, { mode: 'create' }), [products, v.name, v.unit]);

  async function save() {
    if (busy) return;
    const errs = validateRow(fields, v);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Takror: bir xil nom + birlik saqlanmaydi (klient tekshiruvi; bazada UNIQUE hali yo'q)
    if (dup.error) {
      setFormError(dup.error);
      setReactivate(dup.reactivate);
      return;
    }
    setBusy(true);
    setFormError(null);
    setReactivate(null);
    try {
      await createProduct(getSupabase(), shopId, valuesToInput(v, true));
      await reload();
      toast.success(`«${v.name.trim()}» qo'shildi.`);
      onClose();
    } catch (e) {
      setFormError(errorMessage(e));
      setBusy(false);
    }
  }

  /** Arxivdagi aynan shu tovarni qaytarish (yangi takror yaratish o'rniga) */
  async function activateArchived(p: Product) {
    if (busy) return;
    setBusy(true);
    try {
      await updateProduct(getSupabase(), shopId, p.id, { name: p.name, unit: p.unit, last_price: p.last_price, is_active: true });
      await reload();
      toast.success(`«${p.name}» arxivdan qaytarildi.`);
      onClose();
    } catch (e) {
      setFormError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3 border-2 border-emerald-500/60 p-4" data-testid="new-product">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Yangi mahsulot</h2>
        <span className="rounded-full border border-amber-500/60 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Tasdiqlanmagan</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_8rem_10rem_auto] sm:items-start"
        noValidate
      >
        <Input label="Nomi" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} maxLength={120} autoFocus placeholder="Masalan: Shakar" className="h-11" />
        <Select label="Birlik" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as Unit })} className="h-11">
          {units.map((u) => (
            <option key={u} value={u}>
              {uz.units[u]}
            </option>
          ))}
        </Select>
        <Input label="Sotuv narxi" inputMode="numeric" value={v.price} onChange={(e) => setV({ ...v, price: formatMoneyInput(e.target.value) })} error={errors.price} suffix="so'm" placeholder="narx kiriting" className="h-11" />
        <div className="flex gap-2 sm:mt-6">
          <Button type="submit" size="lg" className="h-11" loading={busy}>
            Saqlash
          </Button>
          <Button size="lg" variant="outline" className="h-11" onClick={onClose} disabled={busy}>
            Bekor
          </Button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted">Bu yerda faqat nom, birlik va sotuv narxi. Tan narx va optom narx Ombor sahifasida kiritiladi.</p>
      {dup.warnings.length > 0 && (
        <div className="mt-2 space-y-1" data-testid="product-duplicate-warning">
          {dup.warnings.map((w) => (
            <Alert key={w} tone="amber">
              {w}
            </Alert>
          ))}
        </div>
      )}
      {formError && (
        <Alert tone="red" className="mt-2">
          {formError}
          {reactivate && (
            <Button size="sm" variant="outline" className="ml-2 mt-1" loading={busy} onClick={() => void activateArchived(reactivate)}>
              Arxivdagini faollashtirish
            </Button>
          )}
        </Alert>
      )}
    </Card>
  );
}

function Products({ data }: { data: ShopData }) {
  const { membership } = useShop();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = usePageQuery();
  const [filter, setFilter] = useState<ProductFilter>('active');
  const [adding, setAdding] = useState(params.get('yangi') === '1');
  const units = useMemo(() => unitChoices(parseEnabledUnits(membership.shop.settings)), [membership.shop.settings]);

  useEffect(() => {
    // `+` menyusidan ochilgan bo'lsa manzil tozalanadi (yangilashda qayta ochilmasin)
    if (params.get('yangi') === '1') router.replace('/products', { scroll: false });
  }, [params, router]);

  const noPrice = useMemo(() => data.products.filter((p) => p.is_active && p.last_price === null).length, [data.products]);
  const rows = useMemo(() => filterProducts(data.products, { query: q, filter }), [data.products, q, filter]);
  const active = data.products.filter((p) => p.is_active).length;

  const pill = (value: ProductFilter, label: string, amber?: boolean) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
        filter === value ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : amber ? 'border-amber-500/70 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400' : 'border-line text-fg hover:bg-subtle',
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <BaseTabs current="products" />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Mahsulotlar</h1>
          <p className="text-sm text-muted">{active} ta tovar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pill('active', 'Faol')}
          {pill('archived', 'Arxiv')}
          {pill('noprice', `Sotuv narxi yo'q (${noPrice})`, noPrice > 0)}
          <Button size="lg" className="h-11" onClick={() => setAdding(true)} disabled={adding} icon={<Plus className="h-4 w-4" />}>
            Yangi mahsulot
          </Button>
        </div>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Mahsulot qidirish" className="mb-3 md:hidden" />

      {adding && <NewProduct units={units} products={data.products} onClose={() => setAdding(false)} />}

      <Card>
        {data.products.length === 0 ? (
          <EmptyState title="Katalog bo'sh" description="«Yangi mahsulot» bilan tez-tez sotiladigan tovarlarni narxi bilan qo'shing." />
        ) : rows.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" description="Qidiruv yoki filterni o'zgartirib ko'ring." />
        ) : (
          <>
            <div className={cn('hidden border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid', GRID)} aria-hidden>
              <span>Nomi</span>
              <span>Birlik</span>
              <span className="text-right">Sotuv narxi</span>
              <span>Holat</span>
              <span />
            </div>
            <ul className="divide-y divide-line" aria-label="Mahsulotlar">
              {rows.map((p) => (
                <ProductRow key={p.id} p={p} units={units} products={data.products} />
              ))}
            </ul>
            <p className="hidden border-t border-line px-4 py-2 text-xs text-muted md:block">Katakni ikki marta bosing yoki Enter: tuzatish. Enter saqlaydi, Esc bekor, Tab keyingi katakka.</p>
          </>
        )}
      </Card>
    </>
  );
}

export default function ProductsPage() {
  return (
    <DataGate skeleton={<Card><TableSkeleton /></Card>}>
      {(data) => (
        <Suspense>
          <Products data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
