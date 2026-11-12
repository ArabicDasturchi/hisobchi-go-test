'use client';
/**
 * Boshqaruv paneli: tepada asosiy maydon (alohida suriladi), pastda qotirilgan kiritish oynasi.
 * Amal (Savdo, To'lov olish, Kirim, Ta'minotchiga to'lov, Daftarga yozish) va Kimga URL'da: `/dashboard?amal=..&kimga=..`.
 * Hisob faqat mavjud yo'ldan (`buildSalePlan`, `settle`, server RPC). AI yo'q. Tasdiqlamaguncha hech narsa saqlanmaydi.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CustomerFormModal } from '@/components/forms/CustomerFormModal';
import { SupplierFormModal } from '@/components/forms/SupplierFormModal';
import { ConfirmSaleModal } from '@/components/sale/ConfirmSaleModal';
import { SaleComposer, type SaleComposerHandle } from '@/components/sale/SaleComposer';
import { SaleLineCard } from '@/components/sale/SaleLineCard';
import { SaleResultCard } from '@/components/sale/SaleResultCard';
import { SaleSummaryBar } from '@/components/sale/SaleSummaryBar';
import { SuggestionPanel } from '@/components/sale/SuggestionPanel';
import { useKeyboardInset } from '@/components/sale/useKeyboardInset';
import { usePaymentSubmit } from '@/components/sale/usePaymentSubmit';
import { useSaleSubmit } from '@/components/sale/useSaleSubmit';
import { Money } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useBooks } from '@/components/useBooks';
import { supplierTotals } from '@/lib/data/books';
import { selectableCustomers } from '@/lib/data/customers';
import { balanceOf } from '@/lib/data/ledger';
import type { PaymentMethod } from '@/lib/data/types';
import { previewLedgerNote } from '@/lib/ledgerNote';
import { parseResale, RESALE_KEY, resaleLines } from '@/lib/resale';
import { lineStatus, summarizeLines } from '@/lib/lineStatus';
import { formatQty, formatSom } from '@/lib/money';
import { ACTION_INFO, panelHref, parsePanelParams, whoForAction, type PanelAction } from '@/lib/panelState';
import { patchSaleLine } from '@/lib/productIdentity';
import { addNewPurchaseLine, addNewSaleLine, applyPurchaseSelection, defaultNewUnit, purchaseAsDraft } from '@/lib/panelLines';
import { topProducts } from '@/lib/productPicker';
import { applySelection, sameName, searchProductsAll, toggleSelection } from '@/lib/productSearch';
import { lineUnit, resolveProduct, type PurchaseDraftLine } from '@/lib/purchaseForm';
import { parseEnabledUnits, unitChoices } from '@/lib/units';
import { buildSalePlan, DEFAULT_PAY_MODE, effectiveMode, type DraftLine, type PayMode } from '@/lib/saleForm';
import { saleInsights } from '@/lib/saleInsights';
import { ActionMenu, PlusMenu, type PlusChoice } from './ActionMenu';
import { NoteView } from './NoteView';
import { PartnerChip, type PartnerOption } from './PartnerChip';
import { PayView } from './PayView';
import { PurchaseView } from './PurchaseView';
import { useLedgerNoteSubmit, usePurchaseSubmit, useSupplierPaymentSubmit } from './usePanelActions';

const TOP_LIMIT = 50;
const HEADER_REM = 3.5;

export function PanelWorkspace({ data }: { data: ShopData }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { balances, customerById, membership } = useShop();
  const books = useBooks();
  const panelId = useId();
  const composer = useRef<SaleComposerHandle>(null);
  const kb = useKeyboardInset();

  // ---- URL holati ----
  const url = parsePanelParams(params);
  const customers = useMemo(() => selectableCustomers(data.customers), [data.customers]);
  const suppliers = useMemo(() => (books.data?.suppliers ?? []).filter((s) => s.is_active), [books.data]);
  const ids = useMemo(() => ({ customers: new Set(data.customers.map((c) => c.id)), suppliers: new Set((books.data?.suppliers ?? []).map((s) => s.id)) }), [data.customers, books.data]);
  // Ta'minotchilar hali yuklanmagan bo'lsa URL'dagi id o'chirilmaydi
  const action: PanelAction = url.action;
  const who = books.data || ACTION_INFO[action].who === 'customer' ? whoForAction(action, url.who, ids) : url.who;
  const info = ACTION_INFO[action];
  const whoKind: 'customer' | 'supplier' | null = who ? (ids.suppliers.has(who) ? 'supplier' : ids.customers.has(who) ? 'customer' : null) : null;

  const go = (next: { action?: PanelAction; who?: string }) => {
    const a = next.action ?? action;
    const w = whoForAction(a, next.who ?? who, ids);
    router.push(panelHref({ action: a, who: w }), { scroll: false });
  };

  // ---- Kiritish holati ----
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  // "Qayta yozish": bekor qilingan savdo qatorlari oldindan to'ldiriladi (hech narsa saqlanmagan, odatdagi tasdiq kerak)
  const [resale, setResale] = useState(() => {
    if (params.get('qayta') !== '1' || typeof window === 'undefined') return null;
    try {
      return parseResale(sessionStorage.getItem(RESALE_KEY));
    } catch {
      return null;
    }
  });
  const [saleLines, setSaleLines] = useState<DraftLine[]>(() => (resale ? resaleLines(resale) : []));
  const [buyLines, setBuyLines] = useState<PurchaseDraftLine[]>([]);
  const [buyPaid, setBuyPaid] = useState('');
  const [pickedMode, setMode] = useState<PayMode>(DEFAULT_PAY_MODE);
  const [partial, setPartial] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newPartner, setNewPartner] = useState<'customer' | 'supplier' | null>(null);

  const products = data.products;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const popular = useMemo(() => topProducts(products, data.sales, data.saleLines, TOP_LIMIT), [products, data.sales, data.saleLines]);
  const lastCost = useMemo(() => new Map((books.data?.stock ?? []).map((s) => [s.product_id, s.cost_price])), [books.data]);
  const totals = useMemo(() => (books.data ? supplierTotals(books.data) : new Map()), [books.data]);
  /** Kirimdagi yangi tovar birligi tanlovi: do'kon sozlamasidagi yoqilgan birliklar */
  const buyUnits = useMemo(() => unitChoices(parseEnabledUnits(membership.shop.settings)), [membership.shop.settings]);

  // Takliflar xotiradagi katalogdan (serverga so'rov yo'q); har harfda og'ir qayta hisob bo'lmasin
  const deferredQuery = useDeferredValue(query);
  const items = useMemo(() => searchProductsAll(products, deferredQuery, popular), [products, deferredQuery, popular]);
  const newName = query.trim() && !items.some((p) => sameName(p.name, query)) ? query.trim() : null;
  const searching = action === 'savdo' || action === 'kirim';

  useEffect(() => {
    // Bir martalik uzatma: o'qilgach tozalanadi va manzildan `qayta` olib tashlanadi (yangilashda qayta to'ldirilmasin)
    if (params.get('qayta') !== '1') return;
    try {
      sessionStorage.removeItem(RESALE_KEY);
    } catch {
      // saqlash mavjud emas
    }
    router.replace(panelHref({ action, who }), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat birinchi ochilishda
  }, []);

  // ---- Hooklar ----
  const mode = effectiveMode(pickedMode, who || null);
  const sale = useSaleSubmit({ lines: saleLines, customerId: action === 'savdo' ? who : '', mode, partial, method });
  const collect = usePaymentSubmit({ customerId: action === 'tolov' ? who : '', amount, method });
  const supplierDebt: bigint = who && whoKind === 'supplier' ? (totals.get(who)?.outstanding ?? 0n) : 0n;
  const payOut = useSupplierPaymentSubmit({ supplierId: action === 'ta-tolov' ? who : '', amount, method, debt: supplierDebt });
  const buy = usePurchaseSubmit({ supplierId: action === 'kirim' ? who : '', lines: buyLines, products, balanceBefore: supplierDebt, paid: buyPaid, method, reloadBooks: books.reload });
  const partnerBalance: bigint = whoKind === 'supplier' ? supplierDebt : whoKind === 'customer' && who ? balanceOf(balances, who).debt : 0n;
  const ledger = useLedgerNoteSubmit({ kind: whoKind ?? 'customer', partnerId: action === 'daftar' ? who : '', text: note, balance: partnerBalance, reloadBooks: books.reload });

  const summary = useMemo(() => summarizeLines(saleLines, products), [saleLines, products]);
  const insights = useMemo(() => saleInsights(saleLines, products, data.stock), [saleLines, products, data.stock]);
  const preview = buildSalePlan({ lines: saleLines, customerId: who || null, mode, partial });
  const customerName = who && whoKind === 'customer' ? (customerById.get(who)?.name ?? null) : null;
  const supplierName = who && whoKind === 'supplier' ? (suppliers.find((s) => s.id === who)?.name ?? books.data?.suppliers.find((s) => s.id === who)?.name ?? null) : null;
  const partnerName = customerName ?? supplierName;

  const frozenSale = sale.frozen;
  const dockLocked = action === 'savdo' ? frozenSale : action === 'tolov' ? collect.locked : action === 'ta-tolov' ? payOut.locked : action === 'kirim' ? buy.locked : ledger.locked;

  // ---- Qatorlar ----
  function afterAdd() {
    setQuery('');
    setSelected([]);
    setPanelOpen(false);
    setFocusSignal(0);
    composer.current?.focus();
  }
  function addProducts(ps: ReturnType<typeof productById.get>[]) {
    const chosen = ps.flatMap((p) => p ?? []);
    if (chosen.length === 0) return;
    if (action === 'savdo') setSaleLines((ls) => applySelection(ls, chosen));
    else setBuyLines((ls) => applyPurchaseSelection(ls, chosen, (id) => lastCost.get(id)));
    afterAdd();
  }
  const addSelected = () => addProducts(selected.map((id) => productById.get(id)));
  function addNew(name: string) {
    if (action === 'savdo') setSaleLines((ls) => addNewSaleLine(ls, name));
    else setBuyLines((ls) => addNewPurchaseLine(ls, name, undefined, defaultNewUnit(buyUnits)));
    afterAdd();
  }

  async function runPayment(kind: 'tolov' | 'ta-tolov') {
    const paid = kind === 'tolov' ? await collect.submit() : await payOut.submit();
    if (paid !== null) {
      toast.success(`${kind === 'tolov' ? "To'lov qabul qilindi" : "Ta'minotchiga to'lov yozildi"}: ${formatSom(paid).replace(/ /g, ' ')}`);
      setAmount('');
    }
  }
  async function runPurchase() {
    const done = await buy.submit();
    if (done) {
      toast.success(`Kirim saqlandi: ${formatSom(done.subtotal).replace(/ /g, ' ')}`);
      setBuyLines([]);
      setBuyPaid('');
    }
  }
  async function runNote() {
    if (await ledger.submit()) {
      toast.success('Daftarga yozildi.');
      setNote('');
    }
  }

  /** Enter / strelka tugmasi amalga qarab */
  function submitComposer() {
    if (action === 'tolov' || action === 'ta-tolov') return void runPayment(action);
    if (action === 'daftar') return void runNote();
    if (!query.trim()) return;
    if (selected.length > 0) return addSelected();
    if (items[0]) return addProducts([items[0]]);
    addNew(query);
  }

  function changeAction(a: PanelAction) {
    setQuery('');
    setAmount('');
    setNote('');
    setSelected([]);
    setPanelOpen(false);
    go({ action: a });
  }

  function onPlus(c: PlusChoice) {
    if (c === 'report') router.push('/dashboard/report');
    else if (c === 'product') router.push('/products?yangi=1');
    else setNewPartner(c);
  }

  function newSale() {
    setResale(null);
    setSaleLines([]);
    setMode(DEFAULT_PAY_MODE);
    setPartial('');
    setConfirmOpen(false);
    sale.reset();
  }

  if (sale.phase.kind === 'done') {
    return (
      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto px-3 py-4">
        <SaleResultCard done={sale.phase.done} onAgain={newSale} />
      </div>
    );
  }

  // ---- Chip ro'yxati ----
  const options: PartnerOption[] = [
    ...(info.who !== 'supplier'
      ? customers.map((c) => {
          const d = balanceOf(balances, c.id).debt;
          return { id: c.id, name: c.name, group: info.who === 'either' ? 'Mijozlar' : undefined, sub: d > 0n ? <span className="text-rose-600 dark:text-rose-400">Qarzi: <Money value={d} /></span> : undefined };
        })
      : []),
    ...(info.who !== 'customer'
      ? suppliers.map((s) => {
          const d: bigint = totals.get(s.id)?.outstanding ?? 0n;
          return { id: s.id, name: s.name, group: info.who === 'either' ? "Ta'minotchilar" : undefined, sub: d > 0n ? <span className="text-amber-600 dark:text-amber-400">Qarzim: <Money value={d} /></span> : undefined };
        })
      : []),
  ];
  const newLabels = [
    ...(info.who !== 'supplier' ? [{ label: 'Yangi mijoz', onClick: () => setNewPartner('customer') }] : []),
    ...(info.who !== 'customer' ? [{ label: "Yangi ta'minotchi", onClick: () => setNewPartner('supplier') }] : []),
  ];

  const showPanel = searching && panelOpen && !dockLocked && (items.length > 0 || newName !== null);
  const textValue = action === 'tolov' || action === 'ta-tolov' ? amount : action === 'daftar' ? note : query;
  const money = action === 'tolov' || action === 'ta-tolov';
  const sendDisabled = money ? !who || !amount.trim() : action === 'daftar' ? !previewLedgerNote(partnerBalance, note).ok || !who : !query.trim();
  const draftLines = action === 'kirim' ? purchaseAsDraft(buyLines) : saleLines;
  const lockedRetry = sale.locked && sale.phase.kind === 'editing';
  const modalOpen = confirmOpen && (sale.phase.kind === 'editing' || sale.phase.kind === 'saving');

  const quick = !searching ? [] : searchProductsAll(products, '', popular).filter((p) => p.last_price !== null).slice(0, 5);

  return (
    <div className="flex flex-col" style={{ height: `calc(100dvh - ${HEADER_REM}rem - ${kb}px)` }} data-testid="panel">
      {/* Asosiy maydon: faqat shu suriladi */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="panel-main">
        <div className="mx-auto w-full max-w-[780px] space-y-3 px-3 pb-3 pt-4 sm:px-4">

          {action === 'savdo' && (
            <section aria-label="Savdo" className="space-y-3" data-testid="sale-view">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-fg">Savdo</h2>
                <p className="text-sm text-muted">{customerName ? `${customerName} · yangi savdo` : 'Mijozsiz (naqd) · yangi savdo'}</p>
              </div>
              {resale && saleLines.length > 0 && (
                <Alert tone="blue" title={`Savdo ${resale.number} bekor qilingan`} data-testid="resale-note">
                  Shu qatorlar bilan yangi savdo tayyor: tekshiring (narx, soni) va «Tasdiqlash» ni bosing. Tasdiqlamaguncha hech narsa saqlanmaydi.
                </Alert>
              )}
              {saleLines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center" data-testid="sale-empty">
                  <p className="font-semibold text-fg">Savdoni boshlang</p>
                  <p className="mt-1 text-sm text-muted">Pastdagi oynaga tovar nomini yozing. Takliflar chiqadi, bir nechtasini belgilang.</p>
                  {quick.length > 0 && (
                    <>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {quick.map((p) => (
                          <button key={p.id} type="button" onClick={() => addProducts([p])} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium text-fg hover:bg-subtle">
                            {p.name} {p.last_price !== null ? p.last_price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted">Narxi bor tovarlar: tez tanlash</p>
                    </>
                  )}
                </div>
              ) : (
                <ul className="space-y-2" aria-label="Savdo qatorlari">
                  {saleLines.map((l) => (
                    <SaleLineCard
                      key={l.key}
                      line={l}
                      status={lineStatus(l, products)}
                      warnings={lineWarnings(l, insights.perLine.get(l.key))}
                      disabled={frozenSale}
                      onChange={(patch) => setSaleLines((ls) => ls.map((x) => (x.key === l.key ? patchSaleLine(x, patch) : x)))}
                      onRemove={() => setSaleLines((ls) => ls.filter((x) => x.key !== l.key))}
                    />
                  ))}
                </ul>
              )}
              {sale.phase.kind === 'editing' && sale.formError && !modalOpen && <Alert tone="red">{sale.formError}</Alert>}
              {saleLines.length > 0 && (
                <div className="sticky bottom-0 bg-bg pt-1">
                  <SaleSummaryBar summary={summary} retry={lockedRetry} busy={sale.busy} onConfirm={() => setConfirmOpen(true)} />
                </div>
              )}
            </section>
          )}

          {action === 'tolov' && (
            <PayView
              title="To'lov olish"
              partnerName={customerName}
              debtLabel="Hozirgi qarz"
              debt={collect.debt}
              amount={amount}
              onAmount={(v) => {
                setAmount(v);
                collect.clearError();
              }}
              method={method}
              onMethod={setMethod}
              error={collect.error}
              locked={collect.locked}
              busy={collect.busy}
              onConfirm={() => void runPayment('tolov')}
              needPartnerText="«Kimdan» da mijozni tanlang"
            />
          )}
          {action === 'ta-tolov' && (
            <PayView
              title="Ta'minotchiga to'lov"
              partnerName={supplierName}
              debtLabel="Mening qarzim"
              debt={supplierDebt}
              amount={amount}
              onAmount={(v) => {
                setAmount(v);
                payOut.clearError();
              }}
              method={method}
              onMethod={setMethod}
              error={payOut.error}
              locked={payOut.locked}
              busy={payOut.busy}
              onConfirm={() => void runPayment('ta-tolov')}
              needPartnerText="«Kimga» da ta'minotchini tanlang"
            />
          )}
          {action === 'kirim' && (
            <PurchaseView
              supplierName={supplierName}
              lines={buyLines}
              onLine={(key, patch) => {
                setBuyLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
                buy.clearLineError(key);
              }}
              onRemove={(key) => setBuyLines((ls) => ls.filter((l) => l.key !== key))}
              balanceBefore={supplierDebt}
              paid={buyPaid}
              onPaid={setBuyPaid}
              paidError={buy.paidError}
              lineErrors={buy.lineErrors}
              isNew={(l) => !!l.productName.trim() && !resolveProduct(products, l)}
              unitOf={(l) => lineUnit(products, l)}
              units={buyUnits}
              error={buy.error}
              locked={buy.locked}
              busy={buy.busy}
              onConfirm={() => void runPurchase()}
            />
          )}
          {action === 'daftar' && <NoteView kind={whoKind} partnerName={partnerName} balance={partnerBalance} text={note} onCancel={() => setNote('')} onConfirm={() => void runNote()} busy={ledger.busy} locked={ledger.locked} error={ledger.error} />}
        </div>
      </div>

      {/* Qotirilgan kiritish oynasi: takliflar paneli oyna ustida, Jami qatorini yopmaydi (oqimda) */}
      <div className="relative shrink-0" data-testid="composer-dock">
        <div className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-bg to-transparent" aria-hidden />
        <div className="mx-auto w-full max-w-[780px] px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1 sm:px-4">
          <SaleComposer
            ref={composer}
            value={textValue}
            onChange={(v) => {
              if (money) {
                setAmount(v);
                collect.clearError();
                payOut.clearError();
              } else if (action === 'daftar') {
                setNote(v);
                ledger.clearError();
              } else {
                setQuery(v);
                setPanelOpen(true);
                setFocusSignal(0);
              }
            }}
            placeholder={info.placeholder}
            inputLabel={searching ? 'Tovar nomi' : money ? "To'lov summasi" : 'Daftar yozuvi'}
            inputMode={money ? 'numeric' : 'text'}
            sendLabel={info.sendLabel}
            confirmIcon={!searching}
            panelOpen={showPanel}
            panelId={panelId}
            onSubmit={submitComposer}
            onFocusPanel={() => setFocusSignal((n) => n + 1)}
            onEscape={() => setPanelOpen(false)}
            onFocus={() => searching && setPanelOpen(true)}
            plus={<PlusMenu onChoose={onPlus} />}
            action={<ActionMenu value={action} onChange={changeAction} />}
            who={
              <PartnerChip
                label={info.whoLabel}
                options={options}
                value={who}
                onChange={(id) => {
                  sale.clearErrors();
                  go({ who: id });
                }}
                noneLabel={action === 'savdo' ? 'Mijozsiz (naqd)' : undefined}
                newLabels={newLabels}
                disabled={dockLocked}
              />
            }
            disabled={dockLocked}
            sendDisabled={sendDisabled}
          >
            {showPanel && (
              <SuggestionPanel
                id={panelId}
                query={query}
                items={items}
                lines={draftLines}
                selected={selected}
                newName={newName}
                focusSignal={focusSignal}
                onToggle={(id) => setSelected((s) => toggleSelection(s, id))}
                onBump={(p) => addProducts([p])}
                onAddSelected={addSelected}
                onAddNew={addNew}
                onClose={() => setPanelOpen(false)}
                onReturnFocus={() => composer.current?.focus()}
              />
            )}
          </SaleComposer>
        </div>
      </div>

      <ConfirmSaleModal
        open={modalOpen}
        onClose={() => setConfirmOpen(false)}
        customerName={customerName}
        customerId={action === 'savdo' ? who : ''}
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
      <CustomerFormModal open={newPartner === 'customer'} onClose={() => setNewPartner(null)} onSaved={(c) => go({ action: action === 'kirim' || action === 'ta-tolov' ? 'savdo' : action, who: c.id })} />
      <SupplierFormModal
        open={newPartner === 'supplier'}
        onClose={() => setNewPartner(null)}
        onSaved={(s) => {
          void books.reload();
          router.push(panelHref({ action: action === 'savdo' || action === 'tolov' ? 'kirim' : action, who: s.id }), { scroll: false });
        }}
      />
    </div>
  );
}

/** Ombor/tan narx ogohlantirishlari (saqlashni to'smaydi) */
function lineWarnings(l: DraftLine, ins: ReturnType<typeof saleInsights>['perLine'] extends Map<string, infer V> ? V | undefined : never): string[] {
  if (!ins) return [];
  const out: string[] = [];
  if (ins.belowCost && ins.unitCost !== null) out.push(`Sotish narxi tan narxdan past (tan narx ${formatSom(ins.unitCost).replace(/ /g, ' ')}). Saqlash mumkin.`);
  if (ins.stock === 'negative' && ins.stockMilli !== null) out.push(`Omborda ${formatQty(ins.stockMilli)} ${l.unit} bor: sotilsa qoldiq minusga tushadi. Saqlash mumkin.`);
  if (ins.stock === 'low' && ins.stockMilli !== null) out.push(`Omborda ${formatQty(ins.stockMilli)} ${l.unit} bor: sotuvdan keyin kam qoladi.`);
  return out;
}
