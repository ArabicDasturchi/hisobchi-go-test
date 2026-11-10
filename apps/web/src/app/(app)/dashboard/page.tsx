'use client';
import { Suspense } from 'react';
import { PanelWorkspace } from '@/components/panel/PanelWorkspace';
import { DataGate } from '@/components/shared';

/**
 * Boshqaruv paneli: kiritish oynasi faqat shu sahifada. Hisobot kartochkalari (Savdo, Foyda, Kassa...) bu yerda yo'q:
 * ular «Hisobotlar» sahifasida (`/dashboard/report`).
 */
export default function DashboardPage() {
  return (
    <DataGate>
      {(data) => (
        <Suspense>
          <PanelWorkspace data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
