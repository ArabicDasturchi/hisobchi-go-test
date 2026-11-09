'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, EmptyState, ErrorBox, LoadingBlock, PageTitle } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { FUNNEL_LABELS, STAGE_LABELS } from '@/lib/stage';
import type { Stage } from '@/lib/types';
import { useAsync } from '@/lib/useApi';

export default function FunnelPage() {
  const { data, error, loading, reload } = useAsync((api) => api.funnel(), []);
  const [selected, setSelected] = useState<number | null>(null);

  const max = data ? Math.max(1, ...data.steps.map((s) => s.count)) : 1;
  const stuck = data && selected ? (data.stuck[String(selected)] ?? []) : [];

  return (
    <>
      <PageTitle sub="Do'konlar qaysi qadamgacha yetib kelgan. Qadamni bosing: shu yerda to'xtagan do'konlar ko'rinadi (kimga yordam kerak).">Voronka</PageTitle>
      {loading && !data && <LoadingBlock rows={4} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !error && data.users === 0 && <EmptyState title="Hali foydalanuvchi yo'q" />}
      {data && !error && data.users > 0 && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <ul className="space-y-2">
              {data.steps.map((s) => {
                const clickable = s.stage >= 1 && s.stage <= 5;
                const active = selected === s.stage;
                const width = Math.max(2, Math.round((100 * s.count) / max));
                const body = (
                  <>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{FUNNEL_LABELS[s.key]}</span>
                      <span className="tabular-nums">
                        <b>{formatCount(s.count)}</b> <span className="text-muted">· {s.pct_of_registered}%</span>
                      </span>
                    </span>
                    <span className="mt-1.5 block h-3 overflow-hidden rounded-full bg-subtle" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${width}%`, background: 'var(--series-1)' }} />
                    </span>
                    {s.stage > 0 && <span className="mt-1 block text-xs text-muted">oldingi qadamdan {s.pct_of_prev}%</span>}
                  </>
                );
                return (
                  <li key={s.key}>
                    {clickable ? (
                      <button
                        type="button"
                        data-stage={s.stage}
                        aria-pressed={active}
                        onClick={() => setSelected(active ? null : s.stage)}
                        className={`block min-h-11 w-full rounded-xl border p-3 text-left transition ${active ? 'border-accent bg-subtle' : 'border-transparent hover:bg-subtle'}`}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="block w-full rounded-xl border border-transparent p-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Do&apos;kon ochmagan foydalanuvchilar: <b>{formatCount(data.users_without_shop)}</b> (ro&apos;yxat ko&apos;rsatilmaydi).
            </p>
          </Card>

          {selected !== null && (
            <Card title={`«${STAGE_LABELS[selected as Stage]}» da to'xtagan do'konlar (${stuck.length})`}>
              {stuck.length === 0 ? (
                <p className="text-sm text-muted">Bu qadamda to&apos;xtagan do&apos;kon yo&apos;q.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {stuck.map((shop) => (
                    <li key={shop.id}>
                      <Link href={`/shops/${shop.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm font-medium hover:underline">
                        <span>{shop.name}</span>
                        <span aria-hidden className="text-muted">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
