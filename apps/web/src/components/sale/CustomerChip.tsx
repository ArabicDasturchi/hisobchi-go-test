'use client';
/**
 * "Kimga" chipi: mobilda pastdan varaq, kompyuterda menyu. "Mijozsiz (naqd)", qidiruvli mijozlar, "Yangi mijoz".
 * Arxivlangan mijoz chaqiruvchi tomonidan (`selectableCustomers`) allaqachon chiqarib tashlangan.
 */
import { ChevronDown, UserPlus } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Money } from '@/components/shared';
import { cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import type { CustomerBalance } from '@/lib/data/ledger';
import { balanceOf } from '@/lib/data/ledger';
import type { Customer } from '@/lib/data/types';
import { looseKey } from '@/lib/translit';

export interface CustomerChipProps {
  customers: readonly Customer[];
  balances: Map<string, CustomerBalance>;
  value: string;
  onChange: (id: string) => void;
  onNewCustomer: () => void;
  disabled?: boolean;
  /** To'lov amali: mijozsiz variant yo'q */
  required?: boolean;
}

export function CustomerChip({ customers, balances, value, onChange, onNewCustomer, disabled, required }: CustomerChipProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const selected = customers.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const filtered = useMemo(() => {
    const k = looseKey(q);
    return k ? customers.filter((c) => looseKey(c.name).includes(k) || (c.phone ?? '').replace(/\D/g, '').includes(k.replace(/\D/g, '') || '\u0000')) : customers;
  }, [customers, q]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQ('');
    chipRef.current?.focus();
  }

  const label = selected ? selected.name : required ? 'Tanlang' : uz.composer.cashSale;
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <button
        ref={chipRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${uz.composer.whoChip}: ${label}`}
        className="flex h-11 w-full min-w-0 items-center gap-1.5 rounded-full border border-line bg-subtle px-3.5 text-sm font-medium text-fg transition-colors hover:bg-line/60 disabled:opacity-50 sm:max-w-[16rem]"
      >
        <span className="truncate">
          <span className="hidden sm:inline">{uz.composer.whoChip}: </span>
          {selected || required ? label : (
            <>
              Mijozsiz<span className="hidden sm:inline"> (naqd)</span>
            </>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/40 md:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-2xl border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-2 md:max-h-96 md:w-80 md:rounded-2xl md:pb-0"
          >
            <div className="border-b border-line p-3">
              <p id={titleId} className="mb-2 text-sm font-semibold text-fg">
                {uz.composer.whoChip}
              </p>
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={uz.composer.searchCustomer}
                aria-label={uz.composer.searchCustomer}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {!required && (
                <li>
                  <button type="button" onClick={() => choose('')} aria-pressed={value === ''} className={cn('flex min-h-12 w-full items-center px-4 text-left text-[15px] font-medium hover:bg-subtle', value === '' && 'bg-emerald-50 dark:bg-emerald-500/10')}>
                    {uz.composer.cashSale}
                  </button>
                </li>
              )}
              {filtered.map((c) => {
                const debt = balanceOf(balances, c.id).debt;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => choose(c.id)} aria-pressed={value === c.id} className={cn('flex min-h-12 w-full items-center justify-between gap-3 px-4 py-1.5 text-left hover:bg-subtle', value === c.id && 'bg-emerald-50 dark:bg-emerald-500/10')}>
                      <span className="min-w-0 truncate text-[15px] font-medium text-fg">{c.name}</span>
                      {debt > 0n && (
                        <span className="shrink-0 text-xs text-rose-600 dark:text-rose-400">
                          Qarzi: <Money value={debt} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-4 py-3 text-sm text-muted">Mijoz topilmadi.</li>}
            </ul>
            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNewCustomer();
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-[15px] font-medium text-emerald-700 hover:bg-subtle dark:text-emerald-400"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                {uz.composer.newCustomer}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
