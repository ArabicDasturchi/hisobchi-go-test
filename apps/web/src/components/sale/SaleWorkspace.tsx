'use client';
/**
 * Yagona kiritish oynasi (Bosh sahifa tepasida): nom yozing → takliflar → belgilab tanlang → kartochkalar → Tasdiqlash.
 * Hisob faqat mavjud yo'ldan (`buildSalePlan`, `lineTotal`, server `post_sale`). Tasdiqlamaguncha hech narsa saqlanmaydi.
 * Ikkinchi amal "To'lov": mijoz qarzidan to'lov qabul qilish (`recordPayment`).
 */
import { RotateCw } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { CustomerFormModal } from '@/components/forms/CustomerFormModal';
import { Money } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert, Button, LinkButton, Segmented } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import { selectableCustomers } from '@/lib/data/customers';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/data/types';
import { shortNumber } from '@/lib/dates';
import { formatMoneyInput, formatQty, formatSom } from '@/lib/money';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import { topProducts } from '@/lib/productPicker';
import { applySelection, sameName, searchProductsAll, toggleSelection } from '@/lib/productSearch';
import { buildSalePlan, DEFAULT_PAY_MODE, effectiveMode, isBlank, type DraftLine, type PayMode } from '@/lib/saleForm';
import { saleInsights } from '@/lib/saleInsights';
import { ConfirmSaleModal } from './ConfirmSaleModal';
import { CustomerChip } from './CustomerChip';
import { SaleComposer, type ComposerAction, type SaleComposerHandle } from './SaleComposer';
import { SaleLineCard } from './SaleLineCard';
import { SaleResultCard } from './SaleResultCard';
import { SaleSummaryBar } from './SaleSummaryBar';
import { SuggestionPanel } from './SuggestionPanel';
import { useKeyboardInset } from './useKeyboardInset';
import { usePaymentSubmit } from './usePaymentSubmit';
import { useSaleSubmit } from './useSaleSubmit';

const TOP_LIMIT = 50;

