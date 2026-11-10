'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BaseTabs } from '@/components/base/BaseTabs';
import { useBooks } from '@/components/useBooks';
import { StockTab } from '@/components/warehouse/StockTab';
import { OutflowTab, ReceiptsTab } from '@/components/warehouse/WarehouseTabs';
import { Card, cn, ErrorState, PageHeader } from '@/components/ui/primitives';
import { parseTab, type WarehouseTab } from '@/lib/warehouseView';
import { uz } from '@/i18n/uz';

/**
 * Ombor: Qoldiq · Kirim · Chiqim (P-10, P-10c, P-10d). Kirim va Chiqim jurnaldan o'qiydi (faqat ko'rish);
 * kirim yozish panelda (`/dashboard?amal=kirim`). Eski `/books/in` va `/books/out` shu yerga yo'naltiriladi.
 */
function Warehouse() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const { data, error, loading, reload } = useBooks();

  const setTab = (t: WarehouseTab) => router.replace(t === 'stock' ? '/warehouse' : `/warehouse?tab=${t}`, { scroll: false });

  if (error && !data) {
    return (
      <>
        <PageHeader title={uz.nav.warehouse} />
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }

  const tabs: { value: WarehouseTab; label: string }[] = [
    { value: 'stock', label: 'Qoldiq' },
    { value: 'in', label: 'Kirim' },
    { value: 'out', label: 'Chiqim' },
  ];

  return (
    <>
      <BaseTabs current="warehouse" />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{uz.nav.warehouse}</h1>
          <p className="text-sm text-muted">Qoldiq = kirim − savdo ± tuzatish</p>
        </div>
        <div role="radiogroup" aria-label="Ombor ko'rinishi" className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn('min-h-11 rounded-full px-5 text-sm font-medium', tab === t.value ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-muted hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'stock' && <StockTab books={data} loading={loading} reload={reload} />}
      {tab === 'in' && <ReceiptsTab books={data} loading={loading} />}
      {tab === 'out' && <OutflowTab books={data} />}
    </>
  );
}

export default function WarehousePage() {
  return (
    <Suspense>
      <Warehouse />
    </Suspense>
  );
}
