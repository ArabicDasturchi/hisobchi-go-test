'use client';
/**
 * Savdolar (P-16/M-16): tarix. Savdo ustiga yozilmaydi: "Bekor qilish" (sabab majburiy, teskari yozuv), keyin
 * "Qayta yozish": shu qatorlar bilan yangi savdo panelda oldindan to'ldirib ochiladi. Ikki qadam alohida tasdiqlanadi:
 * bekor qilish o'tib, yangi savdo xato bersa, savdo bekor holida qoladi va panelda qatorlar saqlanib turadi.
 */
import { can } from '@/lib/permissions';
import { Plus, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { usePageQuery } from '@/components/layout/pageQuery';
import { DataGate, Money, StatusBadge } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Alert, Button, Card, cn, EmptyState, Input, LinkButton, PageHeader, SearchInput, Segmented, Select, TableSkeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { uz } from '@/i18n/uz';
import { RefundChoice } from '@/components/sale/RefundChoice';
import { getSaleDetail, reverseSale } from '@/lib/data/api';
import { sumPosted } from '@/lib/data/ledger';
import type { SaleDoc } from '@/lib/data/types';
import { dayRangeToIso, formatDateTime, shortNumber } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { panelHref } from '@/lib/panelState';
import { RESALE_KEY, toResaleDraft } from '@/lib/resale';
import { refundAfterError, salePayments } from '@/lib/saleReversal';
import { looseKey } from '@/lib/translit';
import { getSupabase } from '@/lib/supabase/client';

type StatusFilter = 'all' | 'posted' | 'reversed';
const PAGE = 50;
const CANCEL_REASONS = ["Noto'g'ri narx", "Noto'g'ri tovar", "Noto'g'ri mijoz", "Noto'g'ri miqdor", 'Boshqa'] as const;
const GRID = 'grid items-center gap-x-3 gap-y-1 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[4.5rem_minmax(0,1.4fr)_8rem_7rem_6.5rem_auto]';

function SaleRow({ s, customerName }: { s: SaleDoc; customerName: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { shopId, reload, data, membership } = useShop();
  // 018: bekor qilish faqat owner/admin (bazada ham majburiy)
  const canReverse = can(membership.role, 'ledger.reverse');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bir martalik kalit: tarmoq xatosidan keyin qayta urinish takroriy teskari yozuv yaratmaydi
  const [opId] = useState(() => crypto.randomUUID());
  const [refund, setRefund] = useState(true);
  // Birinchi urinishdan keyin tanlov qulflanadi: o'sha client_op_id bilan qayta urinish boshqa tanlov yubormasin
  const [attempted, setAttempted] = useState(false);
  const finalReason = reason === 'Boshqa' ? custom.trim() : reason;
  const reversed = s.status === 'reversed';
  const linked = useMemo(() => salePayments(s, data?.payments ?? [], { walkin: !!data?.walkin && data.walkin.id === s.customer_id }), [s, data]);

  async function cancel() {
    if (busy) return;
    if (finalReason.length < 3) {
      setError('Sababni yozing (kamida 3 belgi)');
      return;
    }
    setBusy(true);
    setAttempted(true);
    setError(null);
    try {
      await reverseSale(getSupabase(), shopId, s.id, opId, finalReason, refund ? linked.ids : []);
      await reload();
      setOpen(false);
      toast.success(`Savdo ${shortNumber(s.id)} bekor qilindi (teskari yozuv)${refund && linked.ids.length > 0 ? ", to'lovi ham bekor qilindi" : ''}. «Qayta yozish» tugmasi bilan shu qatorlar panelda ochiladi.`);
    } catch (e) {
      const next = refundAfterError(e);
      if (next) {
        setAttempted(next.attempted);
        setRefund(next.refund);
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function rewrite() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await getSaleDetail(getSupabase(), shopId, s.id);
      if (!detail || detail.lines.length === 0) throw new Error('Savdo qatorlari topilmadi.');
      try {
        sessionStorage.setItem(RESALE_KEY, JSON.stringify(toResaleDraft(s.customer_id, shortNumber(s.id), detail.lines)));
      } catch {
        throw new Error('Brauzer vaqtincha saqlashga ruxsat bermadi: qatorlarni panelda qo‘lda yozing.');
      }
      router.push(`${panelHref({ action: 'savdo', who: s.customer_id ?? '' })}${s.customer_id ? '&' : '?'}qayta=1`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <li className={cn('px-3 py-2.5', GRID, open && 'bg-subtle/50')} data-testid="sale-row">
      <Link href={`/sales/${s.id}`} className="font-mono text-sm font-semibold text-fg hover:underline md:order-none">
        {shortNumber(s.id)}
      </Link>
      <span className="order-last col-span-2 truncate text-[15px] text-fg md:order-none md:col-span-1">{customerName ?? <span className="text-muted">{uz.common.noCustomer} (naqd)</span>}</span>
      <span className="hidden text-sm text-muted md:block">{formatDateTime(s.created_at)}</span>
      <span className="text-right md:text-left">
        <Money value={s.subtotal} className={reversed ? 'font-semibold text-muted line-through' : 'text-[15px] font-semibold text-fg'} />
      </span>
      <span className="hidden md:block">
        <StatusBadge status={s.status} />
      </span>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        <span className="mr-auto md:hidden">
          <StatusBadge status={s.status} />
        </span>
        {!reversed && canReverse && (
          <Button variant="outline" size="lg" className="h-11" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Savdo ${shortNumber(s.id)}: bekor qilish`}>
            Bekor qilish
          </Button>
        )}
        {reversed && (
          <Button variant="outline" size="lg" className="h-11" loading={busy} onClick={() => void rewrite()} aria-label={`Savdo ${shortNumber(s.id)}: qayta yozish`}>
            Qayta yozish
          </Button>
        )}
      </div>
      {open && !reversed && (
        <div className="col-span-full space-y-2 rounded-xl border-2 border-emerald-500/60 p-3" data-testid="cancel-panel">
          <RefundChoice total={linked.total} checked={refund} onChange={setRefund} disabled={busy || attempted} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Select label="Sabab (majburiy)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} className="h-11" wrapClassName="sm:w-72">
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            {reason === 'Boshqa' && <Input aria-label="Sabab matni" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Sababni yozing" maxLength={300} disabled={busy} className="h-11" wrapClassName="sm:flex-1" />}
            <Button size="lg" variant="danger" className="h-11" loading={busy} onClick={() => void cancel()}>
              Bekor qilishni tasdiqlash
            </Button>
            <Button size="lg" variant="outline" className="h-11" disabled={busy} onClick={() => setOpen(false)}>
              Yopish
            </Button>
          </div>
          <p className="text-xs text-muted">Teskari yozuv qo&apos;shiladi, savdo o&apos;chirilmaydi. So&apos;ng «Qayta yozish»: shu qatorlar bilan yangi savdo panelda ochiladi.</p>
        </div>
      )}
      {error && (
        <div className="col-span-full">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
    </li>
  );
}

function Sales({ data }: { data: ShopData }) {
  const { customerById } = useShop();
  const [query, setQuery] = usePageQuery();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [customer, setCustomer] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const rangeInvalid = Boolean(from && to && from > to);

  const rows = useMemo(() => {
    const q = looseKey(query).replace(/^#/, '');
    const fromT = from ? new Date(dayRangeToIso(from, from)!.fromIso).getTime() : null;
    const toT = to ? new Date(dayRangeToIso(to, to)!.toIso).getTime() : null;
    return data.sales.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      // Bir martalik (tizim) mijoz savdosi ham «Mijozsiz (naqd)» (W10: veb mijozsiz savdoni shunday yozadi)
      const own = s.customer_id && s.customer_id !== data.walkin?.id ? s.customer_id : null;
      if (customer === '__none' ? own !== null : customer && s.customer_id !== customer) return false;
      const t = new Date(s.created_at).getTime();
      if (fromT !== null && t < fromT) return false;
      if (toT !== null && t >= toT) return false;
      if (!q) return true;
      const name = own ? (customerById.get(own)?.name ?? '') : uz.common.noCustomer;
      return looseKey(shortNumber(s.id)).includes(q) || looseKey(name).includes(q);
    });
  }, [data.sales, data.walkin, query, status, customer, from, to, customerById]);

  const shown = rows.slice(0, limit);
  const filtered = Boolean(query || status !== 'all' || customer || from || to);

  return (
    <>
      <PageHeader
        title="Savdolar"
        description="Tarix. Savdo tahrirlanmaydi: bekor qilinadi va qayta yoziladi."
        actions={
          <LinkButton href="/dashboard" className="h-11" icon={<Plus className="h-4 w-4" />}>
            {uz.nav.newSale}
          </LinkButton>
        }
      />
      <Card>
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={query} onChange={setQuery} placeholder="Raqam yoki mijoz bo'yicha qidirish" className="md:hidden" />
            <Segmented ariaLabel="Holat" className="lg:ml-auto" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Hammasi' }, { value: 'posted', label: 'Saqlangan' }, { value: 'reversed', label: 'Bekor qilingan' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Select aria-label="Mijoz" value={customer} onChange={(e) => setCustomer(e.target.value)} wrapClassName="col-span-2">
              <option value="">Barcha mijozlar</option>
              <option value="__none">{uz.common.noCustomer}</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input type="date" aria-label="Boshlanish sanasi" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />
            <Input type="date" aria-label="Tugash sanasi" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} error={rangeInvalid ? "Oraliq noto'g'ri" : null} />
          </div>
          {filtered && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted">
                Topildi: <b className="text-fg">{rows.length}</b> ta · saqlanganlar summasi <Money value={sumPosted(rows)} className="font-semibold text-fg" />
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setStatus('all'); setCustomer(''); setFrom(''); setTo(''); }}>
                Filterni tozalash
              </Button>
            </div>
          )}
        </div>

        {data.sales.length === 0 ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Hali savdo yo'q" description="Birinchi savdoni panelda kiriting." action={<LinkButton href="/dashboard" size="sm" icon={<Plus className="h-4 w-4" />}>Savdo kiritish</LinkButton>} />
        ) : rows.length === 0 ? (
          <EmptyState title="Hech narsa topilmadi" description="Filterlarni o'zgartirib ko'ring." />
        ) : (
          <>
            <div className={cn('hidden border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid', GRID)} aria-hidden>
              <span>Raqam</span>
              <span>Mijoz</span>
              <span>Sana</span>
              <span>Summa</span>
              <span>Holat</span>
              <span />
            </div>
            <ul className="divide-y divide-line" aria-label="Savdolar">
              {shown.map((s) => (
                <SaleRow key={s.id} s={s} customerName={s.customer_id && s.customer_id !== data.walkin?.id ? (customerById.get(s.customer_id)?.name ?? null) : null} />
              ))}
            </ul>
            {rows.length > shown.length && (
              <div className="border-t border-line p-4 text-center">
                <Button variant="outline" size="lg" className="h-11" onClick={() => setLimit((l) => l + PAGE)}>
                  Yana ko&apos;rsatish ({rows.length - shown.length} ta qoldi)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export default function SalesPage() {
  return (
    <DataGate skeleton={<Card><TableSkeleton /></Card>}>
      {(data) => (
        <Suspense>
          <Sales data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}
