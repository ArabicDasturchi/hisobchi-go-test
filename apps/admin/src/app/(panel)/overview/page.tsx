'use client';
import { BarChart } from '@/components/BarChart';
import { Card, EmptyState, ErrorBox, LoadingBlock, PageTitle, StatCard } from '@/components/ui';
import { formatCount, shortDay } from '@/lib/format';
import { OVERVIEW_LINKS } from '@/lib/links';
import { useAsync } from '@/lib/useApi';

export default function OverviewPage() {
  const { data, error, loading, reload } = useAsync((api) => api.overview(14), []);

  return (
    <>
      <PageTitle sub="Platforma bo'yicha umumiy sonlar. Summalar va mijoz ma'lumotlari ko'rsatilmaydi.">Umumiy ko&apos;rinish</PageTitle>
      {loading && !data && <LoadingBlock rows={3} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !error && data.shops === 0 && <EmptyState title="Hali do'kon yo'q" hint="Birinchi do'kon yaratilgach, sonlar shu yerda paydo bo'ladi." />}
      {data && !error && data.shops > 0 && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
            <StatCard href={OVERVIEW_LINKS.shops} label="Do'konlar" value={formatCount(data.shops)} hint={`Bugun +${data.new_shops_today} · 7 kunda +${data.new_shops_7d} · 30 kunda +${data.new_shops_30d}`} />
            <StatCard href={OVERVIEW_LINKS.users} label="Foydalanuvchilar" value={formatCount(data.users)} hint="Ro'yxatdan o'tganlar" />
            <StatCard href={OVERVIEW_LINKS.salesToday} label="Bugungi savdolar" value={formatCount(data.sales_today)} hint="Bekor qilinganlarsiz" />
            <StatCard href={OVERVIEW_LINKS.active7d} label="7 kunda faol do'konlar" value={formatCount(data.active_shops_7d)} hint={`${formatCount(data.shops)} tadan`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
            <Card title="Savdolar soni (14 kun)">
              <BarChart color="var(--series-1)" unit="savdo" points={data.daily.map((d) => ({ label: shortDay(d.day), value: d.sales }))} />
            </Card>
            <Card title="Yangi do'konlar (14 kun)">
              <BarChart color="var(--series-2)" unit="do'kon" points={data.daily.map((d) => ({ label: shortDay(d.day), value: d.new_shops }))} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
