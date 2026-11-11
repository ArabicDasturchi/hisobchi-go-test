'use client';
/**
 * Panelning ta'minotchi/daftar amallari uchun saqlash hooklari. Hammasi mavjud, sinalgan yo'llar ustida:
 * `postPurchase`, `recordSupplierPayment`, `postSale` + `recordPayment`, `postSupplierDebt` (013, ta'minotchiga tovarsiz qarz).
 * Bir martalik kalitlar: tarmoq xatosidan keyin qulflanadi, qayta urinish o'sha kalit bilan (takroriy yozuv yo'q).
 * Tasdiqlamaguncha hech narsa saqlanmaydi: hooklar faqat `submit()` chaqirilganda yozadi.
 */
import { useRef, useState } from 'react';
import { QUICK_SALE_LINE } from '@/components/ledger/CustomerLedger';
import { useShop } from '@/components/ShopDataProvider';
import { createProduct, postSale, recordPayment } from '@/lib/data/api';
import { postPurchase, postSupplierDebt } from '@/lib/data/purchases';
import { recordSupplierPayment } from '@/lib/data/supplierPayments';
import type { PaymentMethod, Product } from '@/lib/data/types';
import { toAppError } from '@/lib/errors';
import { lineTotal, parseMoneyInput } from '@/lib/money';
import { bindNewProducts, buildPurchasePlan, type PurchaseDraftLine, type PurchaseLineErrors } from '@/lib/purchaseForm';
import { previewLedgerNote } from '@/lib/ledgerNote';
import { getSupabase } from '@/lib/supabase/client';

const id = () => crypto.randomUUID();
const isFinalError = (kind: string) => kind === 'validation' || kind === 'forbidden' || kind === 'auth' || kind === 'not_found';

/** Umumiy holat: busy, locked (tarmoq xatosi), error */
function useAttemptState() {
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { busy, setBusy, locked, setLocked, error, setError };
}

// ---------------------------------------------------------------------------
// Ta'minotchiga to'lov
// ---------------------------------------------------------------------------

export function useSupplierPaymentSubmit(input: { supplierId: string; amount: string; method: PaymentMethod; debt: bigint }) {
  const { shopId, reload } = useShop();
  const [keys, setKeys] = useState(() => ({ paymentId: id(), op: id() }));
  const st = useAttemptState();

  /** To'langan summa (muvaffaqiyatda) yoki null */
  async function submit(): Promise<bigint | null> {
    if (st.busy) return null;
    if (!input.supplierId) return st.setError("Ta'minotchini tanlang"), null;
    if (input.debt <= 0n) return st.setError("Bu ta'minotchiga qarz yo'q"), null;
    const amount = parseMoneyInput(input.amount, { max: input.debt });
    if (!amount.ok) return st.setError(amount.message), null;
    st.setBusy(true);
    st.setError(null);
    try {
      await recordSupplierPayment(getSupabase(), { shopId, paymentId: keys.paymentId, clientOpId: keys.op, supplierId: input.supplierId, amount: amount.value, method: input.method, note: null });
      await reload();
      setKeys({ paymentId: id(), op: id() });
      st.setLocked(false);
      return amount.value;
    } catch (e) {
      const err = toAppError(e);
      if (!isFinalError(err.kind)) st.setLocked(true);
      st.setError(err.message);
      return null;
    } finally {
      st.setBusy(false);
    }
  }
  return { busy: st.busy, locked: st.locked, error: st.error, clearError: () => st.setError(null), submit };
}

// ---------------------------------------------------------------------------
// Kirim
// ---------------------------------------------------------------------------

export interface PurchaseDone {
  supplierId: string;
  subtotal: bigint;
  paid: bigint;
  balanceAfter: bigint;
}

