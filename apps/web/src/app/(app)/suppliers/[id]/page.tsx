'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SupplierLedger } from '@/components/ledger/SupplierLedger';
import { useBooks } from '@/components/useBooks';
import { Card, EmptyState, ErrorState, LinkButton, TableSkeleton } from '@/components/ui/primitives';

/** Ta'minotchi varag'i: daftar (jadval + tez yozuv). Hisob core `ledgerRows` da, SQL `partner_statement` bilan tekshiriladi */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload, loadedAt } = useBooks();

  if (error && !data) {
    return (
      <Card>
        <ErrorState message={error} onRetry={() => void reload()} />
      </Card>
    );
  }
  if (loading && !data) {
    return (
      <Card>
        <TableSkeleton />
      </Card>
    );
  }
  const supplier = data?.suppliers.find((s) => s.id === id);
  if (!data || !supplier) {
    return (
      <Card>
        <EmptyState title="Ta'minotchi topilmadi" description="U boshqa do'konga tegishli yoki mavjud emas." action={<LinkButton href="/suppliers" variant="outline" size="sm">Ta&apos;minotchilar ro&apos;yxati</LinkButton>} />
      </Card>
    );
  }
  return (
    <>
      <Link href="/suppliers" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Ta&apos;minotchilar
      </Link>
      <SupplierLedger supplier={supplier} books={data} loadedAt={loadedAt} reload={reload} />
    </>
  );
}
