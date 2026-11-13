'use client';
/**
 * Kirim (ta'minotchidan tovar): qatorlar (tovar, birlik, soni, tan narx 1 birlik uchun, jami), Jami kirim, Berilgan summa,
 * Eski qarz → Yangi qarz. Hisob: `lineTotal` va core `settle` (UI qo'shmaydi); server `post_purchase` qayta hisoblaydi.
 */
import { settle } from '@hisobchi/core';
import { AlertTriangle, X } from 'lucide-react';
import { Money } from '@/components/shared';
import { Alert, Button, cn } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import { formatMoneyInput, lineTotal, parseMoneyInput, parseQtyInput } from '@/lib/money';
import type { Product, Unit } from '@/lib/data/types';
import { currentReview, pasteStatus } from '@/lib/pasteList';
import { PasteBadge, ReviewActions } from '@/components/sale/ReviewActions';
import type { PurchaseDraftLine, PurchaseLineErrors } from '@/lib/purchaseForm';
import { unitChoices } from '@/lib/units';

const field =
  'h-11 rounded-xl border bg-surface px-3 text-right text-base font-semibold text-fg tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-60';

export interface PurchaseViewProps {
  supplierName: string | null;
  lines: PurchaseDraftLine[];
  onLine: (key: string, patch: Partial<PurchaseDraftLine>) => void;
  onRemove: (key: string) => void;
  balanceBefore: bigint;
  paid: string;
  onPaid: (v: string) => void;
  paidError: string | null;
  lineErrors: Map<string, PurchaseLineErrors>;
  isNew: (l: PurchaseDraftLine) => boolean;
  /** Qator birligi: katalog tovarida tovarniki (o'zgarmaydi), yangi nomda tanlangani (null: tanlanmagan) */
  unitOf: (l: PurchaseDraftLine) => Unit | null;
  /** Yangi tovar uchun birlik tanlovi (do'konda yoqilgan birliklar) */
  units: readonly Unit[];
  error: string | null;
  locked: boolean;
  busy: boolean;
  onConfirm: () => void;
  /** F1: joylangan qator savoliga javob */
  candidatesOf?: (l: PurchaseDraftLine) => readonly Product[];
  onChoose?: (key: string, p: Product) => void;
  onKeepNew?: (key: string) => void;
  onAccept?: (key: string) => void;
}

