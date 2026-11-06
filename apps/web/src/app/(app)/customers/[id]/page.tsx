'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CustomerLedger } from '@/components/ledger/CustomerLedger';
import { DataGate } from '@/components/shared';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';

/** Mijoz varag'i: daftar (jadval + tez yozuv). Hisob core `ledgerRows` da, SQL `partner_statement` bilan tekshiriladi */
export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DataGate>
      {(data) => {
        const customer = data.customers.find((c) => c.id === id);
        if (!customer) {
          return (
            <Card>
              <EmptyState title="Mijoz topilmadi" description="U o'chirilgan yoki boshqa do'konga tegishli." action={<LinkButton href="/customers" variant="outline" size="sm">Mijozlar ro&apos;yxati</LinkButton>} />
            </Card>
          );
        }
        return (
          <>
            <Link href="/customers" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
              <ArrowLeft className="h-4 w-4" /> Mijozlar
            </Link>
            <CustomerLedger customer={customer} data={data} />
          </>
        );
      }}
    </DataGate>
  );
}
