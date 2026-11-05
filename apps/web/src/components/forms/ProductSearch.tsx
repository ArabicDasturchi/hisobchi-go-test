'use client';
/**
 * Kirim uchun qidiruvli tovar tanlash: faqat katalogdagi faol tovarlar (RPC product_id talab qiladi).
 * Yangi tovar avval «Mahsulotlar» sahifasida qo'shiladi.
 */
import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn, Input } from '@/components/ui/primitives';
import type { Product } from '@/lib/data/types';
import { searchCatalog } from '@/lib/purchaseForm';

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

export function ProductSearch({ value, products, onText, onPick, label, error, disabled, autoFocus, wrapClassName }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matches = useMemo(() => searchCatalog(products, value, 8), [products, value]);

  function pick(i: number) {
    const p = matches[i];
    if (p) onPick(p);
    setOpen(false);
  }

  return (
    <div className={cn('relative', wrapClassName)}>
      <Input
        label={label}
        aria-label="Tovar"
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
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && matches.length > 0) {
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
      {open && !disabled && (
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
              <span className="shrink-0 text-xs text-muted">{p.unit}</span>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              Katalogda topilmadi.{' '}
              <Link href="/products" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                Mahsulot qo&apos;shish
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
