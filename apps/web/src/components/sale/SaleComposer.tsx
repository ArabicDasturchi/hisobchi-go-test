'use client';
/**
 * Yumaloq kiritish konteyneri (Claude/ChatGPT uslubi): tepada ko'p qatorli matn, pastda `+`, "Kimga", "Amal" va strelka.
 * Takliflar paneli (`children`) matn maydoni ustida ochiladi. Hamma tugma ≥44px.
 */
import { ArrowUp, Check } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';

export interface SaleComposerHandle {
  focus: () => void;
}

export interface SaleComposerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Panel ochiqmi: ↓ fokusni panelga o'tkazadi, Enter qo'shadi */
  panelOpen: boolean;
  panelId?: string;
  onSubmit: () => void;
  onFocusPanel?: () => void;
  onEscape?: () => void;
  onFocus?: () => void;
  /** "+" menyusi va "Amal" chipi (slot) */
  plus: ReactNode;
  action: ReactNode;
  /** "Kimga" chipi (CustomerChip) */
  who: ReactNode;
  /** Yuborish tugmasi o'chiqmi (masalan, matn bo'sh) */
  sendDisabled?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'numeric';
  sendLabel?: string;
  inputLabel?: string;
  /** To'lov/yozuv amallarida strelka o'rniga galochka */
  confirmIcon?: boolean;
  /** Matn maydoni ustidagi panel */
  children?: ReactNode;
}

export const SaleComposer = forwardRef<SaleComposerHandle, SaleComposerProps>(function SaleComposer(
  { value, onChange, placeholder, panelOpen, panelId, onSubmit, onFocusPanel, onEscape, onFocus, plus, action, who, sendDisabled, disabled, inputMode, sendLabel, inputLabel, confirmIcon, children },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  // Matn o'sishiga qarab balandlik (max 6 qator)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'ArrowDown' && panelOpen) {
      e.preventDefault();
      onFocusPanel?.();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      onEscape?.();
    }
  }

  return (
    <div>
      {children}
      <div className="rounded-[1.75rem] border border-line bg-surface p-3 shadow-sm transition-colors focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <textarea
          ref={area}
          rows={1}
          aria-label={inputLabel ?? uz.composer.productInput}
          aria-controls={panelOpen ? panelId : undefined}
          aria-expanded={panelOpen}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          enterKeyHint="send"
          inputMode={inputMode}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? uz.composer.placeholder}
          maxLength={120}
          onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          style={{ outline: 'none' }}
          className="block max-h-36 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-base text-fg outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="mt-1 flex items-center gap-2">
          {plus}
          {action}
          {who}
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || sendDisabled}
            aria-label={sendLabel ?? uz.composer.add}
            className={cn(
              'ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950',
            )}
          >
            {confirmIcon ? <Check className="h-5 w-5" aria-hidden /> : <ArrowUp className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
});
