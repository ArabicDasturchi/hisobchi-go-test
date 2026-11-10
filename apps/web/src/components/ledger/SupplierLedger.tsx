'use client';
/** Ta'minotchi daftari: LedgerSheet ni kirim/to'lov jurnali va 007/009 RPC'lari bilan bog'laydi (yangi hisob yo'q). */
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildSheet, supplierEntries, verifySheet, type SheetEntry } from '@/lib/data/partnerLedger';
import type { BooksData, Supplier } from '@/lib/data/books';
import { setSupplierActive } from '@/lib/data/purchases';
import { reversePurchase, voidSupplierPayment } from '@/lib/data/supplierPayments';
import { errorMessage } from '@/lib/errors';
import { formatQty } from '@/lib/money';
import { can } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/client';
import { SupplierFormModal } from '../forms/SupplierFormModal';
import { Money } from '../shared';
import { useShop } from '../ShopDataProvider';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { LedgerSheet } from './LedgerSheet';
import { useSqlBalance } from './useSqlBalance';

const newId = () => crypto.randomUUID();

export function SupplierLedger({ supplier, books, loadedAt, reload }: { supplier: Supplier; books: BooksData; loadedAt: number; reload: () => Promise<void> }) {
  const toast = useToast();
  const { shopId, membership } = useShop();
  const [editing, setEditing] = useState(false);
  const canWrite = can(membership.role, 'ledger.write');

  const entries = useMemo(() => supplierEntries(supplier.id, books), [supplier.id, books]);
  const rows = useMemo(() => buildSheet(entries), [entries]);
  const sql = useSqlBalance('supplier', shopId, supplier.id, String(loadedAt));
  const verification = useMemo(() => (sql === undefined ? ('checking' as const) : verifySheet(rows, entries, sql)), [rows, entries, sql]);
  async function onCancel(entry: SheetEntry, reason: string) {
    const sb = getSupabase();
    if (entry.ref === 'supplier_payment') await voidSupplierPayment(sb, shopId, entry.id, reason);
    else await reversePurchase(sb, shopId, entry.id, newId(), reason);
    await reload();
  }

  async function toggleActive() {
    try {
      await setSupplierActive(getSupabase(), shopId, supplier.id, !supplier.is_active);
      toast.success(supplier.is_active ? `«${supplier.name}» arxivlandi.` : `«${supplier.name}» qaytarildi.`);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const lines = (docId: string) => books.lines.filter((l) => l.document_id === docId);

  return (
    <>
      <LedgerSheet
        kind="supplier"
        partner={supplier}
        shopName={membership.shop.name}
        rows={rows}
        verification={verification}
        canWrite={canWrite}
        writeHref={`/dashboard?amal=daftar&kimga=${supplier.id}`}
        onCancel={onCancel}
        renderDetail={(e) =>
          e.ref === 'purchase' && !e.cancelled ? (
            <ul className="space-y-0.5">
              {lines(e.id).map((l) => (
                <li key={`${l.document_id}-${l.line_index}`} className="flex justify-between gap-3">
                  <span className="truncate">
                    {l.product_name} — {formatQty(l.qty_milli)} {l.unit} × <Money value={l.unit_cost} />
                  </span>
                  <Money value={l.line_total} />
                </li>
              ))}
            </ul>
          ) : null
        }
        headerActions={
          can(membership.role, 'partner.manage') && (
            <>
              <Button variant="outline" size="icon" onClick={() => setEditing(true)} aria-label="Tahrirlash" title="Tahrirlash">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => void toggleActive()} aria-label={supplier.is_active ? 'Arxivlash' : 'Qaytarish'} title={supplier.is_active ? 'Arxivlash' : 'Qaytarish'}>
                {supplier.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
              </Button>
            </>
          )
        }
      />
      <SupplierFormModal open={editing} onClose={() => setEditing(false)} supplier={supplier} onSaved={() => void reload()} />
    </>
  );
}
