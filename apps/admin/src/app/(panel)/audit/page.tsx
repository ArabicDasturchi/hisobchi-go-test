'use client';
import { Card, EmptyState, ErrorBox, LoadingBlock, PageTitle } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { actionLabel } from '@/lib/audit';
import { useAsync } from '@/lib/useApi';

export default function AuditPage() {
  const { data, error, loading, reload } = useAsync((api) => api.myAudit(100), []);
  return (
    <>
      <PageTitle sub="Faqat sizning o'z harakatlaringiz (oxirgi 100). Qidiruv matni va shaxsiy ma'lumot yozilmaydi.">Jurnal</PageTitle>
      {loading && !data && <LoadingBlock rows={4} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !error && data.length === 0 && <EmptyState title="Hali harakat yo'q" />}
      {data && !error && data.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {data.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{actionLabel(a)}</span>
                <span className="text-xs text-muted tabular-nums">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
