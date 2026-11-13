'use client';
import { ChevronDown, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { PLUS_ITEMS, PLUS_SOON, PANEL_ACTIONS, ACTION_INFO, type PanelAction } from '@/lib/panelState';
import { MenuItem, MenuSheet } from './MenuSheet';

/** "Amal" chipi: aynan beshta amal (Savdo, To'lov olish, Kirim, Ta'minotchiga to'lov, Daftarga yozish) */
export function ActionMenu({ value, onChange, disabled }: { value: PanelAction; onChange: (a: PanelAction) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <div className="relative shrink-0">
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Amal: ${ACTION_INFO[value].label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
      >
        <span className="max-w-[9rem] truncate sm:max-w-none">
          <span className="hidden sm:inline">Amal: </span>
          {ACTION_INFO[value].label}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      <MenuSheet open={open} onClose={close} title="Amal tanlang">
        <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Kiritish</p>
        {PANEL_ACTIONS.map((a) => (
          <MenuItem
            key={a}
            label={ACTION_INFO[a].label}
            hint={ACTION_INFO[a].hint}
            selected={a === value}
            onClick={() => {
              onChange(a);
              close();
            }}
          />
        ))}
      </MenuSheet>
    </div>
  );
}

export type PlusChoice = 'report' | 'product' | 'customer' | 'supplier' | 'ai' | 'photo';

/** "+" menyusi: Hisobotlar, yangi mahsulot/mijoz/ta'minotchi; "Tez orada" bandlar o'chirilgan */
export function PlusMenu({ onChoose, disabled }: { onChoose: (c: PlusChoice) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <div className="relative shrink-0">
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Qo'shish menyusi"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-fg transition-colors hover:bg-subtle disabled:opacity-50"
      >
        <Plus className="h-5 w-5" aria-hidden />
      </button>
      <MenuSheet open={open} onClose={close} title="Qo'shish">
        {PLUS_ITEMS.map((it) => (
          <MenuItem
            key={it.key}
            label={it.label}
            hint={it.hint}
            onClick={() => {
              setOpen(false);
              onChoose(it.key);
            }}
          />
        ))}
        {PLUS_SOON.length > 0 && <div className="my-1 border-t border-line" />}
        {PLUS_SOON.map((s) => (
          <MenuItem key={s} label={s} badge="Tez orada" disabled />
        ))}
      </MenuSheet>
    </div>
  );
}
