'use client';
/**
 * Mijozlar / Ta'minotchilar ro'yxati (P-12, P-14): nom, izoh, qarz, oxirgi harakat. Nom va izoh joyida tuzatiladi
 * (ikki marta bosish yoki "Tuzatish"); "Daftar" tugmasi shaxsiy daftar varag'iga olib boradi.
 * Qarz daftarda hisoblanadi (core): bu yerda faqat ko'rsatiladi, tahrirlanmaydi.
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { EditableCell } from '@/components/edit/EditableCell';
import { EditableRow, RowActions, RowError } from '@/components/edit/EditableRow';
import { useRowEdit } from '@/components/edit/useRowEdit';
import { Money } from '@/components/shared';
import { cn } from '@/components/ui/primitives';
import { formatDate } from '@/lib/dates';
import type { PartnerListRow } from '@/lib/ledgerView';
import type { FieldDef } from '@/lib/rowEdit';

export interface PartnerEdit {
  name: string;
  notes: string | null;
}

export const PARTNER_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nomi', kind: 'text', required: true, maxLength: 120 },
  { key: 'notes', label: 'Izoh', kind: 'text', maxLength: 500 },
];

const GRID = 'grid items-center gap-x-3 gap-y-1 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_9rem_7rem_auto]';

function PartnerRow({ r, notes, base, onSave, canManage, emptyNote }: { r: PartnerListRow; notes: string; base: string; onSave: (id: string, v: PartnerEdit) => Promise<void>; canManage: boolean; emptyNote: string }) {
  const initial = useMemo(() => ({ name: r.name, notes }), [r.name, notes]);
  const row = useRowEdit({
    fields: PARTNER_FIELDS,
    initial,
    onSave: async (v) => onSave(r.id, { name: (v.name ?? '').trim(), notes: (v.notes ?? '').trim() || null }),
  });
  return (
    <EditableRow row={row} as="li" className={cn('px-3 py-2.5', GRID)}>
      <EditableCell field={row.fields[0]!} row={row} disabled={!canManage} display={<span className="block truncate text-[15px] font-semibold text-fg">{r.name}</span>} />
      <EditableCell
        field={row.fields[1]!}
        row={row}
        disabled={!canManage}
        className="order-last col-span-2 md:order-none md:col-span-1"
        display={<span className="block truncate text-sm text-muted">{notes || emptyNote}</span>}
      />
      <span className="text-right md:order-none">
        <Money value={r.balance} className={cn('text-[15px] font-semibold', r.balance > 0n ? 'text-amber-600 dark:text-amber-400' : 'text-muted')} />
      </span>
      <span className="hidden text-sm text-muted md:block">{r.lastActivity ? formatDate(r.lastActivity) : '—'}</span>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        <Link href={`${base}/${r.id}`} className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-fg hover:bg-subtle" aria-label={`${r.name}: daftarni ochish`}>
          Daftar
        </Link>
        {canManage && <RowActions row={row} label={r.name} />}
      </div>
      {row.formError && (
        <div className="col-span-full">
          <RowError row={row} />
        </div>
      )}
    </EditableRow>
  );
}

export function PartnerList({ rows, notes, base, onSave, canManage, balanceHeader, emptyNote = 'izoh yo‘q' }: { rows: readonly PartnerListRow[]; notes: ReadonlyMap<string, string>; base: '/customers' | '/suppliers'; onSave: (id: string, v: PartnerEdit) => Promise<void>; canManage: boolean; balanceHeader: string; emptyNote?: string }) {
  return (
    <>
      <div className={cn('hidden border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid', GRID)} aria-hidden>
        <span>{base === '/customers' ? 'Mijoz' : "Ta'minotchi"}</span>
        <span>Izoh</span>
        <span className="text-right">{balanceHeader}</span>
        <span>Oxirgi harakat</span>
        <span />
      </div>
      <ul className="divide-y divide-line" aria-label={base === '/customers' ? 'Mijozlar' : "Ta'minotchilar"}>
        {rows.map((r) => (
          <PartnerRow key={r.id} r={r} notes={notes.get(r.id) ?? ''} base={base} onSave={onSave} canManage={canManage} emptyNote={emptyNote} />
        ))}
      </ul>
      {canManage && <p className="hidden border-t border-line px-4 py-2 text-xs text-muted md:block">Katakni ikki marta bosing yoki Enter: tuzatish. Enter saqlaydi, Esc bekor.</p>}
    </>
  );
}
