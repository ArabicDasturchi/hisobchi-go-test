'use client';
/**
 * F2: ochiq savatlar chiplari (panel tepasida). Har chip — bitta yarim qolgan savdo/kirim (mijoz yoki ta'minotchi
 * nomi va qatorlar soni). Bosilsa o'sha savat ochiladi, joriysi saqlanib qoladi. "+ Yangi" — bo'sh savat.
 * Hamma tugma ≥44px, joriy chip `aria-current` bilan.
 */
import { Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import type { StoredBasket } from '@/lib/basketStore';

export interface BasketChipsProps {
  baskets: readonly StoredBasket[];
  currentId: string;
  /** Joriy savatda qator bormi (ro'yxatda hali bo'lmasa ham chip ko'rsatiladi) */
  currentHasLines: boolean;
  nameOf: (b: Pick<StoredBasket, 'partnerId'>) => string;
  currentName: string;
  mode: 'server' | 'local' | null;
  saving: boolean;
  disabled?: boolean;
  onOpen: (b: StoredBasket) => void;
  onNew: () => void;
  onDiscard: () => void;
  newLabel: string;
}

const chip = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-50';

export function BasketChips(p: BasketChipsProps) {
  const listed = p.baskets.some((b) => b.id === p.currentId);
  const showCurrent = !listed && p.currentHasLines;
  if (p.baskets.length === 0 && !p.currentHasLines) return null;
  return (
    <div className="space-y-1" data-testid="basket-chips">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Ochiq savatlar">
        {showCurrent && (
          <span className={cn(chip, 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200')} aria-current="true" role="tab" aria-selected="true">
            <ShoppingBasket className="h-4 w-4" aria-hidden />
            {p.currentName}
          </span>
        )}
        {p.baskets.map((b) => {
          const current = b.id === p.currentId;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={current}
              aria-current={current ? 'true' : undefined}
              disabled={p.disabled || current}
              onClick={() => p.onOpen(b)}
              data-testid="basket-chip"
              className={cn(
                chip,
                current ? 'border-emerald-500 bg-emerald-50 text-emerald-900 disabled:opacity-100 dark:bg-emerald-500/15 dark:text-emerald-200' : 'border-line bg-surface text-fg hover:bg-subtle',
              )}
            >
              <ShoppingBasket className="h-4 w-4" aria-hidden />
              {p.nameOf(b)}
              <span className="rounded-full bg-subtle px-1.5 text-xs tabular-nums text-muted">{b.lines.length}</span>
            </button>
          );
        })}
        <button type="button" onClick={p.onNew} disabled={p.disabled} className={cn(chip, 'border-dashed border-line bg-surface text-muted hover:text-fg')} data-testid="basket-new">
          <Plus className="h-4 w-4" aria-hidden />
          {p.newLabel}
        </button>
        {(listed || p.currentHasLines) && (
          <button type="button" onClick={p.onDiscard} disabled={p.disabled} aria-label="Joriy savatni tashlash" className={cn(chip, 'border-line bg-surface px-3 text-muted hover:text-rose-600')} data-testid="basket-discard">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-xs text-muted" role="status" aria-live="polite">
        {p.saving ? 'Saqlanmoqda…' : p.mode === 'local' ? "Savat shu qurilmada saqlanadi (sahifani yangilasangiz ham yo'qolmaydi)" : p.mode === 'server' ? 'Savat saqlangan: boshqa bo\'limga o\'tib qaytsangiz ham joyida' : ''}
      </p>
    </div>
  );
}
