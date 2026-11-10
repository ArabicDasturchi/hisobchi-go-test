'use client';
/**
 * "Kimga/Kimdan" chipi: mijoz, ta'minotchi yoki ikkalasi (amalga qarab). Telefonda varaq, kompyuterda menyu;
 * qidiruvli ro'yxat; "Mijozsiz (naqd)" faqat Savdoda; oxirida "Yangi ..." bandi.
 * Uzun ismlar qisqartiriladi (kesilmaydi): chipda `truncate`, to'liq nom aria-label'da.
 */
import { ChevronDown, UserPlus } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';
import { looseKey } from '@/lib/translit';
import { MenuSheet } from './MenuSheet';

export interface PartnerOption {
  id: string;
  name: string;
  /** O'ng tomonda kichik yozuv (masalan, qarzi) */
  sub?: ReactNode;
  /** Ro'yxatdagi bo'lim sarlavhasi (Daftarga yozish: Mijozlar / Ta'minotchilar) */
  group?: string;
}

export interface PartnerChipProps {
  label: string; // "Kimga" | "Kimdan"
  options: readonly PartnerOption[];
  value: string;
  onChange: (id: string) => void;
  /** Bo'sh tanlov yozuvi (Savdo: "Mijozsiz (naqd)"); berilmasa tanlash majburiy */
  noneLabel?: string;
  newLabels?: readonly { label: string; onClick: () => void }[];
  disabled?: boolean;
}

export function PartnerChip({ label, options, value, onChange, noneLabel, newLabels = [], disabled }: PartnerChipProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chip = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const k = looseKey(q);
    return k ? options.filter((o) => looseKey(o.name).includes(k)) : options;
  }, [options, q]);

  const close = () => {
    setOpen(false);
    setQ('');
    chip.current?.focus();
  };
  const text = selected ? selected.name : noneLabel ? noneLabel : 'Tanlang';
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <button
        ref={chip}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${text}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 w-full min-w-0 items-center gap-1.5 rounded-full border bg-subtle px-3.5 text-sm font-medium text-fg transition-colors hover:bg-line/60 disabled:opacity-50 sm:max-w-[18rem]',
          !selected && !noneLabel ? 'border-amber-500/70' : 'border-line',
        )}
      >
        <span className="truncate">
          <span className="hidden sm:inline">{label}: </span>
          {text}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      <MenuSheet open={open} onClose={close} title={label}>
        <div className="px-3 pb-2">
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Qidirish"
            aria-label={`${label}: qidirish`}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
          />
        </div>
        <ul>
          {noneLabel && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  close();
                }}
                aria-pressed={value === ''}
                className={cn('flex min-h-12 w-full items-center px-4 text-left text-[15px] font-medium hover:bg-subtle', value === '' && 'bg-emerald-50 dark:bg-emerald-500/10')}
              >
                {noneLabel}
              </button>
            </li>
          )}
          {filtered.map((o, i) => {
            const header = o.group && o.group !== filtered[i - 1]?.group ? o.group : null;
            return (
              <li key={o.id}>
                {header && <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{header}</p>}
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    close();
                  }}
                  aria-pressed={value === o.id}
                  className={cn('flex min-h-12 w-full items-center justify-between gap-3 px-4 py-1.5 text-left hover:bg-subtle', value === o.id && 'bg-emerald-50 dark:bg-emerald-500/10')}
                >
                  <span className="min-w-0 truncate text-[15px] font-medium text-fg">{o.name}</span>
                  {o.sub && <span className="shrink-0 text-xs">{o.sub}</span>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-muted">Topilmadi.</li>}
        </ul>
        {newLabels.length > 0 && (
          <div className="border-t border-line p-2">
            {newLabels.map((n) => (
              <button
                key={n.label}
                type="button"
                onClick={() => {
                  close();
                  n.onClick();
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-[15px] font-medium text-emerald-700 hover:bg-subtle dark:text-emerald-400"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                {n.label}
              </button>
            ))}
          </div>
        )}
      </MenuSheet>
    </div>
  );
}
