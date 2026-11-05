'use client';
/**
 * Inventarizatsiya: haqiqiy sanalgan qoldiq kiritiladi, farq (±) `adjust_stock` bilan jurnalga qo'shiladi
 * (eski yozuvlar o'zgarmaydi). Sabab majburiy (kamida 3 belgi).
 */
import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Alert, Button, Input } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { useShop } from '../ShopDataProvider';
import type { StockItem } from '@/lib/data/books';
import { adjustStock } from '@/lib/data/purchases';
import { errorMessage } from '@/lib/errors';
import { formatQty, parseQtyInput } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

/** Haqiqiy qoldiq: 0 mumkin (miqdor maydonidan farqli, u 0 ni rad etadi) */
export function parseActualQty(raw: string): { ok: true; value: bigint } | { ok: false; message: string } {
  const s = raw.trim();
  if (s !== '' && /^0+([.,]0*)?$/.test(s)) return { ok: true, value: 0n };
  return parseQtyInput(s);
}

export function AdjustStockModal({ item, onClose, onSaved }: { item: StockItem | null; onClose: () => void; onSaved: () => void }) {
  if (!item) return null;
  return <AdjustForm key={item.product_id} item={item} onClose={onClose} onSaved={onSaved} />;
}

function AdjustForm({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) {
  const { shopId } = useShop();
  const toast = useToast();
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('Inventarizatsiya');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opId] = useState(() => crypto.randomUUID());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const a = parseActualQty(actual);
    const errs: Record<string, string> = {};
    if (!a.ok) errs.actual = a.message;
    if (reason.trim().length < 3) errs.reason = 'Sababni yozing (kamida 3 belgi)';
    setErrors(errs);
    if (!a.ok || Object.keys(errs).length > 0) return;
    const delta = a.value - item.qty_milli;
    if (delta === 0n) {
      setErrors({ actual: "Qoldiq o'zgarmaydi: tizimdagi qoldiq bilan bir xil" });
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await adjustStock(getSupabase(), { shopId, productId: item.product_id, clientOpId: opId, deltaMilli: delta, reason });
      toast.success(`${item.name}: qoldiq ${formatQty(a.value)} ga tuzatildi.`);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={`Tuzatish: ${item.name}`}
      description={`Tizimdagi qoldiq: ${formatQty(item.qty_milli)} ${item.unit}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Bekor qilish
          </Button>
          <Button type="submit" form="adjust-form" loading={busy}>
            Tuzatish
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="red">{formError}</Alert>}
        <Input label="Haqiqiy qoldiq (sanalgan)" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} error={errors.actual} suffix={item.unit} placeholder="0" autoFocus />
        <Input label="Sabab" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} maxLength={200} />
      </form>
    </Modal>
  );
}
