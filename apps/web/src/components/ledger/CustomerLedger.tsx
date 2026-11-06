'use client';
/** Mijoz daftari: LedgerSheet ni savdo/to'lov jurnali va mavjud RPC'lar bilan bog'laydi (yangi hisob yo'q). */
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteCustomer, getSaleDetail, postSale, recordPayment, reverseSale, voidPayment } from '@/lib/data/api';
import { buildSheet, customerEntries, verifySheet, type SheetEntry } from '@/lib/data/partnerLedger';
import type { Customer, SaleLine } from '@/lib/data/types';
import { errorMessage } from '@/lib/errors';
import { formatQty, lineTotal } from '@/lib/money';
import { can } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/client';
import { CustomerFormModal } from '../forms/CustomerFormModal';
import { PaymentModal } from '../forms/PaymentModal';
import { Money } from '../shared';
import { useShop, type ShopData } from '../ShopDataProvider';
import { Modal } from '../ui/Modal';
import { Alert, Button } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { LedgerSheet, type QuickSaveInput } from './LedgerSheet';
import { useSqlBalance } from './useSqlBalance';

/** Tez yozuvdagi tovar summasi shu nom bilan bitta savdo qatori bo'ladi (tovarga bog'lanmaydi, omborga tegmaydi) */
export const QUICK_SALE_LINE = 'Daftar yozuvi';

const newId = () => crypto.randomUUID();

/** Savdo tafsiloti: tovar qatorlari (ochilganda bir marta o'qiladi) */
function SaleLines({ id }: { id: string }) {
  const { shopId } = useShop();
  const [state, setState] = useState<{ lines: SaleLine[] } | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    getSaleDetail(getSupabase(), shopId, id).then(
      (d) => alive && setState({ lines: d?.lines ?? [] }),
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
    };
  }, [shopId, id]);
  if (state === 'loading') return <span>Tovarlar yuklanmoqda…</span>;
  if (state === 'error') return <span>Tovar qatorlarini o‘qib bo‘lmadi.</span>;
  if (state.lines.length === 0) return <span>Tovar qatori yo‘q.</span>;
  return (
    <ul className="space-y-0.5">
      {state.lines.map((l) => (
        <li key={l.id} className="flex justify-between gap-3">
          <span className="truncate">
            {l.product_name} — {formatQty(l.qty_milli)} {l.unit} × <Money value={l.unit_price} />
          </span>
          <Money value={l.line_total} />
        </li>
      ))}
    </ul>
  );
}

export function CustomerLedger({ customer, data }: { customer: Customer; data: ShopData }) {
  const router = useRouter();
  const toast = useToast();
  const { shopId, reload, membership, lastLoadedAt } = useShop();
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canWrite = can(membership.role, 'ledger.write');

  const entries = useMemo(() => customerEntries(customer.id, data.sales, data.payments), [customer.id, data.sales, data.payments]);
  const rows = useMemo(() => buildSheet(entries), [entries]);
  const sql = useSqlBalance('customer', shopId, customer.id, String(lastLoadedAt?.getTime() ?? 0));
  const verification = useMemo(() => (sql === undefined ? ('checking' as const) : verifySheet(rows, entries, sql)), [rows, entries, sql]);
  const hasHistory = entries.length > 0;

  // Takroriy bosish dublikat yaratmasin: bir xil summa uchun kalitlar saqlanadi, muvaffaqiyatdan keyin yangilanadi
  const attempt = useRef<{ sig: string; saleId: string; saleOp: string; payId: string; payOp: string } | null>(null);

  async function onQuickSave({ goods, paid }: QuickSaveInput) {
    const sig = `${goods}:${paid}`;
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, saleId: newId(), saleOp: newId(), payId: newId(), payOp: newId() };
    const a = attempt.current;
    const sb = getSupabase();
    try {
      if (goods > 0n) {
        // Jami core formulasi bilan; server qayta hisoblaydi (calc_mismatch bo'lsa saqlanmaydi)
        const total = lineTotal({ qtyMilli: 1000n, unitPrice: goods });
        await postSale(sb, { shopId, saleId: a.saleId, clientOpId: a.saleOp, customerId: customer.id, note: QUICK_SALE_LINE, lines: [{ product_name: QUICK_SALE_LINE, qty_milli: 1000n, unit: 'dona', unit_price: goods }], clientTotal: total });
      }
      if (paid > 0n) {
        try {
          await recordPayment(sb, { shopId, paymentId: a.payId, clientOpId: a.payOp, customerId: customer.id, amount: paid, method: 'naqd', note: null });
        } catch (e) {
          await reload();
          throw new Error(goods > 0n ? `Savdo saqlandi, lekin to‘lov saqlanmadi: ${errorMessage(e)} Qayta urinish savdoni takrorlamaydi.` : errorMessage(e));
        }
      }
      attempt.current = null;
      await reload();
    } catch (e) {
      throw e instanceof Error ? e : new Error(errorMessage(e));
    }
  }

  async function onCancel(entry: SheetEntry, reason: string) {
    const sb = getSupabase();
    if (entry.ref === 'sale') await reverseSale(sb, shopId, entry.id, newId(), reason);
    else await voidPayment(sb, shopId, entry.id, reason);
    await reload();
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(getSupabase(), shopId, customer.id);
      await reload();
      toast.success("Mijoz o'chirildi.");
      router.replace('/customers');
    } catch (e) {
      setDeleteError(errorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <>
      <LedgerSheet
        kind="customer"
        partner={customer}
        shopName={membership.shop.name}
        rows={rows}
        verification={verification}
        canWrite={canWrite}
        goodsHref={`/sales/new?customer=${customer.id}`}
        onPay={() => setPaying(true)}
        onQuickSave={onQuickSave}
        onCancel={onCancel}
        renderDetail={(e) => (e.ref === 'sale' && !e.cancelled ? <SaleLines id={e.id} /> : null)}
        headerActions={
          can(membership.role, 'partner.manage') && (
            <>
              <Button variant="outline" size="icon" onClick={() => setEditing(true)} aria-label="Tahrirlash" title="Tahrirlash">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setConfirmDelete(true)} aria-label="O'chirish" title={hasHistory ? "Tarixi bor mijozni o'chirib bo'lmaydi" : "O'chirish"} disabled={hasHistory}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )
        }
      />
      <CustomerFormModal open={editing} onClose={() => setEditing(false)} customer={customer} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} customerId={customer.id} />
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        busy={deleting}
        size="sm"
        title="Mijozni o'chirish"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Yopish
            </Button>
            <Button variant="danger" onClick={doDelete} loading={deleting}>
              O&apos;chirish
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">
          <b>{customer.name}</b> o&apos;chiriladi. Savdo va to&apos;lov tarixi bo&apos;lmagani uchun bu xavfsiz.
        </p>
        {deleteError && (
          <Alert tone="red" className="mt-3">
            {deleteError}
          </Alert>
        )}
      </Modal>
    </>
  );
}
