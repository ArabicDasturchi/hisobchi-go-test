'use client';
/**
 * To'lov olish (mijozdan) va Ta'minotchiga to'lov: asosiy maydon. Summa pastdagi kiritish oynasida yoziladi;
 * bu yerda qarz, katta summa, tez tugmalar, usul va natija ("To'lovdan keyin qarz", kod hisoblaydi).
 */
import { Money } from '@/components/shared';
import { Alert, Button, cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/data/types';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';

export interface PayViewProps {
  title: string;
  partnerName: string | null;
  debtLabel: string;
  debt: bigint;
  amount: string;
  onAmount: (v: string) => void;
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  error: string | null;
  locked: boolean;
  busy: boolean;
  onConfirm: () => void;
  /** Mijoz/ta'minotchi tanlanmagan bo'lsa matn */
  needPartnerText: string;
}

export function PayView(p: PayViewProps) {
  const parsed = p.amount.trim() ? parseMoneyInput(p.amount, { max: p.debt > 0n ? p.debt : 1n }) : null;
  const amountOk = parsed?.ok ? parsed.value : null;
  const after = amountOk !== null ? p.debt - amountOk : null;
  const inputError = parsed && !parsed.ok ? (p.debt <= 0n ? "Qarz yo'q" : parsed.message) : null;
  const canConfirm = !!p.partnerName && amountOk !== null && p.debt > 0n && !p.busy;
  return (
    <section aria-label={p.title} className="space-y-3" data-testid="pay-view">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">{p.title}</h2>
        <p className="text-sm text-muted">{p.partnerName ?? p.needPartnerText}</p>
      </div>

      {p.partnerName && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-xs text-muted">{p.debtLabel}</p>
            <Money value={p.debt} className={cn('text-xl font-semibold', p.debt > 0n ? 'text-amber-600 dark:text-amber-400' : 'text-fg')} />
          </div>
          {p.debt <= 0n && <span className="text-sm text-muted">Qarz yo&apos;q</span>}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <p className="text-xs text-muted">{p.title === "To'lov olish" ? "To'lov summasi" : "To'lov summasi"}</p>
          <p className="text-4xl font-semibold tracking-tight text-fg tabular-nums" aria-live="polite">
            {p.amount.trim() ? p.amount : <span className="text-muted">0</span>}
          </p>
          {inputError && (
            <p className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400" role="alert">
              {inputError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={p.debt <= 0n || p.locked}
            onClick={() => p.onAmount(formatMoneyInput(p.debt.toString()))}
            className="min-h-11 rounded-full border border-line px-4 text-sm font-medium text-fg hover:bg-subtle disabled:opacity-50"
          >
            To&apos;liq: {formatMoneyInput(p.debt.toString()) || '0'}
          </button>
          <button
            type="button"
            disabled={p.debt <= 1n || p.locked}
            onClick={() => p.onAmount(formatMoneyInput((p.debt / 2n).toString()))}
            className="min-h-11 rounded-full border border-line px-4 text-sm font-medium text-fg hover:bg-subtle disabled:opacity-50"
          >
            Yarmi: {formatMoneyInput((p.debt / 2n).toString()) || '0'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="To'lov usuli">
          <span className="text-sm text-muted">Usul:</span>
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={p.method === m}
              disabled={p.locked}
              onClick={() => p.onMethod(m)}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm font-medium disabled:opacity-50',
                p.method === m ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-line text-fg hover:bg-subtle',
              )}
            >
              {uz.methods[m]}
            </button>
          ))}
        </div>
      </div>

      {p.error && (
        <Alert tone="red">
          {p.error}
          {p.locked && <span className="mt-1 block text-xs">Saqlangan bo&apos;lishi mumkin. Qayta urinish ikki marta yozmaydi.</span>}
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">To&apos;lovdan keyin qarz (kod hisoblaydi)</p>
          <p className="truncate text-xl font-semibold text-fg">{after !== null ? <Money value={after} /> : '—'}</p>
        </div>
        <Button size="lg" className="h-12 shrink-0 rounded-xl px-5" disabled={!canConfirm} loading={p.busy} onClick={p.onConfirm} data-testid="pay-confirm">
          {p.locked ? uz.composer.retry : uz.composer.confirm}
        </Button>
      </div>
    </section>
  );
}
