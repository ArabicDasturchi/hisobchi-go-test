'use client';
/**
 * Savdo qatori kartochkasi: nom, "N so'm / dona", soni, qator jami, o'chirish.
 * Sariq holat: ogohlantirish belgisi + sabab matni + ajratilgan maydon (rangga yolg'iz tayanilmaydi).
 */
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Money } from '@/components/shared';
import { cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import type { LineStatus } from '@/lib/lineStatus';
import { formatMoneyInput, formatSom, lineTotal, parseMoneyInput, parseQtyInput } from '@/lib/money';
import type { DraftLine } from '@/lib/saleForm';

export interface SaleLineCardProps {
  line: DraftLine;
  status: LineStatus;
  /** Ombor/tan narx ogohlantirishlari (saqlashni to'smaydi) */
  warnings?: readonly string[];
  /** Hozir optom narx amal qiladi (optom/dona yoqiq, miqdor chegaraga yetgan, narx qo'lda emas): "Optom narx" belgisi */
  wholesale?: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

const field =
  'h-11 rounded-xl border bg-surface px-3 text-center text-base font-semibold text-fg tabular-nums outline-none transition-colors placeholder:font-normal placeholder:text-muted focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-60';

export function SaleLineCard({ line, status, warnings = [], wholesale = false, disabled, onChange, onRemove }: SaleLineCardProps) {
  const yellow = status.status === 'yellow';
  const reason = yellow ? status.reason : null;
  const qty = parseQtyInput(line.qty);
  const price = parseMoneyInput(line.price, { allowZero: true });
  const total = qty.ok && price.ok ? lineTotal({ qtyMilli: qty.value, unitPrice: price.value }) : null;
  const unitText = price.ok ? formatSom(price.value).replace(/ /g, ' ') : null;
  const [editingPrice, setEditingPrice] = useState(false);
  const priceEditable = reason === 'price' || editingPrice;

  return (
    <li
      data-testid="sale-line"
      data-status={status.status}
      className={cn(
        'rounded-2xl border p-3.5',
        yellow ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10' : 'border-line bg-surface',
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:flex sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fg">
            {line.productName.trim() || '—'}
            {status.isNew && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-sky-100 px-1.5 py-0.5 align-middle text-[11px] font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
                <Sparkles className="h-3 w-3" aria-hidden />
                {uz.composer.newProduct}
              </span>
            )}
          </p>
          {yellow ? (
            <p className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-amber-800 dark:text-amber-300" role="status">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {status.message}
            </p>
          ) : (
            unitText && (
              <span className="flex flex-wrap items-center gap-x-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditingPrice(true)}
                aria-label={`${uz.composer.price}ni o'zgartirish: ${line.productName.trim()}`}
                className="-my-3 block py-3 text-left text-[13px] text-muted hover:text-fg hover:underline disabled:opacity-60"
              >
                {unitText}
                <span className="hidden sm:inline"> / {uz.units[line.unit]}</span>
              </button>
              {wholesale && (
                <span data-testid="wholesale-badge" className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  Optom narx
                </span>
              )}
              </span>
            )
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${uz.composer.removeLine}: ${line.productName.trim() || 'qator'}`}
          className="flex h-11 w-11 shrink-0 sm:order-last items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="col-span-2 flex items-center justify-between gap-3 sm:contents">
        <input
          aria-label={`${uz.composer.qty}: ${line.productName.trim() || 'qator'}`}
          inputMode="decimal"
          value={line.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          disabled={disabled}
          placeholder={uz.composer.qty}
          aria-invalid={reason === 'qty' || undefined}
          className={cn(field, 'w-24 shrink-0 sm:w-20', reason === 'qty' ? 'border-amber-500 ring-2 ring-amber-400/50' : 'border-line')}
        />

        {priceEditable ? (
          <input
            aria-label={`${uz.composer.price}: ${line.productName.trim() || 'qator'}`}
            inputMode="numeric"
            value={line.price}
            // Qo'lda yozilgan narx avtomatik (optom/dona) yangilanishdan chiqadi: foydalanuvchi narxi hech qachon almashtirilmaydi
            onChange={(e) => onChange({ price: formatMoneyInput(e.target.value), autoPrice: false })}
            disabled={disabled}
            placeholder={uz.composer.price}
            aria-invalid={reason === 'price' || undefined}
            onFocus={() => setEditingPrice(true)}
            onBlur={() => setEditingPrice(false)}
            autoFocus={editingPrice}
            className={cn(field, 'min-w-0 flex-1 sm:w-32 sm:flex-none', reason === 'price' ? 'border-2 border-amber-500' : 'border-line')}
          />
        ) : (
          <span data-testid="line-total" className="min-w-0 flex-1 text-right text-base font-semibold tabular-nums text-fg sm:w-28 sm:flex-none">
            {total !== null ? <Money value={total} /> : '—'}
          </span>
        )}

        </div>
      </div>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300" role="status">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
