'use client';
/**
 * "To'lov" amali: mijozdan to'lov qabul qilish (mavjud `recordPayment`, bir martalik kalit bilan).
 * Ortiqcha to'lov qoidasi mavjud tekshiruvdan: summa ≤ joriy qarz (`PaymentModal` bilan bir xil), server qayta tekshiradi.
 * Tarmoq xatosidan keyin qulflanadi: to'lov saqlangan bo'lishi mumkin, qayta urinish o'sha kalit bilan bajariladi.
 */
import { useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { recordPayment } from '@/lib/data/api';
import { balanceOf } from '@/lib/data/ledger';
import type { PaymentMethod } from '@/lib/data/types';
import { toAppError } from '@/lib/errors';
import { parseMoneyInput } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

const newPaymentKeys = () => ({ paymentId: crypto.randomUUID(), opId: crypto.randomUUID() });

export interface PaymentSubmitInput {
  customerId: string;
  amount: string;
  method: PaymentMethod;
}

/** Tekshiruv (sof): xato matni yoki null. Testlanadi. */
export function validatePayment(customerId: string, debt: bigint, amountText: string): { ok: true; amount: bigint } | { ok: false; message: string } {
  if (!customerId) return { ok: false, message: 'Mijozni tanlang' };
  if (debt <= 0n) return { ok: false, message: "Bu mijozning qarzi yo'q" };
  const res = parseMoneyInput(amountText, { max: debt });
  return res.ok ? { ok: true, amount: res.value } : { ok: false, message: res.message };
}

export function usePaymentSubmit(input: PaymentSubmitInput) {
  const { shopId, reload, balances } = useShop();
  const [keys, setKeys] = useState(newPaymentKeys);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debt = input.customerId ? balanceOf(balances, input.customerId).debt : 0n;

  /** true: to'lov saqlandi */
  async function submit(): Promise<bigint | null> {
    if (busy) return null;
    const v = validatePayment(input.customerId, debt, input.amount);
    if (!v.ok) {
      setError(v.message);
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      await recordPayment(getSupabase(), {
        shopId,
        paymentId: keys.paymentId,
        clientOpId: keys.opId,
        customerId: input.customerId,
        amount: v.amount,
        method: input.method,
        note: null,
      });
      await reload();
      setKeys(newPaymentKeys());
      setLocked(false);
      setBusy(false);
      return v.amount;
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.kind !== 'validation' && appErr.kind !== 'forbidden' && appErr.kind !== 'auth') setLocked(true);
      setError(appErr.message);
      setBusy(false);
      return null;
    }
  }

  function reset() {
    setKeys(newPaymentKeys());
    setLocked(false);
    setError(null);
  }

  return { debt, busy, locked, error, submit, reset, clearError: () => setError(null) };
}