export function PurchaseView(p: PurchaseViewProps) {
  const filled = p.lines.filter((l) => l.productName.trim() || l.qty.trim() || l.unitCost.trim());
  const rows = filled.map((l) => {
    const q = parseQtyInput(l.qty);
    const c = parseMoneyInput(l.unitCost, { allowZero: true });
    const isNew = p.isNew(l);
    const unit = p.unitOf(l);
    return { l, isNew, unit, needUnit: isNew && !unit, review: currentReview(l), total: q.ok && c.ok ? lineTotal({ qtyMilli: q.value, unitPrice: c.value }) : null };
  });
  // Hal qilinmagan joylangan qator ham to'liq emas: kirim tasdiqlanmaydi
  const incomplete = rows.filter((r) => r.total === null || r.needUnit || r.review !== null).length;
  const goods = rows.reduce((s, r) => s + (r.total ?? 0n), 0n);
  const paidParsed = p.paid.trim() ? parseMoneyInput(p.paid, { allowZero: true }) : null;
  const paidNow = paidParsed?.ok ? paidParsed.value : 0n;
  const st = settle(p.balanceBefore, goods, paidNow);
  const paidTooMuch = paidNow > st.total;
  const canConfirm = !!p.supplierName && filled.length > 0 && incomplete === 0 && !paidTooMuch && !(paidParsed && !paidParsed.ok) && !p.busy;
  const blocked = !p.supplierName ? "Ta'minotchini tanlang" : filled.length === 0 ? "Avval tovar qo'shing" : incomplete > 0 ? `${incomplete} ta qator to'ldirilmagan` : paidTooMuch ? "Berilgan summa jamidan ko'p" : null;
  return (
    <section aria-label="Kirim" className="space-y-3" data-testid="purchase-view">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">Kirim</h2>
        <p className="text-sm text-muted">{p.supplierName ? `${p.supplierName} dan tovar kirimi` : "Ta'minotchini tanlang"}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Pastdagi oynaga tovar nomini yozing: qator qo&apos;shiladi. Tayyor ro&apos;yxatni ham joylash mumkin: «Chirmoq 10x13 000» (soni x narxi).</p>
      ) : (
        <ul className="space-y-2" aria-label="Kirim qatorlari">
          {rows.map(({ l, isNew, unit, needUnit, review, total }) => {
            const errs = p.lineErrors.get(l.key) ?? {};
            const yellow = total === null || needUnit || review !== null || !!errs.unit || !!errs.product;
            const paste = l.pasted ? pasteStatus(l, yellow) : null;
            const unitLabel = unit ? uz.units[unit] : 'birlik';
            return (
              <li key={l.key} data-testid="purchase-line" data-status={yellow ? 'yellow' : 'ok'} data-paste-status={paste ?? undefined} className={cn('rounded-2xl border p-3.5', yellow ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10' : 'border-line bg-surface')}>
                {/* Telefonda: nom birinchi qatorda to'liq, maydonlar ikkinchi qatorda cho'ziladi (375px da toshmaydi) */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <p className="truncate text-[15px] font-semibold text-fg">
                      {paste && <PasteBadge status={paste} />}
                      {l.productName.trim() || '—'}
                      {isNew && review?.kind !== 'choose' && <span className="ml-2 rounded-md bg-sky-100 px-1.5 py-0.5 align-middle text-[11px] font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">Yangi tovar</span>}
                    </p>
                    {yellow && (
                      <p className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-amber-800 dark:text-amber-300" role="status">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {review?.message ?? errs.product ?? errs.unit ?? (needUnit ? 'Yangi tovar birligini tanlang' : null) ?? errs.qty ?? errs.cost ?? 'Soni va tan narxini kiriting'}
                      </p>
                    )}
                  </div>
                  {isNew ? (
                    <select
                      aria-label={`Birlik: ${l.productName}`}
                      value={l.unit ?? ''}
                      disabled={p.locked}
                      onChange={(e) => p.onLine(l.key, { unit: (e.target.value || null) as Unit | null })}
                      className={cn(field, 'min-w-0 flex-1 text-center sm:w-24 sm:flex-none', needUnit || errs.unit ? 'border-amber-500 border-dashed' : 'border-line')}
                    >
                      <option value="">Birlik</option>
                      {unitChoices(p.units, l.unit).map((u) => (
                        <option key={u} value={u}>
                          {uz.units[u]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="w-14 shrink-0 text-center text-sm text-muted" data-testid="purchase-line-unit">
                      {unit ? uz.units[unit] : '—'}
                    </span>
                  )}
                  <input aria-label={`Miqdor: ${l.productName}`} inputMode="decimal" value={l.qty} disabled={p.locked} onChange={(e) => p.onLine(l.key, { qty: e.target.value })} placeholder="Soni" className={cn(field, 'min-w-0 flex-1 text-center sm:w-20 sm:flex-none', errs.qty ? 'border-amber-500' : 'border-line')} />
                  <input aria-label={`Tan narx (1 ${unitLabel}): ${l.productName}`} inputMode="numeric" value={l.unitCost} disabled={p.locked} onChange={(e) => p.onLine(l.key, { unitCost: formatMoneyInput(e.target.value) })} placeholder="Tan narx" className={cn(field, 'min-w-0 flex-[1.4] sm:w-28 sm:flex-none', errs.cost || !l.unitCost.trim() ? 'border-amber-500 border-dashed' : 'border-line')} />
                  <span className="hidden w-24 text-right text-base font-semibold tabular-nums text-fg sm:block">{total !== null ? <Money value={total} /> : '—'}</span>
                  <button type="button" disabled={p.locked} onClick={() => p.onRemove(l.key)} aria-label={`${uz.composer.removeLine}: ${l.productName}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-subtle hover:text-fg disabled:opacity-50">
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {review && l.pasted && (
                  <ReviewActions
                    review={review}
                    raw={l.pasted.raw}
                    lineNo={l.pasted.lineNo}
                    candidates={p.candidatesOf?.(l) ?? []}
                    disabled={p.locked}
                    onChoose={(prod) => p.onChoose?.(l.key, prod)}
                    onKeepNew={() => p.onKeepNew?.(l.key)}
                    onAccept={() => p.onAccept?.(l.key)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Jami kirim</span>
            <Money value={goods} className="font-semibold text-fg" />
          </div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted">Berilgan summa</span>
            <input aria-label="Berilgan summa" inputMode="numeric" value={p.paid} disabled={p.locked} onChange={(e) => p.onPaid(formatMoneyInput(e.target.value))} placeholder="0" className={cn(field, 'w-36', p.paidError || paidTooMuch ? 'border-rose-500' : 'border-line')} />
          </label>
          {(p.paidError || paidTooMuch) && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{p.paidError ?? "Berilgan summa jamidan ko'p"}</p>}
        </div>
        <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Eski qarz</span>
            <Money value={p.balanceBefore} className="font-semibold text-fg" />
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Yangi qarz (ostatka)</span>
            <Money value={st.balance} className="font-semibold text-amber-600 dark:text-amber-400" />
          </div>
        </div>
      </div>

      {p.error && (
        <Alert tone="red">
          {p.error}
          {p.locked && <span className="mt-1 block text-xs">Kirim saqlangan bo&apos;lishi mumkin. Qayta urinish uni ikki marta yozmaydi.</span>}
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="min-w-0 text-sm text-muted">{blocked ?? 'Tayyor: tasdiqlanmaguncha hech narsa saqlanmaydi'}</p>
        <Button size="lg" className="h-12 shrink-0 rounded-xl px-5" disabled={!canConfirm} loading={p.busy} onClick={p.onConfirm} data-testid="purchase-confirm">
          {p.locked ? uz.composer.retry : uz.composer.confirm}
        </Button>
      </div>
    </section>
  );
}
