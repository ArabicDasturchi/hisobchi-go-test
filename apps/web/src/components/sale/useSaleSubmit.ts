'use client';
/**
 * Savdoni saqlash oqimi:
 * - savdo va to'lov BITTA tranzaksiyada (`post_sale` p_paid, W3): "savdo saqlandi, to'lov yozilmadi" yarim holati yo'q;
 * - mijozsiz (naqd) savdo bir martalik tizim mijozi bilan yoziladi va to'lov yozuvi yaratiladi (W10, mobil va agent
 *   bilan bir xil): kassa usul bo'yicha to'g'ri ko'rinadi, bekor qilinsa server to'lovni ham qaytaradi;
 * - bir martalik kalitlar (`newKeys`): qayta urinish serverda takroriy savdo/to'lov yaratmaydi (client_op_id);
 * - tarmoq/noma'lum xatodan keyin qulflanadi (savdo saqlangan bo'lishi mumkin), server rad etsa tuzatish mumkin;
 * - hisob: `buildSalePlan` (klient), server `post_sale` qayta hisoblaydi.
 */
import { useRef, useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { ensureWalkinCustomer, postSale } from '@/lib/data/api';
import { balanceOf } from '@/lib/data/ledger';
import type { PaymentMethod } from '@/lib/data/types';
import { shortNumber } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { buildReceiptText } from '@/lib/receipt';
import { buildSalePlan, type DraftLine, type LineCheck, type PayMode, type SalePlan } from '@/lib/saleForm';
import { getSupabase } from '@/lib/supabase/client';

/** Bir martalik kalitlar: forma yuborilgach o'zgarmaydi */
export const newKeys = () => ({ saleId: crypto.randomUUID(), saleOp: crypto.randomUUID() });

export interface SaleDone {
  saleId: string;
  plan: SalePlan;
  customerName: string | null;
  /** Savdodan keyingi mijozning umumiy qarzi; mijozsiz savdoda null */
  debtAfter: bigint | null;
  receipt: string;
}

export type SalePhase = { kind: 'editing' } | { kind: 'saving' } | { kind: 'done'; done: SaleDone };

export interface SaleSubmitInput {
  lines: DraftLine[];
  customerId: string;
  mode: PayMode;
  partial: string;
  method: PaymentMethod;
}

/**
 * Serverga yuboriladigan savdo: kimga va qancha to'lov (sof, testlanadi).
 * Doimiy mijoz: rejadagi `paidNow` (0 bo'lsa to'lovsiz). Mijozsiz: bir martalik mijoz, to'liq to'langan (server talab qiladi).
 * Mijozsiz 0 so'mlik savdo (narx 0, masalan sovg'a): pul yo'q, to'lov yozuvi kerak emas; server bir martalik mijozga 0 so'mni
 * rad etadi (`walkin_requires_full_payment`), shuning uchun avvalgidek mijozsiz (customer_id NULL) yoziladi.
 */
export function saleTarget(plan: SalePlan, customerId: string | null, walkinId: string | null): { customerId: string | null; paid: bigint } {
  if (customerId) return { customerId, paid: plan.paidNow };
  if (plan.total <= 0n || !walkinId) return { customerId: null, paid: 0n };
  return { customerId: walkinId, paid: plan.total };
}

/** Mijozsiz savdoga bir martalik mijoz kerakmi (faqat pul bo'lsa) */
export const needsWalkin = (plan: SalePlan, customerId: string | null) => !customerId && plan.total > 0n;

export function useSaleSubmit(input: SaleSubmitInput) {
  const { shopId, reload, balances, membership, customerById, data } = useShop();
  const [keys, setKeys] = useState(newKeys);
  /** Shu savdo uchun olingan bir martalik mijoz id'si (qayta urinishda o'sha) */
  const walkinRef = useRef<string | null>(null);
  /** Tarmoq xatosidan keyin forma qulflanadi: savdo serverda saqlangan bo'lishi mumkin */
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<SalePhase>({ kind: 'editing' });
  const [formError, setFormError] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Map<string, LineCheck['errors']>>(new Map());

  const customerId = input.customerId || null;
  const currentDebt = customerId ? balanceOf(balances, customerId).debt : 0n;

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
      const sb = getSupabase();
      if (needsWalkin(plan, customerId) && !walkinRef.current) walkinRef.current = data?.walkin?.id ?? (await ensureWalkinCustomer(sb, shopId));
      const target = saleTarget(plan, customerId, walkinRef.current);
      saleId = await postSale(sb, {
        shopId,
        saleId: keys.saleId,
        clientOpId: keys.saleOp,
        customerId: target.customerId,
        note: null,
        lines: plan.lines,
        clientTotal: plan.total,
        paid: target.paid,
        method: input.method,
      });
    } catch (err) {
      const appErr = toAppError(err);
      // Server rad etdi: hech narsa saqlanmagan (bitta tranzaksiya), tuzatish mumkin. Tarmoq/noma'lum xato: saqlangan
      // bo'lishi mumkin, forma qulflanadi va qayta urinish o'sha kalit bilan yuboriladi (takroriy savdo yaratilmaydi).
      if (appErr.kind !== 'validation' && appErr.kind !== 'forbidden' && appErr.kind !== 'auth') setLocked(true);
      setFormError(appErr.message);
      setPhase({ kind: 'editing' });
      return;
    }
    await finish(saleId, plan);
  }

  /** Yangi savdo: kalitlar va holat tozalanadi (qatorlarni chaqiruvchi tozalaydi) */
  function reset() {
    setKeys(newKeys());
    walkinRef.current = null;
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
    frozen: locked || phase.kind === 'saving',
    submit,
    reset,
    clearErrors,
  };
}
