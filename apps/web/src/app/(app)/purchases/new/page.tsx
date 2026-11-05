'use client';
import { ArrowLeft, CheckCircle2, PackagePlus, Plus, Save, Trash2, UserPlus, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { ProductSearch } from '@/components/forms/ProductSearch';
import { SupplierFormModal } from '@/components/forms/SupplierFormModal';
import { Money } from '@/components/shared';
import { DataGate } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { useBooks } from '@/components/useBooks';
import { Alert, Button, Card, CardHeader, Input, LinkButton, PageHeader, Select } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import { supplierTotals } from '@/lib/data/books';
import { postPurchase } from '@/lib/data/purchases';
import { PAYMENT_METHODS, type PaymentMethod, type Product } from '@/lib/data/types';
import { toAppError } from '@/lib/errors';
import { formatMoneyInput, formatQty, formatSom, lineTotal, parseMoneyInput, parseQtyInput } from '@/lib/money';
import { buildPurchasePlan, isBlankPurchaseLine, purchaseEffects, resolveProduct, type PurchaseDraftLine, type PurchaseLineErrors, type PurchasePlan } from '@/lib/purchaseForm';
import { getSupabase } from '@/lib/supabase/client';

const newLine = (): PurchaseDraftLine => ({ key: crypto.randomUUID(), productId: null, productName: '', qty: '', unitCost: '' });
const newKeys = () => ({ purchaseId: crypto.randomUUID(), op: crypto.randomUUID() });

interface Done {
  supplierName: string;
  plan: PurchasePlan;
}

function NewPurchase({ data }: { data: ShopData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { shopId, reload } = useShop();
  const books = useBooks();

  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const [docDate, setDocDate] = useState('');
  const [lines, setLines] = useState<PurchaseDraftLine[]>(() => [newLine()]);
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [keys, setKeys] = useState(newKeys);
  const [lineErrors, setLineErrors] = useState<Map<string, PurchaseLineErrors>>(new Map());
  const [formError, setFormError] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  /** Tarmoq xatosidan keyin forma qulflanadi: kirim saqlangan bo'lishi mumkin (qayta urinish o'sha kalit bilan) */
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);

  const suppliers = useMemo(() => (books.data?.suppliers ?? []).filter((s) => s.is_active || s.id === supplierId), [books.data, supplierId]);
  const outstanding = useMemo(() => (books.data ? supplierTotals(books.data) : new Map()), [books.data]);
  const balanceBefore: bigint = supplierId ? (outstanding.get(supplierId)?.outstanding ?? 0n) : 0n;
  /** Oxirgi kirim tan narxi: yangi qatorda taklif sifatida */
  const lastCost = useMemo(() => new Map((books.data?.stock ?? []).map((s) => [s.product_id, s.cost_price])), [books.data]);

  const preview = buildPurchasePlan({ lines, products: data.products, balanceBefore, paid, method });
  const goods = lines.reduce((s, l) => {
    const q = parseQtyInput(l.qty);
    const c = parseMoneyInput(l.unitCost, { allowZero: true });
    return q.ok && c.ok ? s + lineTotal({ qtyMilli: q.value, unitPrice: c.value }) : s;
  }, 0n);
  const paidParsed = paid.trim() === '' ? 0n : parseMoneyInput(paid, { allowZero: true });
  const paidNow = typeof paidParsed === 'bigint' ? paidParsed : paidParsed.ok ? paidParsed.value : 0n;
  const balanceAfter = balanceBefore + goods - paidNow;
  const effects = preview.ok ? purchaseEffects(preview.plan.lines) : null;
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  function update(key: string, patch: Partial<PurchaseDraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setLineErrors((m) => {
      if (!m.has(key)) return m;
      const n = new Map(m);
      n.delete(key);
      return n;
    });
  }

  function pick(key: string, p: Product) {
    const cost = lastCost.get(p.id);
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, productId: p.id, productName: p.name, unitCost: l.unitCost.trim() || cost == null ? l.unitCost : formatMoneyInput(cost.toString()) } : l)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || done) return;
    if (!supplierId) {
      setFormError("Ta'minotchini tanlang.");
      return;
    }
    const res = buildPurchasePlan({ lines, products: data.products, balanceBefore, paid, method });
    if (!res.ok) {
      setLineErrors(res.lineErrors);
      setPaidError(res.paidError ?? null);
      setFormError(res.message);
      return;
    }
    const plan = res.plan;
    setLineErrors(new Map());
    setPaidError(null);
    setFormError(null);
    setBusy(true);
    try {
      await postPurchase(getSupabase(), {
        shopId,
        purchaseId: keys.purchaseId,
        clientOpId: keys.op,
        supplierId,
        docDate: docDate || null,
        lines: plan.lines,
        clientTotal: plan.subtotal,
        paid: plan.paid,
        method: plan.method,
      });
    } catch (err) {
      const appErr = toAppError(err);
      // Server rad etdi — hech narsa saqlanmagan. Tarmoq/noma'lum xato — saqlangan bo'lishi mumkin: forma qulflanadi,
      // qayta urinish o'sha kalit bilan yuboriladi (takroriy kirim yaratilmaydi).
      if (appErr.kind !== 'validation' && appErr.kind !== 'forbidden' && appErr.kind !== 'auth' && appErr.kind !== 'not_found') setLocked(true);
      setFormError(appErr.message);
      setBusy(false);
      return;
    }
    await Promise.all([reload(), books.reload()]);
    setDone({ supplierName: suppliers.find((s) => s.id === supplierId)?.name ?? "Ta'minotchi", plan });
    setBusy(false);
  }

  function reset() {
    setLines([newLine()]);
    setPaid('');
    setDocDate('');
    setKeys(newKeys());
    setLocked(false);
    setFormError(null);
    setLineErrors(new Map());
    setPaidError(null);
    setDone(null);
  }

  if (done) {
    return (
      <>
        <PageHeader title="Kirim saqlandi" description={done.supplierName} />
        <Card className="mx-auto max-w-xl" data-testid="purchase-result">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              <p className="text-sm font-semibold">Yozildi. Ombor qoldig&apos;i va tan narx yangilandi.</p>
            </div>
            <dl className="space-y-2.5 rounded-xl bg-subtle p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Eski qarz</dt>
                <dd>
                  <Money value={done.plan.balanceBefore} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Tovar (kirim)</dt>
                <dd>
                  <Money value={done.plan.subtotal} className="font-semibold text-fg" />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Berildi</dt>
                <dd>
                  <Money value={done.plan.paid} className="font-semibold text-emerald-600 dark:text-emerald-400" />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <dt className="text-muted">Ostatka (qarzingiz)</dt>
                <dd>
                  <Money value={done.plan.balanceAfter} className="text-xl font-semibold text-fg" />
                </dd>
              </div>
            </dl>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button size="lg" onClick={reset} icon={<Plus className="h-4 w-4" />}>
                Yana kirim
              </Button>
              <LinkButton href="/warehouse" size="lg" variant="outline" icon={<Warehouse className="h-4 w-4" />}>
                Ombor
              </LinkButton>
              <Button size="lg" variant="outline" onClick={() => router.push('/dashboard')}>
                Bosh sahifa
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const frozen = busy || locked;
  return (
    <>
      <Link href="/books/in" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Kirim daftari
      </Link>
      <PageHeader title="Kirim yozish" description="Ta'minotchidan kelgan tovar: qatorlar, berilgan summa, qoldiq qarz" />

      {books.error && !books.data && (
        <Alert tone="red" className="mb-4">
          {books.error}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-3 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Ta'minotchi" />
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
              <Select label="Ta'minotchi" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={frozen} wrapClassName="flex-1">
                <option value="">— tanlang —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Input label="Sana (ixtiyoriy)" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} disabled={frozen} wrapClassName="sm:w-44" />
              <Button variant="outline" onClick={() => setAddingSupplier(true)} disabled={frozen} icon={<UserPlus className="h-4 w-4" />}>
                Yangi
              </Button>
            </div>
            {supplierId && (
              <p className="-mt-2 px-4 pb-4 text-xs text-muted">
                Hozirgi qarzingiz: <Money value={balanceBefore} className={balanceBefore > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold'} />
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Tovarlar" description="Tovar, miqdor va tan narx (birlik narxi)" />
            <div className="divide-y divide-line">
              {lines.map((l, i) => {
                const errs = lineErrors.get(l.key) ?? {};
                const q = parseQtyInput(l.qty);
                const c = parseMoneyInput(l.unitCost, { allowZero: true });
                const total = q.ok && c.ok ? lineTotal({ qtyMilli: q.value, unitPrice: c.value }) : null;
                const p = resolveProduct(data.products, l);
                return (
                  <div key={l.key} className="grid grid-cols-12 gap-x-3 gap-y-2.5 p-4 sm:p-5">
                    <ProductSearch
                      value={l.productName}
                      products={data.products}
                      onText={(t) => update(l.key, { productName: t, productId: null })}
                      onPick={(pr) => pick(l.key, pr)}
                      error={errs.product}
                      disabled={frozen}
                      autoFocus={i === 0 && !supplierId ? false : i === 0}
                      wrapClassName="col-span-10 sm:col-span-11"
                    />
                    <div className="col-span-2 flex items-start justify-end sm:col-span-1">
                      <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} disabled={frozen} aria-label={`${i + 1}-qatorni o'chirish`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      aria-label="Miqdor"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => update(l.key, { qty: e.target.value })}
                      error={errs.qty}
                      placeholder="Miqdor"
                      suffix={p ? uz.units[p.unit] : undefined}
                      disabled={frozen}
                      wrapClassName="col-span-6 sm:col-span-4"
                    />
                    <Input
                      aria-label="Tan narx"
                      inputMode="numeric"
                      value={l.unitCost}
                      onChange={(e) => update(l.key, { unitCost: formatMoneyInput(e.target.value) })}
                      error={errs.cost}
                      placeholder="Tan narx"
                      suffix="so'm"
                      disabled={frozen}
                      wrapClassName="col-span-6 sm:col-span-5"
                    />
                    <p className="col-span-12 text-right text-xs text-muted sm:col-span-3 sm:self-center">
                      {total !== null ? (
                        <>
                          Qator: <Money value={total} className="font-semibold text-fg" />
                        </>
                      ) : (
                        'Qator: —'
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line p-4">
              <Button variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])} disabled={frozen || lines.length >= 200} icon={<Plus className="h-4 w-4" />}>
                Qator qo&apos;shish
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          <Card>
            <CardHeader title="To'lov va qoldiq" />
            <div className="space-y-4 p-4">
              <Input
                label="Berilgan summa"
                hint="Shu kirim bilan ta'minotchiga berilgan pul. Bo'sh = hammasi qarzga."
                inputMode="numeric"
                value={paid}
                onChange={(e) => {
                  setPaid(formatMoneyInput(e.target.value));
                  setPaidError(null);
                }}
                error={paidError}
                suffix="so'm"
                placeholder="0"
                disabled={frozen}
              />
              {paidNow > 0n && (
                <Select label="To'lov usuli" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={frozen}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {uz.methods[m]}
                    </option>
                  ))}
                </Select>
              )}
              <dl className="space-y-2 rounded-xl bg-subtle p-3.5 text-sm" data-testid="purchase-summary">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Eski qarz</dt>
                  <dd>
                    <Money value={balanceBefore} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Tovar (kirim)</dt>
                  <dd>
                    <Money value={goods} className="font-semibold text-fg" />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Berildi</dt>
                  <dd>
                    <Money value={paidNow} className="text-emerald-600 dark:text-emerald-400" />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="text-muted">Ostatka</dt>
                  <dd>
                    <Money value={balanceAfter} className="text-base font-semibold text-fg" />
                  </dd>
                </div>
              </dl>
              {effects && effects.size > 0 && (
                <ul className="space-y-1 text-xs text-muted" data-testid="purchase-effects">
                  {[...effects.entries()].map(([pid, fx]) => (
                    <li key={pid}>
                      {productById.get(pid)?.name}: omborga +{formatQty(fx.addedQtyMilli)}, tan narx {formatSom(fx.newCost)}
                    </li>
                  ))}
                </ul>
              )}
              {formError && (
                <Alert tone="red">
                  {formError}
                  {locked && <span className="mt-1 block text-xs">Kirim saqlangan bo&apos;lishi mumkin. «Qayta urinish» uni ikki marta yozmaydi.</span>}
                </Alert>
              )}
              <Button type="submit" size="lg" className="w-full" loading={busy} icon={<Save className="h-4 w-4" />}>
                {locked ? 'Qayta urinish' : 'Kirimni saqlash'}
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <PackagePlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Summa saqlashdan oldin serverda qayta tekshiriladi.
              </p>
            </div>
          </Card>
        </div>
      </form>

      <SupplierFormModal
        open={addingSupplier}
        onClose={() => setAddingSupplier(false)}
        onSaved={(s) => {
          void books.reload().then(() => setSupplierId(s.id));
        }}
      />
    </>
  );
}

export default function NewPurchasePage() {
  return (
    <DataGate>
      {(data) => (
        <Suspense>
          <NewPurchase data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
