'use client';
/**
 * Menyu/varaq: telefonda pastdan chiquvchi varaq, kompyuterda kiritish oynasi ustida ochiladigan menyu.
 * Chaqiruvchi `relative` konteyner ichida joylashtiradi. Esc va fonni bosish yopadi.
 */
import { useEffect, useId, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';

export function MenuSheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/50 md:bg-transparent" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-labelledby={titleId}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-2xl border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl',
          'md:absolute md:inset-x-auto md:bottom-full md:left-0 md:mb-2 md:max-h-[28rem] md:w-80 md:rounded-2xl md:pb-0',
          className,
        )}
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <p id={titleId} className="px-4 pb-1 pt-3 text-sm font-semibold text-fg">
          {title}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>
      </div>
    </>
  );
}

/** Menyu bandi: chapda nom, o'ngda izoh; ≥44px */
export function MenuItem({ label, hint, selected, disabled, badge, onClick }: { label: string; hint?: string; selected?: boolean; disabled?: boolean; badge?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(
        'flex min-h-12 w-full items-center justify-between gap-3 px-4 py-1.5 text-left text-[15px] transition-colors',
        selected ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'text-fg hover:bg-subtle',
        disabled && 'cursor-not-allowed text-muted opacity-70 hover:bg-transparent',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {badge ? (
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">{badge}</span>
      ) : hint ? (
        <span className="shrink-0 text-xs font-normal text-muted">{hint}</span>
      ) : null}
    </button>
  );
}
