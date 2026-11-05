'use client';
/**
 * Qidiruvli tovar maydoni (combobox). Katalogdan nom bo'yicha qidiradi; tanlanganda birlik va sotish narxi
 * avtomatik to'ladi (chaqiruvchi `onPick` da). Katalogda yo'q nom yozilsa "Yangi tovar sifatida" varianti ko'rinadi
 * (nom shundoq qoladi; server savdoda yangi tovar sifatida qabul qiladi — avvalgi xatti-harakat).
 */
import { Plus } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { cn, Input } from '@/components/ui/primitives';
import type { Product } from '@/lib/data/types';
import { groupDigits } from '@/lib/money';
import { findProductByName, searchProducts } from '@/lib/productPicker';

interface Props {
  value: string;
  products: readonly Product[];
  onText: (text: string) => void;
  onPick: (p: Product) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  wrapClassName?: string;
}

export function ProductPicker({ value, products, onText, onPick, label, error, disabled, autoFocus, wrapClassName }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => searchProducts(products, value, 8), [products, value]);
  const exact = useMemo(() => findProductByName(products, value), [products, value]);
  const showNew = value.trim().length > 0 && !exact;
  const count = matches.length + (showNew ? 1 : 0);

  function pick(i: number) {
    const p = matches[i];
    if (p) onPick(p);
    setOpen(false);
  }

  return (
    <div className={cn('relative', wrapClassName)}>
      <Input
        label={label}
        aria-label="Mahsulot nomi"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          // Ro'yxatdagi bosishga ulgurish uchun biroz kechikish
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(count - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && count > 0) {
            e.preventDefault();
            pick(active);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        error={error}
        placeholder="Tovar nomini yozing yoki tanlang"
        maxLength={120}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {open && !disabled && count > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-subtle' : '')}
            >
              <span className="min-w-0 truncate font-medium text-fg">{p.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.last_price !== null ? `${groupDigits(p.last_price)} / ${p.unit}` : p.unit}
              </span>
            </li>
          ))}
          {showNew && (
            <li
              role="option"
              aria-selected={active === matches.length}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              onMouseEnter={() => setActive(matches.length)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400', active === matches.length ? 'bg-subtle' : '')}
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">«{value.trim()}» — yangi tovar sifatida qo&apos;shish</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
