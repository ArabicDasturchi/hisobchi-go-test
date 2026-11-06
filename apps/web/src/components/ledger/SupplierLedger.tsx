'use client';
/** Ta'minotchi daftari: LedgerSheet ni kirim/to'lov jurnali va 007/009 RPC'lari bilan bog'laydi (yangi hisob yo'q). */
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { buildSheet, supplierEntries, verifySheet, type SheetEntry } from '@/lib/data/partnerLedger';
import type { BooksData, Supplier } from '@/lib/data/books';
import { setSupplierActive } from '@/lib/data/purchases';
import { recordSupplierPayment, reversePurchase, voidSupplierPayment } from '@/lib/data/supplierPayments';
import { errorMessage } from '@/lib/errors';
import { formatQty } from '@/lib/money';
import { can } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/client';
import { SupplierFormModal } from '../forms/SupplierFormModal';
import { SupplierPaymentModal, paymentTimestamp } from '../forms/SupplierPaymentModal';
import { Money } from '../shared';
import { useShop } from '../ShopDataProvider';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { tashkentDate, ledgerBalance } from '@hisobchi/core';
import { LedgerSheet, type QuickSaveInput } from './LedgerSheet';
import { useSqlBalance } from './useSqlBalance';

const newId = () => crypto.randomUUID();

export function SupplierLedger({ supplier, books, loadedAt, reload }: { supplier: Supplier; books: BooksData; loadedAt: number; reload: () => Promise<void> }) {
  const toast = useToast();
  const { shopId, membership } = useShop();
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const canWrite = can(membership.role, 'ledger.write');

  const entries = useMemo(() => supplierEntries(supplier.id, books), [supplier.id, books]);
  const rows = useMemo(() => buildSheet(entries), [entries]);
  const balance = ledgerBalance(rows);
  const sql = useSqlBalance('supplier', shopId, supplier.id, String(loadedAt));
  const verification = useMemo(() => (sql === undefined ? ('checking' as const) : verifySheet(rows, entries, sql)), [rows, entries, sql]);
  const attempt = useRef<{ sig: string; payId: string; op: string } | null>(null);

  async function onQuickSave({ date, paid }: QuickSaveInput) {
    // Ta'minotchi tezkor qatorida faqat to'lov (kirim tovar tanlashni talab qiladi)
    if (paid <= 0n) throw new Error('«Berildi» summasini kiriting yoki «Tovar tanlash» orqali kirim yozing.');
    const sig = `${date}:${paid}`;
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, payId: newId(), op: newId() };
    const a = attempt.current;
    try {
      await recordSupplierPayment(getSupabase(), { shopId, paymentId: a.payId, clientOpId: a.op, supplierId: supplier.id, amount: paid, method: 'naqd', note: null, createdAt: paymentTimestamp(date, tashkentDate(new Date())) });
      attempt.current = null;
      await reload();
    } catch (e) {
      throw e instanceof Error ? e : new Error(errorMessage(e));
    }
  }

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
        goodsHref={`/purchases/new?supplier=${supplier.id}`}
        onPay={() => setPaying(true)}
        onQuickSave={onQuickSave}
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
      <SupplierPaymentModal open={paying} onClose={() => setPaying(false)} supplierId={supplier.id} supplierName={supplier.name} debt={balance} onSaved={reload} />
    </>
  );
}
