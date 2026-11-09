'use client';
import { Money } from '@/components/shared';
import { Button } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import type { SaleSummary } from '@/lib/lineStatus';

export interface SaleSummaryBarProps {
  summary: SaleSummary;
  onConfirm: () => void;
  /** Tarmoq xatosidan keyingi qayta urinish yozuvi */
  retry?: boolean;
  busy?: boolean;
  /** Qoralama/qulf holatida tasdiqlash yopiladi */
  frozen?: boolean;
}

/** "N qator tayyor, M tasi to'ldirilmagan" + Jami (faqat to'liq qatorlar, buildSalePlan) + Tasdiqlash */
export function SaleSummaryBar({ summary, onConfirm, retry, busy, frozen }: SaleSummaryBarProps) {
  const { ready, incomplete, total, canConfirm, blockedReason } = summary;
  const status =
    ready === 0 && incomplete === 0 ? "Qator yo'q" : incomplete > 0 ? `${ready} qator tayyor, ${incomplete} tasi to'ldirilmagan` : `${ready} qator tayyor`;
  const disabled = !canConfirm || frozen;
  return (
    <div data-testid="summary" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={incomplete > 0 ? 'text-[13px] font-medium text-amber-800 dark:text-amber-300' : 'text-[13px] text-muted'}>{status}</p>
        <p className="truncate text-xl font-semibold tracking-tight text-fg">
          Jami <Money value={total} />
        </p>
        {disabled && blockedReason && !frozen && (
          <p id="confirm-blocked" className="text-xs text-muted">
            {blockedReason}
          </p>
        )}
      </div>
      <Button
        size="lg"
        className="h-12 min-w-32 shrink-0 rounded-xl px-5 text-[15px]"
        disabled={disabled}
        loading={busy}
        onClick={onConfirm}
        aria-describedby={disabled && blockedReason ? 'confirm-blocked' : undefined}
      >
        {retry ? uz.composer.retry : uz.composer.confirm}
      </Button>
    </div>
  );
}
