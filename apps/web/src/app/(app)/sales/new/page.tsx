'use client';
import { AlertTriangle, ArrowLeft, CheckCircle2, Home, Minus, Plus, Receipt, RotateCw, Save, Share2, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { CustomerFormModal } from '@/components/forms/CustomerFormModal';
import { ProductPicker } from '@/components/forms/ProductPicker';
import { DataGate, Money } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert, Button, Card, CardHeader, cn, Input, LinkButton, PageHeader, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import { postSale, recordPayment } from '@/lib/data/api';
import { balanceOf } from '@/lib/data/ledger';
import { PAYMENT_METHODS, type PaymentMethod, type Product } from '@/lib/data/types';
import { shortNumber } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { formatMoneyInput, formatQty, formatSom } from '@/lib/money';
import { applyProduct, lacksSalePrice, stepQty, topProducts } from '@/lib/productPicker';
import { buildReceiptText } from '@/lib/receipt';
import { allowedModes, buildSalePlan, checkLine, DEFAULT_PAY_MODE, effectiveMode, isBlank, type DraftLine, type LineCheck, type PayMode, type SalePlan } from '@/lib/saleForm';
import { saleInsights } from '@/lib/saleInsights';
import { selectableCustomers } from '@/lib/data/customers';
import { getSupabase } from '@/lib/supabase/client';

const newLine = (): DraftLine => ({ key: crypto.randomUUID(), productName: '', qty: '', unit: 'dona', price: '' });

/** Bir martalik kalitlar: forma yuborilgach o'zgarmaydi — qayta urinish serverda takroriy yozuv yaratmaydi */
const newKeys = () => ({ saleId: crypto.randomUUID(), saleOp: crypto.randomUUID(), paymentId: crypto.randomUUID(), paymentOp: crypto.randomUUID() });

const QUICK_STEPS = [1n, 5n, 10n] as const;

interface Done {
  saleId: string;
  plan: SalePlan;
  customerName: string | null;
  /** Savdodan keyingi mijozning umumiy qarzi; mijozsiz savdoda null */
  debtAfter: bigint | null;
  receipt: string;
}

type Phase =
  | { kind: 'editing' }
  | { kind: 'saving' }
  /** Savdo serverda saqlandi, lekin to'lov yozilmadi — faqat to'lovni qayta yuborish mumkin */
  | { kind: 'payment_failed'; saleId: string; plan: SalePlan; message: string }
  /** Hammasi saqlandi: natija kartasi */
  | { kind: 'done'; done: Done };

function NewSale({ data }: { data: ShopData }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { shopId, reload, balances, membership, customerById } = useShop();

  const initialCustomer = params.get('customer');
  const [customerId, setCustomerId] = useState(initialCustomer && data.customers.some((c) => c.id === initialCustomer && c.is_active) ? initialCustomer : '');
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [pickedMode, setMode] = useState<PayMode>(DEFAULT_PAY_MODE);
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState(newKeys);
  /** Tarmoq xatosidan keyin forma qulflanadi: savdo serverda saqlangan bo'lishi mumkin */
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  const [lineErrors, setLineErrors] = useState<Map<string, LineCheck['errors']>>(new Map());
  const [formError, setFormError] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);

  const activeProducts = useMemo(() => data.products.filter((p) => p.is_active), [data.products]);
  // Arxivlangan mijoz yangi savdo tanlovida ko'rinmaydi (tarixi va qarzi saqlanadi)
  const customers = useMemo(() => selectableCustomers(data.customers), [data.customers]);
  const popular = useMemo(() => topProducts(data.products, data.sales, data.saleLines, 8), [data.products, data.sales, data.saleLines]);

  // Mijozsiz savdo faqat «To'landi»; mijoz olib tashlansa tanlangan «Qarzga/Qisman» o'zi «To'landi»ga qaytadi
  const mode = effectiveMode(pickedMode, customerId || null);
  const modes = allowedModes(customerId || null);
  const checks = lines.map((l) => (isBlank(l) ? null : checkLine(l)));
  const total = checks.reduce((s, c) => s + (c?.total ?? 0n), 0n);
  const preview = buildSalePlan({ lines, customerId: customerId || null, mode, partial });
  const currentDebt = customerId ? balanceOf(balances, customerId).debt : 0n;
  const insights = useMemo(() => saleInsights(lines, data.products, data.stock), [lines, data.products, data.stock]);

  const busy = phase.kind === 'saving';
  const frozen = locked || busy || phase.kind === 'payment_failed';

  function clearLineError(key: string) {
    setLineErrors((m) => {
      if (!m.has(key)) return m;
      const n = new Map(m);
      n.delete(key);
      return n;
    });
  }

  function update(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    clearLineError(key);
  }

  /** Katalogdan tanlandi: nom, birlik va sotish narxi avtomatik; savdogar faqat miqdorni yozadi */
  function pick(key: string, p: Product) {
    setLines((ls) => ls.map((l) => (l.key === key ? applyProduct(l, p) : l)));
    clearLineError(key);
  }

  /** "Ko'p sotilgan" tugmasi: bo'sh qatorni to'ldiradi, bo'lmasa yangi qator qo'shadi */
  function addPopular(p: Product) {
    setLines((ls) => {
      const blankAt = ls.findIndex(isBlank);
      if (blankAt >= 0) return ls.map((l, i) => (i === blankAt ? applyProduct(l, p) : l));
      return [...ls, applyProduct(newLine(), p)];
    });
  }

  async function savePayment(saleId: string, plan: SalePlan) {
    if (plan.paidNow <= 0n || !customerId) return;
    await recordPayment(getSupabase(), {
      shopId,
      paymentId: keys.paymentId,
      clientOpId: keys.paymentOp,
      customerId,
      amount: plan.paidNow,
      method,
      note: `Savdo ${shortNumber(saleId)} uchun`,
    });
  }

  async function finish(saleId: string, plan: SalePlan) {
    const customerName = customerId ? (customerById.get(customerId)?.name ?? null) : null;
    const debtAfter = customerId ? currentDebt + plan.debt : null;
    // mijozsiz savdo to'liq to'langan: chekda "to'landi" = jami
    const paid = customerId ? plan.paidNow : plan.total;
    const receipt = buildReceiptText({
      shopName: membership.shop.name,
      number: shortNumber(saleId),
      dateText: new Date().toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      customerName,
      lines: plan.lines.map((l) => ({ name: l.product_name, qtyMilli: l.qty_milli, unit: l.unit, unitPrice: l.unit_price })),
      total: plan.total,
      paid,
      debt: plan.debt,
      totalDebtAfter: debtAfter,
    });
    await reload();
    setPhase({ kind: 'done', done: { saleId, plan: { ...plan, paidNow: paid }, customerName, debtAfter, receipt } });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (phase.kind !== 'editing') return;
    const res = buildSalePlan({ lines, customerId: customerId || null, mode, partial });
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
    setPhase({ kind: 'saving' });

    let saleId: string;
    try {
      saleId = await postSale(getSupabase(), {
        shopId,
        saleId: keys.saleId,
        clientOpId: keys.saleOp,
        customerId: customerId || null,
        note: note.trim() || null,
        lines: plan.lines,
        clientTotal: plan.total,
      });
    } catch (err) {
      const appErr = toAppError(err);
      // Server rad etdi — hech narsa saqlanmagan, tuzatish mumkin. Tarmoq/noma'lum xato — saqlangan bo'lishi mumkin:
      // forma qulflanadi va qayta urinish o'sha kalit bilan yuboriladi (takroriy savdo yaratilmaydi).
      if (appErr.kind !== 'validation' && appErr.kind !== 'forbidden' && appErr.kind !== 'auth') setLocked(true);
      setFormError(appErr.message);
      setPhase({ kind: 'editing' });
      return;
    }

    try {
      await savePayment(saleId, plan);
    } catch (err) {
      setPhase({ kind: 'payment_failed', saleId, plan, message: toAppError(err).message });
      await reload();
      return;
    }
    await finish(saleId, plan);
  }

  async function retryPayment() {
    if (phase.kind !== 'payment_failed') return;
    const { saleId, plan } = phase;
    setPhase({ kind: 'saving' });
    try {
      await savePayment(saleId, plan);
      await finish(saleId, plan);
    } catch (err) {
      setPhase({ kind: 'payment_failed', saleId, plan, message: toAppError(err).message });
    }
  }

  function resetForm() {
    setLines([newLine()]);
    setCustomerId('');
    setMode(DEFAULT_PAY_MODE);
    setPartial('');
    setNote('');
    setKeys(newKeys());
    setLocked(false);
    setFormError(null);
    setLineErrors(new Map());
    setPaidError(null);
    setPhase({ kind: 'editing' });
  }

  async function shareReceipt(text: string) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Chek', text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // foydalanuvchi bekor qildi
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Chek nusxalandi. Telegram yoki SMS ga qo‘yishingiz mumkin.');
    } catch {
      toast.error('Nusxalab bo‘lmadi. Brauzer ruxsatini tekshiring.');
    }
  }

  // ----- Natija kartasi (S4) -----
  if (phase.kind === 'done') {
    const { done } = phase;
    const debt = done.plan.debt;
    return (
      <>
        <PageHeader title="Savdo saqlandi" description={`Savdo ${shortNumber(done.saleId)}${done.customerName ? ` · ${done.customerName}` : ' · mijozsiz (naqd)'}`} />
        <Card className="mx-auto max-w-xl" data-testid="sale-result">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              <p className="text-sm font-semibold">Yozildi. Hisob server tomonida qayta tekshirildi.</p>
            </div>
            <dl className="space-y-2.5 rounded-xl bg-subtle p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Jami</dt>
                <dd>
                  <Money value={done.plan.total} className="text-2xl font-semibold text-fg" />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">To&apos;langan</dt>
                <dd>
                  <Money value={done.plan.paidNow} className="font-semibold text-emerald-600 dark:text-emerald-400" />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Qarz</dt>
                <dd>
                  <Money value={debt} className={cn('font-semibold', debt > 0n && 'text-rose-600 dark:text-rose-400')} />
                </dd>
              </div>
              {done.debtAfter !== null && done.debtAfter > 0n && (
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="text-muted">Mijozning umumiy qarzi</dt>
                  <dd>
                    <Money value={done.debtAfter} className="font-semibold text-fg" />
                  </dd>
                </div>
              )}
            </dl>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button size="lg" onClick={resetForm} icon={<Plus className="h-4 w-4" />}>
                Yana savdo
              </Button>
              <Button size="lg" variant="outline" onClick={() => void shareReceipt(done.receipt)} icon={<Share2 className="h-4 w-4" />}>
                Chek ulashish
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/dashboard')} icon={<Home className="h-4 w-4" />}>
                Bosh sahifa
              </Button>
            </div>
            <LinkButton href={`/sales/${done.saleId}`} variant="ghost" size="sm" className="w-full">
              <Receipt className="h-3.5 w-3.5" /> Savdo tafsilotini ochish
            </LinkButton>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Savdolar
      </Link>
      <PageHeader title="Yangi savdo" description="Tovarni tanlang, miqdorni yozing, saqlang" />

      {phase.kind === 'payment_failed' && (
        <Alert tone="amber" title="Savdo saqlandi, lekin to'lov yozilmadi" className="mb-4">
          <p>{phase.message}</p>
          <p className="mt-1">
            Savdo {shortNumber(phase.saleId)} saqlandi. <Money value={phase.plan.paidNow} className="font-semibold" /> to&apos;lovni qayta yuboring yoki keyinroq mijoz sahifasidan kiriting.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={retryPayment} icon={<RotateCw className="h-3.5 w-3.5" />}>
              To&apos;lovni qayta yuborish
            </Button>
            <LinkButton href={`/sales/${phase.saleId}`} size="sm" variant="outline">
              Savdoni ochish
            </LinkButton>
          </div>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-3 pb-20 md:pb-0 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Mahsulotlar"
              description={activeProducts.length ? 'Katalogdan tanlang — birlik va narx o‘zi to‘ladi' : "Katalog bo'sh — nomni qo'lda yozing"}
            />
            {popular.length > 0 && (
              <div className="border-b border-line px-4 py-3 sm:px-5" data-testid="popular">
                <p className="mb-2 text-xs font-medium text-muted">Ko&apos;p sotilgan</p>
                <div className="flex flex-wrap gap-2">
                  {popular.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPopular(p)}
                      disabled={frozen}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-subtle active:bg-line/70 disabled:opacity-50"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="divide-y divide-line">
              {lines.map((l, i) => {
                const c = checks[i];
                const errs = lineErrors.get(l.key) ?? {};
                const ins = insights.perLine.get(l.key);
                const noPrice = lacksSalePrice(data.products, l.productName) && !l.price.trim();
                return (
                  <div key={l.key} className="grid grid-cols-12 gap-x-3 gap-y-2.5 p-4 sm:p-5">
                    <ProductPicker
                      value={l.productName}
                      products={data.products}
                      onText={(t) => update(l.key, { productName: t })}
                      onPick={(p) => pick(l.key, p)}
                      error={errs.name}
                      disabled={frozen}
                      autoFocus={i === 0}
                      wrapClassName="col-span-10 sm:col-span-11"
                    />
                    <div className="col-span-2 flex items-start justify-end sm:col-span-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))}
                        disabled={frozen}
                        aria-label={`${i + 1}-qatorni o'chirish`}
                        title="Qatorni o'chirish"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="col-span-12 sm:col-span-6">
                      <div className="flex flex-wrap items-start gap-1.5">
                        <Button variant="outline" size="icon" onClick={() => update(l.key, { qty: stepQty(l.qty, -1000n) })} disabled={frozen} aria-label="Miqdorni kamaytirish">
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          aria-label="Miqdor"
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => update(l.key, { qty: e.target.value })}
                          error={errs.qty}
                          placeholder="Miqdor"
                          suffix={uz.units[l.unit]}
                          disabled={frozen}
                          wrapClassName="w-28"
                          className="text-center"
                        />
                        <Button variant="outline" size="icon" onClick={() => update(l.key, { qty: stepQty(l.qty, 1000n) })} disabled={frozen} aria-label="Miqdorni oshirish">
                          <Plus className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-1 sm:ml-1">
                          {QUICK_STEPS.map((s) => (
                            <button
                              key={String(s)}
                              type="button"
                              onClick={() => update(l.key, { qty: stepQty(l.qty, s * 1000n) })}
                              disabled={frozen}
                              className="h-9 rounded-lg bg-subtle px-2.5 text-xs font-semibold text-fg transition-colors hover:bg-line/70 disabled:opacity-50"
                              aria-label={`${s} ga oshirish`}
                            >
                              +{String(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Input
                      aria-label="Birlik narxi"
                      inputMode="numeric"
                      value={l.price}
                      onChange={(e) => update(l.key, { price: formatMoneyInput(e.target.value) })}
                      error={errs.price}
                      placeholder={noPrice ? "Narxni yozing" : "Narx"}
                      suffix="so'm"
                      className={noPrice ? 'border-amber-400 ring-2 ring-amber-300/60 dark:border-amber-500/70' : undefined}
                      hint={noPrice ? <span className="font-medium text-amber-700 dark:text-amber-400" data-testid="no-price">Narx yo'q: qo'lda kiriting</span> : undefined}
                      disabled={frozen}
                      wrapClassName="col-span-12 sm:col-span-6"
                    />

                    <div className="col-span-12 space-y-1 text-xs">
                      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted">
                        <span>
                          {c?.total !== null && c?.total !== undefined ? (
                            <>
                              Qator summasi: <Money value={c.total} className="font-semibold text-fg" />
                            </>
                          ) : (
                            'Qator summasi: —'
                          )}
                        </span>
                        {ins && (
                          <span data-testid="line-profit">
                            {ins.profit !== null ? (
                              <>
                                Foyda:{' '}
                                <Money value={ins.profit} signed className={cn('font-semibold', ins.profit < 0n ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')} />
                              </>
                            ) : (
                              <span className="rounded bg-subtle px-1.5 py-0.5">tan narxi yo&apos;q</span>
                            )}
                          </span>
                        )}
                      </p>
                      {ins?.belowCost && ins.unitCost !== null && (
                        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400" role="status">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          Sotish narxi tan narxdan past (tan narx {formatSom(ins.unitCost)}). Saqlash mumkin.
                        </p>
                      )}
                      {ins?.stock === 'negative' && ins.stockMilli !== null && (
                        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400" role="status">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          Omborda {formatQty(ins.stockMilli)} {l.unit} bor: sotilsa qoldiq minusga tushadi. Saqlash mumkin.
                        </p>
                      )}
                      {ins?.stock === 'low' && ins.stockMilli !== null && (
                        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400" role="status">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          Omborda {formatQty(ins.stockMilli)} {l.unit} bor: sotuvdan keyin kam qoladi.
                        </p>
                      )}
                    </div>
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

          <Card>
            <CardHeader title="Mijoz" description="Ixtiyoriy. Qarzga yoki qisman to'lovli savdo uchun kerak" />
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
              <Select label="Mijoz" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={frozen} wrapClassName="flex-1">
                <option value="">— {uz.common.noCustomer} (naqd savdo) —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
              </Select>
              <Button variant="outline" onClick={() => setAddingCustomer(true)} disabled={frozen} icon={<UserPlus className="h-4 w-4" />}>
                Yangi mijoz
              </Button>
            </div>
            {customerId && (
              <p className="-mt-2 px-4 pb-4 text-xs text-muted">
                Joriy qarzi: <Money value={currentDebt} className={currentDebt > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold'} />
              </p>
            )}
          </Card>

          <Card className="p-4">
            <Textarea label="Izoh" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ixtiyoriy: yetkazib berish, kelishuv va h.k." disabled={frozen} />
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          <Card>
            <CardHeader title="To'lov" />
            <div className="space-y-4 p-4">
              <Segmented
                ariaLabel="To'lov turi"
                className="w-full"
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setPaidError(null);
                }}
                options={[
                  { value: 'paid', label: "To'landi" },
                  { value: 'debt', label: 'Qarzga', disabled: !modes.includes('debt') },
                  { value: 'partial', label: 'Qisman', disabled: !modes.includes('partial') },
                ]}
              />
              {mode !== 'debt' && customerId && (
                <Select label="To'lov usuli" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={frozen}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {uz.methods[m]}
                    </option>
                  ))}
                </Select>
              )}
              {mode === 'partial' && (
                <Input label="Hozir to'langan summa" inputMode="numeric" value={partial} onChange={(e) => setPartial(formatMoneyInput(e.target.value))} error={paidError} suffix="so'm" placeholder="0" disabled={frozen} />
              )}
              {!customerId && <p className="text-xs text-muted">Qarzga yoki qisman to&apos;lov uchun mijozni tanlang.</p>}

              <dl className="space-y-2 rounded-xl bg-subtle p-3.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Jami</dt>
                  <dd>
                    <Money value={total} className="text-base font-semibold text-fg" />
                  </dd>
                </div>
                {insights.perLine.size > 0 && (
                  <div className="flex justify-between gap-3" data-testid="sale-profit">
                    <dt className="text-muted">Foyda</dt>
                    <dd>
                      <Money value={insights.profit} signed className={cn('font-semibold', insights.profit < 0n ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')} />
                    </dd>
                  </div>
                )}
                {insights.unknownCostLines > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="unknown-cost">
                    {insights.unknownCostLines} qator hisobga kirmadi (tan narxi yo&apos;q)
                  </p>
                )}
                {preview.ok && customerId && (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Hozir to&apos;lanadi</dt>
                      <dd>
                        <Money value={preview.plan.paidNow} className="text-emerald-600 dark:text-emerald-400" />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Qarzga yoziladi</dt>
                      <dd>
                        <Money value={preview.plan.debt} className={preview.plan.debt > 0n ? 'text-rose-600 dark:text-rose-400' : ''} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-line pt-2">
                      <dt className="text-muted">Savdodan keyingi qarz</dt>
                      <dd>
                        <Money value={currentDebt + preview.plan.debt} className="font-semibold text-fg" />
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {formError && phase.kind === 'editing' && (
                <Alert tone="red">
                  {formError}
                  {locked && (
                    <span className="mt-1 block text-xs">
                      Savdo saqlangan bo&apos;lishi mumkin. «Qayta urinish» uni ikki marta yozmaydi.
                    </span>
                  )}
                </Alert>
              )}

              {phase.kind !== 'payment_failed' && (
                <Button type="submit" size="lg" className="hidden w-full md:inline-flex" loading={busy} icon={<Save className="h-4 w-4" />}>
                  {locked ? 'Qayta urinish' : 'Savdoni saqlash'}
                </Button>
              )}
              {(locked || phase.kind === 'payment_failed') && (
                <Button variant="ghost" className="w-full" onClick={resetForm} disabled={busy}>
                  Yangi savdo boshlash
                </Button>
              )}
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Summa saqlashdan oldin qayta tekshiriladi.
              </p>
            </div>
          </Card>
        </div>

        {/* Telefonda: Jami + Saqlash pastda doim ko'rinadi (pastki menyu ustida); kompyuterda o'ng paneldagi tugma */}
        {phase.kind !== 'payment_failed' && (
          <div
            className="no-print fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden"
            data-testid="sticky-save"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted">Jami</p>
              <Money value={total} className="text-lg font-semibold text-fg" />
            </div>
            <Button type="submit" size="lg" loading={busy} icon={<Save className="h-4 w-4" />}>
              {locked ? 'Qayta urinish' : 'Saqlash'}
            </Button>
          </div>
        )}
      </form>

      <CustomerFormModal open={addingCustomer} onClose={() => setAddingCustomer(false)} onSaved={(c) => setCustomerId(c.id)} />
    </>
  );
}

export default function NewSalePage() {
  return (
    <DataGate>
      {(data) => (
        <Suspense>
          <NewSale data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
