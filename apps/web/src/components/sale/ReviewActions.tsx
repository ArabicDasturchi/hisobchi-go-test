'use client';
/**
 * F1: joylangan qatorning holat belgisi (aniq / noaniq / xato) va hal qilish tugmalari.
 * Savdo (`SaleLineCard`) va kirim (`PurchaseView`) qatorlarida bir xil. Hamma tugma ≥44px, rangga yolg'iz tayanilmaydi
 * (belgi matni ham bor).
 */
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import type { Product } from '@/lib/data/types';
import { formatSom } from '@/lib/money';
import type { LineReview, PasteStatus } from '@/lib/pasteList';

const BADGE: Record<PasteStatus, { label: string; cls: string }> = {
  aniq: { label: 'Aniq', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  noaniq: { label: 'Noaniq', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200' },
  xato: { label: 'Xato', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' },
};

export function PasteBadge({ status }: { status: PasteStatus }) {
  const b = BADGE[status];
  return (
    <span data-testid="paste-badge" className={cn('mr-2 inline-flex rounded-md px-1.5 py-0.5 align-middle text-[11px] font-semibold', b.cls)}>
      {b.label}
    </span>
  );
}

const chip =
  'min-h-11 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40';

export interface ReviewActionsProps {
  review: LineReview;
  raw: string;
  lineNo: number;
  candidates: readonly Product[];
  disabled?: boolean;
  onChoose?: (p: Product) => void;
  onKeepNew?: () => void;
  onAccept?: () => void;
}

export function ReviewActions({ review, raw, lineNo, candidates, disabled, onChoose, onKeepNew, onAccept }: ReviewActionsProps) {
  return (
    <div className="mt-2 space-y-2" data-testid="review-actions" data-review={review.kind}>
      <p className="text-xs text-muted">
        {lineNo}-qator: <span className="font-mono text-fg">«{raw}»</span>
      </p>
      {review.kind === 'choose' && candidates.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Katalogdan tanlang">
          {candidates.map((p) => (
            <button key={p.id} type="button" disabled={disabled} onClick={() => onChoose?.(p)} className={cn(chip, 'border-line bg-surface text-fg hover:bg-subtle')}>
              {p.name} · {uz.units[p.unit]}
              {p.last_price !== null && <span className="text-muted"> · {formatSom(p.last_price).replace(/ /g, ' ')}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(review.kind === 'new' || (review.kind === 'choose' && review.allowNew)) && (
          <button type="button" disabled={disabled} onClick={onKeepNew} className={cn(chip, 'inline-flex items-center gap-1 border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200')}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Yangi tovar sifatida qo&apos;shish
          </button>
        )}
        {review.kind === 'check' && (
          <button type="button" disabled={disabled} onClick={onAccept} className={cn(chip, 'inline-flex items-center gap-1 border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200')}>
            <Check className="h-4 w-4" aria-hidden />
            To&apos;g&apos;ri
          </button>
        )}
      </div>
    </div>
  );
}