export function usePurchaseSubmit(input: { supplierId: string; lines: PurchaseDraftLine[]; products: readonly Product[]; balanceBefore: bigint; paid: string; method: PaymentMethod; reloadBooks: () => Promise<void> }) {
  const { shopId, reload } = useShop();
  const [keys, setKeys] = useState(() => ({ purchaseId: id(), op: id() }));
  const st = useAttemptState();
  const [lineErrors, setLineErrors] = useState<Map<string, PurchaseLineErrors>>(new Map());
  const [paidError, setPaidError] = useState<string | null>(null);
  /**
   * Shu kirim uchun yaratilgan yangi tovarlar (kalit: nom + birlik, `newProductKey`): qayta urinishda takror
   * yaratilmaydi. Muvaffaqiyatli kirimdan keyin tozalanadi.
   */
  const created = useRef(new Map<string, Product>());

  async function submit(): Promise<PurchaseDone | null> {
    if (st.busy) return null;
    if (!input.supplierId) return st.setError("Ta'minotchini tanlang"), null;
    st.setBusy(true);
    st.setError(null);
    setPaidError(null);
    try {
      const sb = getSupabase();
      // 1) Avval TO'LIQ tekshiruv: yangi (katalogda yo'q) nomlar ham "kutilayotgan yangi tovar" sifatida (nom, birlik,
      // miqdor, tan narx, to'lov). Xato bo'lsa hech narsa yaratilmaydi va yozilmaydi.
      const products: Product[] = [...input.products, ...created.current.values()];
      const res = buildPurchasePlan({ lines: input.lines, products, balanceBefore: input.balanceBefore, paid: input.paid, method: input.method, allowNew: true });
      if (!res.ok) {
        setLineErrors(res.lineErrors);
        setPaidError(res.paidError ?? null);
        st.setError(res.message);
        return null;
      }
      setLineErrors(new Map());
      const plan = res.plan;
      // 2) Reja OK: yangi tovarlar tanlangan birlik bilan yaratiladi (sotuv narxi bo'sh, keyin kiritiladi).
      // Oldingi urinishda yaratilgani qayta yaratilmaydi.
      const ids = new Map<string, string>();
      for (const np of plan.newProducts) {
        let p = created.current.get(np.key);
        if (!p) {
          p = await createProduct(sb, shopId, { name: np.name, unit: np.unit, last_price: null, is_active: true });
          created.current.set(np.key, p);
        }
        ids.set(np.key, p.id);
      }
      // 3) Kirim (server `post_purchase` jamini qayta hisoblaydi). Eslatma: 2 va 3 bitta tranzaksiya emas, hisobotga qarang
      const lines = bindNewProducts(plan.lines, ids);
      await postPurchase(sb, { shopId, purchaseId: keys.purchaseId, clientOpId: keys.op, supplierId: input.supplierId, docDate: null, lines, clientTotal: plan.subtotal, paid: plan.paid, method: plan.method });
      await Promise.all([reload(), input.reloadBooks()]);
      setKeys({ purchaseId: id(), op: id() });
      created.current.clear();
      st.setLocked(false);
      return { supplierId: input.supplierId, subtotal: plan.subtotal, paid: plan.paid, balanceAfter: plan.balanceAfter };
    } catch (e) {
      const err = toAppError(e);
      if (!isFinalError(err.kind)) st.setLocked(true);
      st.setError(err.message);
      return null;
    } finally {
      st.setBusy(false);
    }
  }
  /** Qator o'zgarganda uning eski xatosi (masalan birlik mos emas) olib tashlanadi */
  function clearLineError(key: string) {
    setLineErrors((m) => {
      if (!m.has(key)) return m;
      const n = new Map(m);
      n.delete(key);
      return n;
    });
  }
  return { busy: st.busy, locked: st.locked, error: st.error, lineErrors, paidError, clearError: () => st.setError(null), clearLineError, submit };
}

// ---------------------------------------------------------------------------
// Daftarga yozish
// ---------------------------------------------------------------------------

export function useLedgerNoteSubmit(input: { kind: 'customer' | 'supplier'; partnerId: string; text: string; balance: bigint; reloadBooks: () => Promise<void> }) {
  const { shopId, reload } = useShop();
  const attempt = useRef<{ sig: string; saleId: string; saleOp: string; payId: string; payOp: string; docId: string; docOp: string } | null>(null);
  const st = useAttemptState();

  /** true: yozuv saqlandi */
  async function submit(): Promise<boolean> {
    if (st.busy) return false;
    const prev = previewLedgerNote(input.balance, input.text);
    if (!input.partnerId || !prev.ok) {
      st.setError(prev.ok ? 'Kimga yozilishini tanlang' : (prev.message ?? 'Yozuvni kiriting'));
      return false;
    }
    const { goods, paid } = prev;
    const sig = `${input.kind}:${input.partnerId}:${goods}:${paid}`;
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, saleId: id(), saleOp: id(), payId: id(), payOp: id(), docId: id(), docOp: id() };
    const a = attempt.current;
    const sb = getSupabase();
    st.setBusy(true);
    st.setError(null);
    try {
      if (goods > 0n) {
        if (input.kind === 'customer') {
          // Jami core formulasi bilan; server qayta hisoblaydi (calc_mismatch bo'lsa saqlanmaydi)
          const total = lineTotal({ qtyMilli: 1000n, unitPrice: goods });
          await postSale(sb, { shopId, saleId: a.saleId, clientOpId: a.saleOp, customerId: input.partnerId, note: QUICK_SALE_LINE, lines: [{ product_name: QUICK_SALE_LINE, qty_milli: 1000n, unit: 'dona', unit_price: goods }], clientTotal: total });
        } else {
          // Tovarsiz qarz yozuvi (W2, 013): ombor o'zgarmaydi, bir nechta bo'lishi mumkin; tovar uchun «Kirim» amali.
          // Avval ochilish qoldig'i RPC'si ishlatilardi: u bir ta'minotchiga bitta yozuvga ruxsat beradi, 2-yozuv yiqilardi
          await postSupplierDebt(sb, { shopId, documentId: a.docId, clientOpId: a.docOp, supplierId: input.partnerId, amount: goods });
        }
      }
      if (paid > 0n) {
        try {
          if (input.kind === 'customer') await recordPayment(sb, { shopId, paymentId: a.payId, clientOpId: a.payOp, customerId: input.partnerId, amount: paid, method: 'naqd', note: null });
          else await recordSupplierPayment(sb, { shopId, paymentId: a.payId, clientOpId: a.payOp, supplierId: input.partnerId, amount: paid, method: 'naqd', note: null });
        } catch (e) {
          await Promise.all([reload(), input.reloadBooks()]);
          throw new Error(goods > 0n ? `Yozuvning tovar qismi saqlandi, lekin to'lov saqlanmadi: ${toAppError(e).message} Qayta urinish tovar qismini takrorlamaydi.` : toAppError(e).message, { cause: e });
        }
      }
      attempt.current = null;
      st.setLocked(false);
      await Promise.all([reload(), input.reloadBooks()]);
      return true;
    } catch (e) {
      const err = toAppError(e);
      if (!isFinalError(err.kind)) st.setLocked(true);
      st.setError(e instanceof Error && e.message.startsWith('Yozuvning') ? e.message : err.message);
      return false;
    } finally {
      st.setBusy(false);
    }
  }
  return { busy: st.busy, locked: st.locked, error: st.error, clearError: () => st.setError(null), submit };
}
