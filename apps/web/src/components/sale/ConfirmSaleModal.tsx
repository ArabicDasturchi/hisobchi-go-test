'use client';
/**
 * Tasdiq oynasi: kimga, nechta qator, jami va to'lov usuli (To'landi / Qarzga / Qisman). Faqat "Saqlash" bazaga yozadi.
 * Mijozsiz savdo faqat "To'landi" (`allowedModes`); qisman summani `buildSalePlan` tekshiradi.
 */
import { Save } from 'lucide-react';
import { Money } from '@/components/shared';
import { Modal } from '@/components/ui/Modal';
import { Alert, Button, Input, Segmented, Select } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/data/types';
import { formatMoneyInput } from '@/lib/money';
import { allowedModes, type PayMode, type SalePlan } from '@/lib/saleForm';

export interface ConfirmSaleModalProps {
  open: boolean;
  onClose: () => void;
  customerName: string | null;
  customerId: string;
  lineCount: number;
  total: bigint;
  currentDebt: bigint;
  mode: PayMode;
  onMode: (m: PayMode) => void;
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  partial: string;
  onPartial: (v: string) => void;
  /** To'lov rejasi (buildSalePlan natijasi); xato bo'lsa null */
  plan: SalePlan | null;
  formError: string | null;
  paidError: string | null;
  locked: boolean;
  busy: boolean;
  onSave: () => void;
}

export function ConfirmSaleModal(p: ConfirmSaleModalProps) {
  const modes = allowedModes(p.customerId || null);
  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      busy={p.busy}
      title="Savdoni tasdiqlash"
      description={p.customerName ?? `${uz.composer.cashSale}`}
      footer={
        <>
          <Button variant="outline" size="lg" className="h-11" onClick={p.onClose} disabled={p.busy}>
            Orqaga
          </Button>
          <Button size="lg" className="h-11" onClick={p.onSave} loading={p.busy} icon={<Save className="h-4 w-4" />} data-testid="confirm-save">
            {p.locked ? uz.composer.retry : 'Saqlash'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="space-y-2 rounded-xl bg-subtle p-3.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Qatorlar</dt>
            <dd className="font-semibold text-fg">{p.lineCount} ta</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Jami</dt>
            <dd>
              <Money value={p.total} className="text-xl font-semibold text-fg" />
            </dd>
          </div>
          {p.customerId && p.plan && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Hozir to&apos;lanadi</dt>
                <dd>
                  <Money value={p.plan.paidNow} className="text-emerald-600 dark:text-emerald-400" />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Qarzga yoziladi</dt>
                <dd>
                  <Money value={p.plan.debt} className={p.plan.debt > 0n ? 'text-rose-600 dark:text-rose-400' : ''} />
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2">
                <dt className="text-muted">Savdodan keyingi qarz</dt>
                <dd>
                  <Money value={p.currentDebt + p.plan.debt} className="font-semibold text-fg" />
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">To&apos;lov</p>
          <Segmented
            ariaLabel="To'lov turi"
            className="w-full [&_button]:min-h-11 [&_button]:flex-1 [&_button]:text-sm"
            value={p.mode}
            onChange={p.onMode}
            options={[
              { value: 'paid', label: "To'landi" },
              { value: 'debt', label: 'Qarzga', disabled: !modes.includes('debt') },
              { value: 'partial', label: 'Qisman', disabled: !modes.includes('partial') },
            ]}
          />
          {!p.customerId && <p className="text-xs text-muted">Qarzga yoki qisman to&apos;lov uchun «Kimga» da mijozni tanlang.</p>}
        </div>

        {p.mode !== 'debt' && p.customerId && (
          <Select label="To'lov usuli" value={p.method} onChange={(e) => p.onMethod(e.target.value as PaymentMethod)} disabled={p.busy} className="h-11">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {uz.methods[m]}
              </option>
            ))}
          </Select>
        )}
        {p.mode === 'partial' && (
          <Input
            label="Hozir to'langan summa"
            inputMode="numeric"
            value={p.partial}
            onChange={(e) => p.onPartial(formatMoneyInput(e.target.value))}
            error={p.paidError}
            suffix="so'm"
            placeholder="0"
            disabled={p.busy}
            className="h-11"
          />
        )}

        {p.formError && (
          <Alert tone="red">
            {p.formError}
            {p.locked && <span className="mt-1 block text-xs">Savdo saqlangan bo&apos;lishi mumkin. «Qayta urinish» uni ikki marta yozmaydi.</span>}
          </Alert>
        )}
        <p className="text-xs text-muted">Summa saqlashdan oldin serverda qayta tekshiriladi. «Saqlash» bosilmaguncha hech narsa yozilmaydi.</p>
      </div>
    </Modal>
  );
}
