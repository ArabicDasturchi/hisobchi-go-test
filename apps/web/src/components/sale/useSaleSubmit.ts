'use client';
/**
 * Savdoni saqlash oqimi (eski /sales/new sahifasidan ko'chirilgan, xatti-harakat o'zgarmagan):
 * - bir martalik kalitlar (`newKeys`): qayta urinish serverda takroriy savdo/to'lov yaratmaydi;
 * - tarmoq/noma'lum xatodan keyin qulflanadi (savdo saqlangan bo'lishi mumkin), server rad etsa tuzatish mumkin;
 * - savdo saqlandi, to'lov yozilmadi => `payment_failed`: faqat to'lovni qayta yuborish;
 * - hisob: `buildSalePlan` (klient), server `post_sale` qayta hisoblaydi.
 */
import { useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { postSale, recordPayment } from '@/lib/data/api';
import { balanceOf } from '@/lib/data/ledger';
import type { PaymentMethod } from '@/lib/data/types';
import { shortNumber } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { buildReceiptText } from '@/lib/receipt';
import { buildSalePlan, type DraftLine, type LineCheck, type PayMode, type SalePlan } from '@/lib/saleForm';
import { getSupabase } from '@/lib/supabase/client';

/** Bir martalik kalitlar: forma yuborilgach o'zgarmaydi */
export const newKeys = () => ({ saleId: crypto.randomUUID(), saleOp: crypto.randomUUID(), paymentId: crypto.randomUUID(), paymentOp: crypto.randomUUID() });

export interface SaleDone {
  saleId: string;
  plan: SalePlan;
  customerName: string | null;
  /** Savdodan keyingi mijozning umumiy qarzi; mijozsiz savdoda null */
  debtAfter: bigint | null;
  receipt: string;
}

export type SalePhase =
  | { kind: 'editing' }
  | { kind: 'saving' }
  /** Savdo serverda saqlandi, lekin to'lov yozilmadi: faqat to'lovni qayta yuborish mumkin */
  | { kind: 'payment_failed'; saleId: string; plan: SalePlan; message: string }
  | { kind: 'done'; done: SaleDone };

export interface SaleSubmitInput {
  lines: DraftLine[];
  customerId: string;
  mode: PayMode;
  partial: string;
  method: PaymentMethod;
}

export function useSaleSubmit(input: SaleSubmitInput) {
  const { shopId, reload, balances, membership, customerById } = useShop();
  const [keys, setKeys] = useState(newKeys);
  /** Tarmoq xatosidan keyin forma qulflanadi: savdo serverda saqlangan bo'lishi mumkin */
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<SalePhase>({ kind: 'editing' });
  const [formError, setFormError] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Map<string, LineCheck['errors']>>(new Map());

  const customerId = input.customerId || null;
  const currentDebt = customerId ? balanceOf(balances, customerId).debt : 0n;

  async function savePayment(saleId: string, plan: SalePlan) {
    if (plan.paidNow <= 0n || !customerId) return;
    await recordPayment(getSupabase(), {
      shopId,
      paymentId: keys.paymentId,
      clientOpId: keys.paymentOp,
      customerId,
      amount: plan.paidNow,
      method: input.method,
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

  /** "Saqlash": faqat shu yerda bazaga yoziladi (savdogar tasdiqlagandan keyin) */
  async function submit() {
    if (phase.kind !== 'editing') return;
    const res = buildSalePlan({ lines: input.lines, customerId, mode: input.mode, partial: input.partial });
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
        customerId,
        note: null,
        lines: plan.lines,
        clientTotal: plan.total,
      });
    } catch (err) {
      const appErr = toAppError(err);
      // Server rad etdi: hech narsa saqlanmagan, tuzatish mumkin. Tarmoq/noma'lum xato: saqlangan bo'lishi mumkin,
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

  /** Yangi savdo: kalitlar va holat tozalanadi (qatorlarni chaqiruvchi tozalaydi) */
  function reset() {
    setKeys(newKeys());
    setLocked(false);
    setFormError(null);
    setLineErrors(new Map());
    setPaidError(null);
    setPhase({ kind: 'editing' });
  }

  function clearErrors() {
    setFormError(null);
    setPaidError(null);
  }

  return {
    phase,
    locked,
    formError,
    paidError,
    lineErrors,
    currentDebt,
    busy: phase.kind === 'saving',
    frozen: locked || phase.kind === 'saving' || phase.kind === 'payment_failed',
    submit,
    retryPayment,
    reset,
    clearErrors,
  };
}
