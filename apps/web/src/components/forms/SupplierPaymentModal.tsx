'use client';
import { tashkentDate } from '@hisobchi/core';
import { useMemo, useState, type FormEvent } from 'react';
import { Money } from '../shared';
import { useShop } from '../ShopDataProvider';
import { Modal } from '../ui/Modal';
import { Alert, Button, Input, Segmented, Textarea } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { uz } from '@/i18n/uz';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/data/types';
import { recordSupplierPayment } from '@/lib/data/supplierPayments';
import { toAppError } from '@/lib/errors';
import { dateError } from '@/lib/ledgerView';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

/** Sana (Toshkent kuni) → server vaqti: bugun bo'lsa "hozir", boshqa kun bo'lsa shu kunning tushligi (UTC+5) */
export function paymentTimestamp(date: string, today: string): string | null {
  return date === today ? null : `${date}T12:00:00+05:00`;
}

/**
 * Ta'minotchiga to'lov berish (record_supplier_payment). Server qarzdan oshmasligini qayta tekshiradi.
 * payment_id va client_op_id modal ochilganda bir marta yaratiladi — qayta urinish takroriy to'lov yaratmaydi.
 */
export function SupplierPaymentModal({ open, onClose, supplierId, supplierName, debt, onSaved }: { open: boolean; onClose: () => void; supplierId: string; supplierName: string; debt: bigint; onSaved: () => Promise<void> | void }) {
  if (!open) return null;
  return <Form onClose={onClose} supplierId={supplierId} supplierName={supplierName} debt={debt} onSaved={onSaved} />;
}

function Form({ onClose, supplierId, supplierName, debt, onSaved }: { onClose: () => void; supplierId: string; supplierName: string; debt: bigint; onSaved: () => Promise<void> | void }) {
  const { shopId } = useShop();
  const toast = useToast();
  const today = useMemo(() => tashkentDate(new Date()), []);
  const [ids] = useState(() => ({ paymentId: crypto.randomUUID(), opId: crypto.randomUUID() }));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('naqd');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string | null; date?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amountRes = parseMoneyInput(amount, { max: debt > 0n ? debt : 1n });
    const next = { amount: debt <= 0n ? "Qarz yo'q" : amountRes.ok ? null : amountRes.message, date: dateError(date, today) };
    setErrors(next);
    if (next.amount || next.date || !amountRes.ok) return;
    setBusy(true);
    setFormError(null);
    try {
      setLocked(true);
      await recordSupplierPayment(getSupabase(), {
        shopId,
        paymentId: ids.paymentId,
        clientOpId: ids.opId,
        supplierId,
        amount: amountRes.value,
        method,
        note: note.trim() || null,
        createdAt: paymentTimestamp(date, today),
      });
      await onSaved();
      toast.success("To'lov yozildi.");
      onClose();
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.kind === 'validation' || appErr.kind === 'forbidden') setLocked(false);
      setFormError(appErr.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title="To'lov berdim"
      description={supplierName}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Bekor qilish
          </Button>
          <Button type="submit" form="supplier-payment-form" loading={busy}>
            To&apos;lovni saqlash
          </Button>
        </>
      }
    >
      <form id="supplier-payment-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <Alert tone="red">
            {formError}
            {locked && <span className="mt-1 block text-xs">Qayta urinish shu to&apos;lovni takrorlamaydi (bir martalik kalit).</span>}
          </Alert>
        )}
        <div className="flex items-center justify-between rounded-xl bg-subtle px-3.5 py-3 text-sm">
          <span className="text-muted">Joriy qarzim</span>
          <Money value={debt} className={debt > 0n ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-semibold text-fg'} />
        </div>
        <div>
          <Input label="Summa" inputMode="numeric" value={amount} onChange={(e) => setAmount(formatMoneyInput(e.target.value))} error={errors.amount} suffix="so'm" placeholder="0" required disabled={locked} />
          {debt > 0n && !locked && (
            <button type="button" onClick={() => setAmount(formatMoneyInput(debt.toString()))} className="mt-1.5 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              To&apos;liq qarzni kiritish
            </button>
          )}
        </div>
        <Input label="Sana" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} error={errors.date} disabled={locked} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">To&apos;lov usuli</span>
          <Segmented ariaLabel="To'lov usuli" value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: uz.methods[m] }))} />
        </div>
        <Textarea label="Izoh" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ixtiyoriy" />
      </form>
    </Modal>
  );
}
