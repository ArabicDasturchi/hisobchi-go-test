'use client';
/**
 * F3: o'zgarishlar tarixi — kim, qachon, nima tuzatdi yoki bekor qildi (audit_log, migratsiya 017).
 * Faqat o'qiladi; yozuvni server trigger'lari qo'shadi. Telefon va izoh qiymati ko'rsatilmaydi (jurnalda ham yo'q).
 */
import { History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { describeAudit, listAudit, type AuditRow } from '@/lib/auditView';
import { errorMessage } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase/client';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; rows: AuditRow[] };

export default function HistoryPage() {
  const { shopId, membership } = useShop();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    listAudit(getSupabase(), shopId).then(
      (rows) => alive && setState({ status: 'ok', rows }),
      (e: unknown) => alive && setState({ status: 'error', message: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [shopId, attempt]);

  const who = (uid: string | null) => (uid && uid === membership.user_id ? 'Siz' : uid ? 'Do\'kon a\'zosi' : 'Tizim');

  return (
    <>
      <PageHeader title="O'zgarishlar tarixi" description="Tuzatishlar va bekor qilishlar: kim, qachon, nima. Yozuvlar o'chirilmaydi va o'zgartirilmaydi." />
      {state.status === 'loading' && <Skeleton className="h-40 rounded-xl" />}
      {state.status === 'error' && (
        <Card>
          <ErrorState message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
        </Card>
      )}
      {state.status === 'ok' && state.rows.length === 0 && (
        <Card>
          <EmptyState icon={<History className="h-6 w-6" />} title="Hali yozuv yo'q" description="Tovar, mijoz yoki ta'minotchi tuzatilsa, savdo yoki to'lov bekor qilinsa shu yerda ko'rinadi (serverda 017 yangilanishi kerak)." />
        </Card>
      )}
      {state.status === 'ok' && state.rows.length > 0 && (
        <Card className="divide-y divide-line">
          {state.rows.map((r) => {
            const d = describeAudit(r);
            return (
              <div key={r.id} className="px-4 py-3" data-testid="audit-row">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-fg">{d.title}</p>
                  <p className="text-xs text-muted">
                    {who(r.user_id)} · {new Date(r.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {d.detail && <p className="mt-0.5 text-sm text-muted">{d.detail}</p>}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
