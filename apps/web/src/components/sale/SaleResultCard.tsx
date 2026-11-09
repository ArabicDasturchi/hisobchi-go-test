'use client';
import { CheckCircle2, Plus, Receipt, Share2 } from 'lucide-react';
import { Money } from '@/components/shared';
import { Button, Card, cn, LinkButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { shortNumber } from '@/lib/dates';
import type { SaleDone } from './useSaleSubmit';

/** Natija kartasi (eski sahifadagidek): jami, to'langan, qarz, chek ulashish, yana savdo */
export function SaleResultCard({ done, onAgain }: { done: SaleDone; onAgain: () => void }) {
  const toast = useToast();

  async function share(text: string) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Chek', text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // foydalanuvchi bekor qildi
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Chek nusxalandi. Telegram yoki SMS ga qo‘yishingiz mumkin.');
    } catch {
      toast.error('Nusxalab bo‘lmadi. Brauzer ruxsatini tekshiring.');
    }
  }

  const debt = done.plan.debt;
  return (
    <Card data-testid="sale-result" className="mx-auto w-full max-w-xl">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-fg">Savdo saqlandi</h2>
          <p className="text-sm text-muted">
            Savdo {shortNumber(done.saleId)}
            {done.customerName ? ` · ${done.customerName}` : ' · mijozsiz (naqd)'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <p className="text-sm font-semibold">Yozildi. Hisob server tomonida qayta tekshirildi.</p>
        </div>
        <dl className="space-y-2.5 rounded-xl bg-subtle p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Jami</dt>
            <dd>
              <Money value={done.plan.total} className="text-2xl font-semibold text-fg" />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">To&apos;langan</dt>
            <dd>
              <Money value={done.plan.paidNow} className="font-semibold text-emerald-600 dark:text-emerald-400" />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Qarz</dt>
            <dd>
              <Money value={debt} className={cn('font-semibold', debt > 0n && 'text-rose-600 dark:text-rose-400')} />
            </dd>
          </div>
          {done.debtAfter !== null && done.debtAfter > 0n && (
            <div className="flex justify-between gap-3 border-t border-line pt-2">
              <dt className="text-muted">Mijozning umumiy qarzi</dt>
              <dd>
                <Money value={done.debtAfter} className="font-semibold text-fg" />
              </dd>
            </div>
          )}
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" className="h-11" onClick={onAgain} icon={<Plus className="h-4 w-4" />}>
            Yana savdo
          </Button>
          <Button size="lg" className="h-11" variant="outline" onClick={() => void share(done.receipt)} icon={<Share2 className="h-4 w-4" />}>
            Chek ulashish
          </Button>
        </div>
        <LinkButton href={`/sales/${done.saleId}`} variant="ghost" size="sm" className="h-11 w-full">
          <Receipt className="h-3.5 w-3.5" /> Savdo tafsilotini ochish
        </LinkButton>
      </div>
    </Card>
  );
}