export function SaleWorkspace({ data, initialCustomerId }: { data: ShopData; initialCustomerId?: string | null }) {
  const toast = useToast();
  const { balances, customerById } = useShop();
  const panelId = useId();
  const composer = useRef<SaleComposerHandle>(null);
  const kbInset = useKeyboardInset();

  const [action, setAction] = useState<ComposerAction>('sale');
  const [customerId, setCustomerId] = useState(initialCustomerId && data.customers.some((c) => c.id === initialCustomerId && c.is_active) ? initialCustomerId : '');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [pickedMode, setMode] = useState<PayMode>(DEFAULT_PAY_MODE);
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [partial, setPartial] = useState('');
  const [amount, setAmount] = useState('');

  const products = data.products;
  // Arxivlangan mijoz yangi savdo tanlovida ko'rinmaydi (tarixi va qarzi saqlanadi)
  const customers = useMemo(() => selectableCustomers(data.customers), [data.customers]);
  const popular = useMemo(() => topProducts(products, data.sales, data.saleLines, TOP_LIMIT), [products, data.sales, data.saleLines]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Takliflar xotiradagi katalogdan (serverga so'rov yo'q); har harfda og'ir qayta hisob bo'lmasin
  const deferredQuery = useDeferredValue(query);
  const items = useMemo(() => searchProductsAll(products, deferredQuery, popular), [products, deferredQuery, popular]);
  const newName = query.trim() && !items.some((p) => sameName(p.name, query)) ? query.trim() : null;

  const mode = effectiveMode(pickedMode, customerId || null);
  const sale = useSaleSubmit({ lines, customerId, mode, partial, method });
  const pay = usePaymentSubmit({ customerId, amount, method });

  const summary = useMemo(() => summarizeLines(lines, products), [lines, products]);
  const insights = useMemo(() => saleInsights(lines, products, data.stock), [lines, products, data.stock]);
  const preview = buildSalePlan({ lines, customerId: customerId || null, mode, partial });
  const frozen = sale.frozen;
  const customerName = customerId ? (customerById.get(customerId)?.name ?? null) : null;
  const paying = action === 'payment';

  // ---- Qatorlar ----
  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  function afterAdd() {
    setQuery('');
    setSelected([]);
    setPanelOpen(false);
    setFocusSignal(0);
    composer.current?.focus();
  }

  function addSelected() {
    const chosen = selected.flatMap((id) => productById.get(id) ?? []);
    if (chosen.length === 0) return;
    setLines((ls) => applySelection(ls, chosen));
    afterAdd();
  }

  function addNew(name: string) {
    const n = name.trim();
    if (!n) return;
    setLines((ls) => {
      const filled = (l: DraftLine): DraftLine => ({ ...l, productName: n, qty: '1' });
      const blankAt = ls.findIndex(isBlank);
      if (blankAt >= 0) return ls.map((l, i) => (i === blankAt ? filled(l) : l));
      return [...ls, filled({ key: crypto.randomUUID(), productName: '', qty: '', unit: 'dona', price: '' })];
    });
    afterAdd();
  }

  /** Enter / strelka: belgilanganlar bo'lsa hammasini, bo'lmasa eng yuqori taklifni, taklif yo'q bo'lsa yangi tovarni qo'shadi */
  function submitComposer() {
    if (paying) {
      void submitPayment();
      return;
    }
    if (!query.trim()) return;
    if (selected.length > 0) return addSelected();
    const first = items[0];
    if (first) {
      setLines((ls) => applySelection(ls, [first]));
      afterAdd();
    } else addNew(query);
  }

  async function submitPayment() {
    const paid = await pay.submit();
    if (paid !== null) {
      toast.success(`To'lov qabul qilindi: ${formatSom(paid).replace(/ /g, ' ')}`);
      setAmount('');
    }
  }

  function changeAction(a: ComposerAction) {
    setAction(a);
    setQuery('');
    setAmount('');
    setSelected([]);
    setPanelOpen(false);
    pay.reset();
  }

  function newSale() {
    setLines([]);
    setCustomerId('');
    setMode(DEFAULT_PAY_MODE);
    setPartial('');
    setConfirmOpen(false);
    sale.reset();
  }

  // ---- Natija kartasi ----
  if (sale.phase.kind === 'done') return <SaleResultCard done={sale.phase.done} onAgain={newSale} />;

  const showPanel = !paying && panelOpen && !frozen && (items.length > 0 || newName !== null);
  const modalOpen = confirmOpen && (sale.phase.kind === 'editing' || sale.phase.kind === 'saving');
  const lockedRetry = sale.locked && sale.phase.kind === 'editing';

  const who = (
    <CustomerChip
      customers={customers}
      balances={balances}
      value={customerId}
      onChange={(id) => {
        setCustomerId(id);
        sale.clearErrors();
        pay.clearError();
      }}
      onNewCustomer={() => setAddingCustomer(true)}
      disabled={frozen || pay.locked}
      required={paying}
    />
  );

  return (
    <section aria-label={uz.composer.title} className="space-y-3" data-testid="sale-workspace">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">{paying ? "To'lov qabul qilish" : uz.composer.title}</h2>
        <p className="text-sm text-muted">{customerName ? `${uz.composer.customerLabel}: ${customerName}` : paying ? 'Mijozni tanlang' : uz.composer.cashSale}</p>
      </div>

      {sale.phase.kind === 'payment_failed' && (
        <Alert tone="amber" title="Savdo saqlandi, lekin to'lov yozilmadi">
          <p>{sale.phase.message}</p>
          <p className="mt-1">
            Savdo {shortNumber(sale.phase.saleId)} saqlandi. <Money value={sale.phase.plan.paidNow} className="font-semibold" /> to&apos;lovni qayta yuboring yoki keyinroq mijoz sahifasidan kiriting.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => void sale.retryPayment()} icon={<RotateCw className="h-3.5 w-3.5" />}>
              To&apos;lovni qayta yuborish
            </Button>
            <LinkButton href={`/sales/${sale.phase.saleId}`} variant="outline" className="h-11">
              Savdoni ochish
            </LinkButton>
            <Button variant="ghost" className="h-11" onClick={newSale}>
              Yangi savdo boshlash
            </Button>
          </div>
        </Alert>
      )}

      {!paying && (
        <>
          {lines.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{uz.composer.emptyLines}</p>
          ) : (
            <ul className="space-y-2" aria-label="Savdo qatorlari">
              {lines.map((l) => (
                <SaleLineCard
                  key={l.key}
                  line={l}
                  status={lineStatus(l, products)}
                  warnings={lineWarnings(l, insights.perLine.get(l.key))}
                  disabled={frozen}
                  onChange={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </ul>
          )}
          {sale.phase.kind === 'editing' && sale.formError && !modalOpen && <Alert tone="red">{sale.formError}</Alert>}
        </>
      )}

      {paying && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="payment-panel">
          {customerId ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Joriy qarz{customerName ? `: ${customerName}` : ''}</span>
              <Money value={pay.debt} className={pay.debt > 0n ? 'text-lg font-semibold text-rose-600 dark:text-rose-400' : 'text-lg font-semibold text-fg'} />
            </div>
          ) : (
            <p className="text-sm text-muted">«Kimga» da mijozni tanlang. To&apos;lov summasini quyida yozing.</p>
          )}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-fg">To&apos;lov usuli</p>
            <Segmented
              ariaLabel="To'lov usuli"
              className="w-full [&_button]:min-h-11 [&_button]:flex-1 [&_button]:text-sm"
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: uz.methods[m] }))}
            />
          </div>
          {pay.debt > 0n && !pay.locked && (
            <button type="button" onClick={() => setAmount(formatMoneyInput(pay.debt.toString()))} className="min-h-11 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              To&apos;liq qarzni kiritish
            </button>
          )}
          {pay.error && (
            <Alert tone="red">
              {pay.error}
              {pay.locked && <span className="mt-1 block text-xs">To&apos;lov saqlangan bo&apos;lishi mumkin. Qayta urinish uni ikki marta yozmaydi.</span>}
            </Alert>
          )}
          <Button size="lg" className="h-12 w-full rounded-xl text-[15px]" loading={pay.busy} disabled={!customerId || !amount.trim()} onClick={() => void submitPayment()} data-testid="payment-confirm">
            {pay.locked ? uz.composer.retry : uz.composer.confirm}
          </Button>
        </div>
      )}

      {/* Telefonda ekran pastiga yopishadi (pastki menyu ustida); klaviatura ochilganda ko'tariladi */}
      <div
        className="sticky bottom-0 z-20 -mx-1 space-y-2 bg-bg px-1 pb-2 pt-2 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]"
        style={kbInset > 0 ? { bottom: kbInset } : undefined}
        data-testid="composer-dock"
      >
        {!paying && <SaleSummaryBar summary={summary} retry={lockedRetry} busy={sale.busy} frozen={sale.phase.kind === 'payment_failed'} onConfirm={() => setConfirmOpen(true)} />}
        <SaleComposer
          ref={composer}
          value={paying ? amount : query}
          onChange={(v) => {
            if (paying) {
              setAmount(formatMoneyInput(v));
              pay.clearError();
            } else {
              setQuery(v);
              setPanelOpen(v.trim().length > 0);
              setFocusSignal(0);
            }
          }}
          placeholder={paying ? "To'lov summasi, so'm" : undefined}
          inputLabel={paying ? "To'lov summasi" : undefined}
          inputMode={paying ? 'numeric' : 'text'}
          sendLabel={paying ? "To'lovni saqlash" : uz.composer.add}
          panelOpen={showPanel}
          panelId={panelId}
          onSubmit={submitComposer}
          onFocusPanel={() => setFocusSignal((n) => n + 1)}
          onEscape={() => setPanelOpen(false)}
          onFocus={() => setPanelOpen(query.trim().length > 0)}
          action={action}
          onActionChange={changeAction}
          who={who}
          disabled={paying ? pay.locked : frozen}
          sendDisabled={paying ? !customerId || !amount.trim() : !query.trim()}
        >
          {showPanel && (
            <SuggestionPanel
              id={panelId}
              query={query}
              items={items}
              lines={lines}
              selected={selected}
              newName={newName}
              focusSignal={focusSignal}
              onToggle={(id) => setSelected((s) => toggleSelection(s, id))}
              onBump={(p) => setLines((ls) => applySelection(ls, [p]))}
              onAddSelected={addSelected}
              onAddNew={addNew}
              onClose={() => setPanelOpen(false)}
              onReturnFocus={() => composer.current?.focus()}
            />
          )}
        </SaleComposer>
      </div>

      <ConfirmSaleModal
        open={modalOpen}
        onClose={() => setConfirmOpen(false)}
        customerName={customerName}
        customerId={customerId}
        lineCount={summary.ready}
        total={summary.total}
        currentDebt={sale.currentDebt}
        mode={mode}
        onMode={(m) => {
          setMode(m);
          sale.clearErrors();
        }}
        method={method}
        onMethod={setMethod}
        partial={partial}
        onPartial={setPartial}
        plan={preview.ok ? preview.plan : null}
        formError={sale.formError}
        paidError={sale.paidError}
        locked={sale.locked}
        busy={sale.busy}
        onSave={() => void sale.submit()}
      />
      <CustomerFormModal
        open={addingCustomer}
        onClose={() => setAddingCustomer(false)}
        onSaved={(c) => {
          setCustomerId(c.id);
        }}
      />
    </section>
  );
}

/** Ombor/tan narx ogohlantirishlari (eski sahifadagi matnlar; saqlashni to'smaydi) */
function lineWarnings(l: DraftLine, ins: ReturnType<typeof saleInsights>['perLine'] extends Map<string, infer V> ? V | undefined : never): string[] {
  if (!ins) return [];
  const out: string[] = [];
  if (ins.belowCost && ins.unitCost !== null) out.push(`Sotish narxi tan narxdan past (tan narx ${formatSom(ins.unitCost).replace(/ /g, ' ')}). Saqlash mumkin.`);
  if (ins.stock === 'negative' && ins.stockMilli !== null) out.push(`Omborda ${formatQty(ins.stockMilli)} ${l.unit} bor: sotilsa qoldiq minusga tushadi. Saqlash mumkin.`);
  if (ins.stock === 'low' && ins.stockMilli !== null) out.push(`Omborda ${formatQty(ins.stockMilli)} ${l.unit} bor: sotuvdan keyin kam qoladi.`);
  return out;
}
