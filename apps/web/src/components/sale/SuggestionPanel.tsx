'use client';
/**
 * Takliflar paneli: yozilgan nom bo'yicha HAMMA mos tovar, ko'p tanlash bilan.
 * Qatorlar haqiqiy <button aria-pressed>. Ro'yxatda bor tovar belgilanmaydi: bossangiz soni +1.
 * Klaviatura (fokus panel ichida): ↑/↓ qatorlar bo'ylab, Space belgilash (tugma), Enter qo'shish, Esc yopish.
 */
import { Check, CheckCircle2, Plus } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import type { Product } from '@/lib/data/types';
import { groupDigits } from '@/lib/money';
import { listedQty } from '@/lib/productSearch';
import type { DraftLine } from '@/lib/saleForm';

export interface SuggestionPanelProps {
  id: string;
  query: string;
  items: readonly Product[];
  lines: readonly DraftLine[];
  selected: readonly string[];
  /** Katalogda yo'q nom: oxirida "yangi tovar sifatida qo'shish" qatori */
  newName: string | null;
  onToggle: (id: string) => void;
  onBump: (p: Product) => void;
  onAddSelected: () => void;
  onAddNew: (name: string) => void;
  onClose: () => void;
  /** Fokusni matn maydoniga qaytarish (Esc / qo'shilgach) */
  onReturnFocus: () => void;
  /** Panel birinchi qatorga fokus berishi uchun tashqi signal (↓ bosilganda ortadi) */
  focusSignal: number;
}

export function SuggestionPanel({ id, query, items, lines, selected, newName, onToggle, onBump, onAddSelected, onAddNew, onClose, onReturnFocus, focusSignal }: SuggestionPanelProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (focusSignal > 0) listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [focusSignal]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[Math.min(at + 1, buttons.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (at <= 0) onReturnFocus();
      else buttons[at - 1]?.focus();
    } else if (e.key === 'Enter' && selected.length > 0) {
      e.preventDefault();
      onAddSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      onReturnFocus();
    }
  }

  const count = selected.length;
  return (
    <div
      id={id}
      data-testid="suggestions"
      onKeyDown={onKeyDown}
      className="mb-2 flex max-h-[min(22rem,42dvh)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-semibold text-fg" aria-live="polite">
          {query.trim() ? `"${query.trim()}" bo'yicha ${items.length} ta tovar` : `Ko'p sotilgan va oxirgi qo'shilgan: ${items.length} ta`}
        </p>
        <button
          type="button"
          onClick={() => {
            onClose();
            onReturnFocus();
          }}
          className="-my-2 -mr-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-emerald-700 hover:bg-subtle dark:text-emerald-400"
        >
          {uz.composer.close}
        </button>
      </div>

      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {items.map((p) => {
          const inList = listedQty(lines, p);
          const isSel = selected.includes(p.id);
          const price = p.last_price !== null ? `${groupDigits(p.last_price)} so'm` : "narx yo'q";
          return (
            <li key={p.id} className="border-b border-line last:border-b-0">
              {inList !== null ? (
                <button
                  type="button"
                  onClick={() => onBump(p)}
                  className="flex min-h-12 w-full items-center gap-3 bg-subtle px-4 py-2 text-left hover:bg-line/60"
                  aria-label={`${p.name}. ${uz.composer.listed}: ${inList}. ${uz.composer.bumpHint}`}
                >
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-fg">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {uz.composer.listed}: {inList} ta. {uz.composer.bumpHint}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{price}</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                    isSel ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'hover:bg-subtle',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
                      isSel ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950' : 'border-line bg-surface',
                    )}
                  >
                    {isSel && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{p.name}</span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{price}</span>
                </button>
              )}
            </li>
          );
        })}
        {newName && (
          <li>
            <button
              type="button"
              onClick={() => onAddNew(newName)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-emerald-700 hover:bg-subtle dark:text-emerald-400"
            >
              <Plus className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate text-[15px]">«{newName}» ni yangi tovar sifatida qo&apos;shish</span>
            </button>
          </li>
        )}
        {items.length === 0 && !newName && <li className="px-4 py-4 text-sm text-muted">Tovar topilmadi.</li>}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="text-sm text-muted" aria-live="polite">
          {count} {uz.composer.selected}
        </p>
        <button
          type="button"
          onClick={onAddSelected}
          disabled={count === 0}
          className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50 dark:bg-emerald-500 dark:text-emerald-950"
        >
          {count} tasini qo&apos;shish
        </button>
      </div>
    </div>
  );
}
