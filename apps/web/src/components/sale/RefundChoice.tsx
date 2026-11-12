'use client';
/**
 * Savdoni bekor qilishda shu savdo bilan kelgan to'lovlar (W1). Standart: to'lov ham bekor qilinadi (pul mijozga
 * qaytarilgan yoki «Qayta yozish» bilan yangidan yoziladi) — aks holda kassa ikki marta sanaladi.
 * Belgi olinsa: to'lov qoladi va mijoz hisobida ortiqcha to'lov (kredit) ko'rinadi.
 */
import { Money } from '@/components/shared';

export function RefundChoice({ total, checked, onChange, disabled }: { total: bigint; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  if (total <= 0n) return null;
  return (
    <div className="space-y-1 rounded-lg border border-line p-3 text-sm" data-testid="refund-choice">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>
          Savdo bilan olingan to&apos;lovni ham bekor qilish (<Money value={total} className="font-semibold" />). Pul mijozga qaytarildi yoki
          savdo qayta yoziladi.
        </span>
      </label>
      {!checked && (
        <p className="text-amber-700 dark:text-amber-400" data-testid="refund-kept">
          To&apos;lov qoladi: mijoz hisobida <Money value={total} /> ortiqcha to&apos;lov (kredit) bo&apos;ladi va kassada qoladi.
        </p>
      )}
    </div>
  );
}
