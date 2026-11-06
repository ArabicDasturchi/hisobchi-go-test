'use client';
import { PackagePlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useBooks } from '@/components/useBooks';
import { OutflowTab, ReceiptsTab, StockTab } from '@/components/warehouse/WarehouseTabs';
import { Card, ErrorState, LinkButton, PageHeader, Segmented } from '@/components/ui/primitives';
import { parseTab, type WarehouseTab } from '@/lib/warehouseView';
import { uz } from '@/i18n/uz';

/**
 * Ombor: Qoldiq · Kirim · Chiqim. Kirim va Chiqim alohida daftar emas, ombor ichidagi funksiyalar
 * (eski `/books/in` va `/books/out` shu yerga yo'naltiriladi: `?tab=in` / `?tab=out`).
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

  return (
    <>
      <PageHeader
        title={uz.nav.warehouse}
        description="Qoldiq = kirim − savdo ± tuzatish."
        actions={
          <LinkButton href="/purchases/new" icon={<PackagePlus className="h-4 w-4" />}>
            Kirim yozish
          </LinkButton>
        }
      />
      <div className="mb-3">
        <Segmented<WarehouseTab>
          ariaLabel="Ombor ko'rinishi"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stock', label: 'Qoldiq' },
            { value: 'in', label: 'Kirim' },
            { value: 'out', label: 'Chiqim' },
          ]}
        />
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
