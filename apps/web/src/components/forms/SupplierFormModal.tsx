'use client';
/**
 * Ta'minotchi qo'shish/tahrirlash. Yangi ta'minotchiga "Hozirgi qarzim" (boshlang'ich qarz) kiritiladi: u alohida
 * "ochilish qoldig'i" yozuvi bo'lib jurnalga qo'shiladi (009 migratsiyasi; jurnal faqat qo'shiladi).
 * Ta'minotchi kartochkasi saqlandi-yu qarz yozilmasa (masalan 009 qo'llanmagan), foydalanuvchiga aniq aytiladi
 * va qayta urinish o'sha kalit bilan takroriy yozuv yaratmaydi.
 */
import { useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Alert, Button, Input, Textarea } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { useShop } from '../ShopDataProvider';
import type { Supplier } from '@/lib/data/books';
import { createSupplier, postSupplierOpeningBalance, updateSupplier } from '@/lib/data/purchases';
import { errorMessage } from '@/lib/errors';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

export function SupplierFormModal({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier?: Supplier | null; onSaved?: (s: Supplier) => void }) {
  if (!open) return null;
  return <SupplierForm key={supplier?.id ?? 'new'} onClose={onClose} supplier={supplier ?? null} onSaved={onSaved} />;
}

function SupplierForm({ onClose, supplier, onSaved }: { onClose: () => void; supplier: Supplier | null; onSaved?: (s: Supplier) => void }) {
  const { shopId } = useShop();
  const toast = useToast();
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [debt, setDebt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Kartochka saqlangan, lekin boshlang'ich qarz yozilmagan: faqat qarzni qayta yuborish mumkin */
  const [saved, setSaved] = useState<Supplier | null>(null);
  const [ids] = useState(() => ({ doc: crypto.randomUUID(), op: crypto.randomUUID() }));

  async function writeOpening(s: Supplier, amount: bigint) {
    await postSupplierOpeningBalance(getSupabase(), { shopId, documentId: ids.doc, clientOpId: ids.op, supplierId: s.id, amount });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const errs: Record<string, string> = {};
    if (!trimmed) errs.name = "Ta'minotchi nomini kiriting";
    else if (trimmed.length > 120) errs.name = 'Nom juda uzun (120 belgigacha)';
    if (phone.trim().length > 32) errs.phone = 'Telefon juda uzun';
    if (notes.trim().length > 500) errs.notes = 'Izoh juda uzun (500 belgigacha)';
    let opening = 0n;
    if (!supplier && debt.trim() !== '') {
      const p = parseMoneyInput(debt, { allowZero: true, max: 1_000_000_000_000n });
      if (!p.ok) errs.debt = p.message;
      else opening = p.value;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setFormError(null);
    const sb = getSupabase();
    try {
      let s = saved;
      if (!s) {
        const input = { name: trimmed, phone: phone.trim() || null, notes: notes.trim() || null };
        s = supplier ? await updateSupplier(sb, shopId, supplier.id, input) : await createSupplier(sb, shopId, input);
        setSaved(s);
      }
      if (!supplier && opening > 0n) await writeOpening(s, opening);
      toast.success(supplier ? "Ta'minotchi yangilandi." : `«${s.name}» qo'shildi.`);
      onSaved?.(s);
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
      title={supplier ? "Ta'minotchini tahrirlash" : "Yangi ta'minotchi"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {saved ? 'Yopish' : 'Bekor qilish'}
          </Button>
          <Button type="submit" form="supplier-form" loading={busy}>
            {saved ? 'Qarzni qayta yozish' : 'Saqlash'}
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {saved && (
          <Alert tone="amber" title="Ta'minotchi qo'shildi, lekin boshlang'ich qarz yozilmadi">
            Kartochka saqlandi. Qarzni qayta yozishga urinib ko&apos;ring yoki keyin ta&apos;minotchi sahifasidan kiriting.
          </Alert>
        )}
        {formError && <Alert tone="red">{formError}</Alert>}
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} required placeholder="Masalan: Rahim aka" disabled={busy || !!saved} />
        <Input label="Telefon (ixtiyoriy)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+998 ..." maxLength={32} disabled={busy || !!saved} />
        <Textarea label="Izoh (ixtiyoriy)" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} maxLength={500} disabled={busy || !!saved} />
        {!supplier && (
          <Input
            label="Hozirgi qarzim"
            hint="Shu ta'minotchiga hozir qancha qarzdorsiz (bo'lmasa bo'sh qoldiring). Alohida «ochilish qoldig'i» yozuvi sifatida saqlanadi."
            inputMode="numeric"
            value={debt}
            onChange={(e) => setDebt(formatMoneyInput(e.target.value))}
            error={errors.debt}
            suffix="so'm"
            placeholder="0"
          />
        )}
      </form>
    </Modal>
  );
}
