'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BarChart } from '@/components/BarChart';
import { StageBadge, StaleBadge } from '@/components/badges';
import { Card, ErrorBox, LoadingBlock, PageTitle, StatCard } from '@/components/ui';
import { formatCount, formatDate, formatDateTime, shortDay, timeAgo } from '@/lib/format';
import { describeSteps, stoppedAt, type StepState } from '@/lib/shopSteps';
import { recommendation } from '@/lib/shopsView';
import { STAGE_LABELS } from '@/lib/stage';
import { useAsync } from '@/lib/useApi';

const STATE_MARK: Record<StepState, { mark: string; cls: string; note: string }> = {
  done: { mark: '✓', cls: 'bg-ok-bg text-ok-fg', note: '' },
  skipped: { mark: '–', cls: 'bg-subtle text-muted', note: "o'tkazib yuborilgan" },
  next: { mark: '!', cls: 'bg-warn-bg text-warn-fg', note: "shu yerda to'xtagan" },
  todo: { mark: '·', cls: 'bg-subtle text-muted', note: 'hali kelmagan' },
};

export default function ShopDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, error, loading, reload } = useAsync((api) => api.shopDetail(id), [id]);

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/shops" className="text-muted underline-offset-2 hover:underline">
          ← Do&apos;konlar
        </Link>
      </p>
      {loading && !data && <LoadingBlock rows={3} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !error && (
        <div className="space-y-4 sm:space-y-6">
          <PageTitle sub={[data.owner_name, data.owner_email].filter(Boolean).join(' · ') || undefined}>{data.name}</PageTitle>

          <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm text-muted sm:-mt-4">
            <StageBadge stage={data.stage} />
            <StaleBadge stale={data.is_stale} />
            <span>Ochilgan {formatDate(data.created_at)}</span>
            <span>· Oxirgi faollik: {timeAgo(data.last_activity_at)}</span>
          </div>

          <Card title={`Bosqich: ${data.stage}/6 · ${STAGE_LABELS[data.stage]}`}>
            <ol className="flex gap-1.5" aria-label={`6 qadamdan ${data.stage}-qadamga yetgan`}>
              {([1, 2, 3, 4, 5, 6] as const).map((n) => (
                <li key={n} className={`h-2.5 flex-1 rounded-full ${n <= data.stage ? 'bg-accent' : 'bg-subtle'}`} title={`${n}. ${STAGE_LABELS[n]}`} />
              ))}
            </ol>
            {stoppedAt(data.stage) && <p className="mt-3 text-sm font-semibold text-warn-fg">{stoppedAt(data.stage)}</p>}
            <p className="mt-1 text-sm">
              <span className="font-semibold">Tavsiya: </span>
              {recommendation(data.stage, data.is_stale)}
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
            <StatCard label="Tovar" value={formatCount(data.counts.products)} />
            <StatCard label="Mijoz" value={formatCount(data.counts.customers)} />
            <StatCard label="Ta'minotchi" value={formatCount(data.counts.suppliers)} />
            <StatCard label="Savdo" value={formatCount(data.counts.sales)} hint="Bekor qilinganlarsiz" />
            <StatCard label="Kirim" value={formatCount(data.counts.purchases)} />
            <StatCard label="7 kunda savdo" value={formatCount(data.counts.sales_7d)} />
          </div>

          {data.activity && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4" data-testid="activity">
              <StatCard label="Mijoz to'lovlari" value={formatCount(data.activity.payments)} hint="Bekor qilinganlarsiz" />
              <StatCard label="Ta'minotchiga to'lov" value={formatCount(data.activity.supplier_payments)} hint="Bekor qilinganlarsiz" />
              <StatCard label="Qoralama: kutayotgan" value={formatCount(data.activity.drafts_pending)} hint="Agent yozgan, tasdiqlanmagan" />
              <StatCard label="Qoralama: tasdiqlangan" value={formatCount(data.activity.drafts_accepted)} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
            <Card title="Savdolar soni (14 kun)">
              <BarChart color="var(--series-1)" unit="savdo" points={data.daily_sales.map((d) => ({ label: shortDay(d.day), value: d.sales }))} />
              <p className="mt-2 text-xs text-muted">Summa ko&apos;rsatilmaydi (maxfiy).</p>
            </Card>
            <Card title="Qadamlar">
              <ol className="space-y-3">
                {describeSteps(data).map((s) => {
                  const m = STATE_MARK[s.state];
                  return (
                    <li key={s.key} className="flex items-start gap-3">
                      <span aria-hidden className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.cls}`}>
                        {m.mark}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{s.label}</p>
                        <p className="text-xs text-muted">{s.at ? formatDateTime(s.at) : m.note}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
