'use client';
/**
 * Tahrirlanadigan katak: ko'rinishda — tugma (ikki marta bosish yoki fokusda Enter/F2), tahrirda — maydon.
 * Katak rejimi: Enter saqlaydi, Esc bekor, Tab saqlab keyingi katakka o'tadi. Qator rejimida (`row.start()`) maydon
 * qator holatiga bog'langan. Xato katak ostida ko'rinadi, qiymat yo'qolmaydi. Haqiqiy button/input, ≥44px, ikkala tema.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';
import { formatMoneyInput } from '@/lib/money';
import type { FieldDef } from '@/lib/rowEdit';
import type { RowEditApi } from './useRowEdit';

const input =
  'h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-[15px] text-fg outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-60';

export interface EditableCellProps {
  field: FieldDef;
  row: RowEditApi;
  /** Ko'rinishdagi matn/belgi (masalan "9 000 so'm" yoki "narx kiriting" belgisi) */
  display: ReactNode;
  className?: string;
  /** Matn o'ngga tekislanadimi (summa/son) */
  right?: boolean;
  disabled?: boolean;
  /** Ko'rinish tugmasi qo'shimcha sinflari (masalan sariq "narx kiriting") */
  displayClassName?: string;
}

export function EditableCell({ field, row, display, className, right, disabled, displayClassName }: EditableCellProps) {
  const wrap = useRef<HTMLSpanElement>(null);
  const errId = useId();
  const editing = row.isEditing(field.key);
  const cellMode = row.mode?.only === field.key;
  const error = row.errors[field.key];
  const value = row.values[field.key] ?? '';

  // Tab: oldingi katak saqlangach shu katak tahrirni boshlaydi
  const startRef = useRef(row.start);
  useEffect(() => {
    startRef.current = row.start;
  });
  useEffect(() => {
    const el = wrap.current;
    if (!el || disabled) return;
    const on = () => startRef.current(field.key);
    el.addEventListener('hg:edit', on);
    return () => el.removeEventListener('hg:edit', on);
  }, [field.key, disabled]);

  async function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      row.cancel();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      await row.save();
    } else if (e.key === 'Tab' && !e.shiftKey && cellMode) {
      const cells = [...document.querySelectorAll<HTMLElement>('[data-editable-cell]')];
      const next = cells[cells.indexOf(wrap.current as HTMLElement) + 1];
      e.preventDefault();
      if (await row.save()) next?.dispatchEvent(new CustomEvent('hg:edit'));
    }
  }

  return (
    <span ref={wrap} data-editable-cell={disabled ? undefined : ''} className={cn('block min-w-0', className)}>
      {editing ? (
        <>
          {field.kind === 'select' ? (
            <select
              autoFocus={cellMode}
              aria-label={field.label}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errId : undefined}
              value={value}
              disabled={row.busy}
              onChange={(e) => row.set(field.key, e.target.value)}
              onKeyDown={onKeyDown}
              className={cn(input, 'appearance-none', error ? 'border-rose-500' : 'border-line')}
            >
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus={cellMode}
              aria-label={field.label}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errId : undefined}
              inputMode={field.kind === 'money' ? 'numeric' : field.kind === 'qty' ? 'decimal' : 'text'}
              value={value}
              maxLength={field.maxLength}
              disabled={row.busy}
              onFocus={(e) => cellMode && e.currentTarget.select()}
              onChange={(e) => row.set(field.key, field.kind === 'money' ? formatMoneyInput(e.target.value) : e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => {
                // Katak rejimida o'zgarmagan qiymat bilan chiqilsa tahrir yopiladi; o'zgargani yo'qolmaydi
                if (cellMode && !row.busy && !row.dirty && !row.errors[field.key]) row.cancel();
              }}
              className={cn(input, right && 'text-right', error ? 'border-rose-500' : 'border-line')}
            />
          )}
          {error && (
            <p id={errId} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          disabled={disabled || row.busy}
          aria-label={`${field.label}: tuzatish`}
          title="Ikki marta bosing yoki Enter: tuzatish"
          onDoubleClick={() => row.start(field.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'F2') {
              e.preventDefault();
              row.start(field.key);
            }
          }}
          className={cn(
            'min-h-11 w-full rounded-lg px-2 text-left transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:cursor-default disabled:hover:bg-transparent',
            right && 'text-right',
            displayClassName,
          )}
        >
          {display}
        </button>
      )}
    </span>
  );
}
