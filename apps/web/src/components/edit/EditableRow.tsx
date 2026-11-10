'use client';
/**
 * Qator oxiridagi "Tuzatish" tugmasi (telefonda asosiy usul) va qator rejimidagi "Saqlash"/"Bekor".
 * Katak rejimida (bitta katak tahriri) tugmalar o'zgarmaydi: katakning o'z klaviaturasi bor.
 */
import { Button } from '@/components/ui/primitives';
import type { RowEditApi } from './useRowEdit';

export function RowActions({ row, label, disabled, extra }: { row: RowEditApi; /** aria-label uchun qator nomi */ label: string; disabled?: boolean; extra?: React.ReactNode }) {
  const rowMode = row.mode !== null && row.mode.only === null;
  if (rowMode) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" className="h-11" loading={row.busy} onClick={() => void row.save()} aria-label={`${label}: saqlash`}>
          Saqlash
        </Button>
        <Button size="lg" variant="outline" className="h-11" disabled={row.busy} onClick={row.cancel} aria-label={`${label}: bekor qilish`}>
          Bekor
        </Button>
        {extra}
      </div>
    );
  }
  return (
    <Button size="lg" variant="outline" className="h-11" disabled={disabled || row.busy || row.editing} onClick={() => row.start()} aria-label={`${label}ni tuzatish`}>
      Tuzatish
    </Button>
  );
}

/** Qator xatosi (server rad etdi, tarmoq xatosi): qiymat saqlanib qoladi */
export function RowError({ row }: { row: RowEditApi }) {
  if (!row.formError) return null;
  return (
    <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
      {row.formError}
    </p>
  );
}

/**
 * Qator konteyneri: tahrir paytida Esc butun qatorni bekor qiladi (qator rejimi); Enter maydonlarning o'zida.
 * `as` — jadval (`tr`) yoki kartochka (`div`/`li`).
 */
export function EditableRow({ row, as = 'div', className, children, ...rest }: { row: RowEditApi; as?: 'div' | 'li' | 'tr'; className?: string; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const Tag = as as 'div';
  return (
    <Tag
      {...rest}
      data-editing={row.editing ? '' : undefined}
      className={className}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.key === 'Escape' && row.mode && row.mode.only === null) {
          e.stopPropagation();
          row.cancel();
        }
      }}
    >
      {children}
    </Tag>
  );
}
