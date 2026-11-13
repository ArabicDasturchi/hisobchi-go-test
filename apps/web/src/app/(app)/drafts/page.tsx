'use client';
import { Sparkles } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePageQuery } from '@/components/layout/pageQuery';
import { DraftCard } from '@/components/DraftCard';
import { basketHref, OpenBaskets } from '@/components/basket/OpenBaskets';
import { draftPurchaseToBasketLines, draftSaleToBasketLines, serializePurchaseLines, serializeSaleLines } from '@/lib/basketLines';
import { draftToBasket, isBasketServerUnavailable } from '@/lib/data/baskets';
import { useRouter } from 'next/navigation';
import { DataGate } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Modal } from '@/components/ui/Modal';
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, SearchInput, Segmented, Skeleton, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { clientLabel, draftTitle, isCatalogDraft } from '@/lib/data/agentDrafts';
import { acceptAgentDraft, listAgentDrafts, listOAuthClientNames, rejectAgentDraft } from '@/lib/data/api';
import { listSupplierNames } from '@/lib/data/books';
import type { AgentDraft, AgentDraftStatus } from '@/lib/data/types';
import { errorMessage } from '@/lib/errors';
import { looseKey } from '@/lib/translit';
import { formatSom } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

type Hist = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; list: AgentDraft[] };

export default function DraftsPage() {
  return (
    <DataGate>
      {(data) => (
        <Suspense>
          <Drafts data={data} />
        </Suspense>
      )}
    </DataGate>
  );
}

function Drafts({ data }: { data: ShopData }) {
  const { shopId, customerById, reload } = useShop();
  const toast = useToast();
  const [filter, setFilter] = useState<AgentDraftStatus>('draft');
  const [q, setQ] = usePageQuery();
  const [hist, setHist] = useState<Hist>({ status: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [suppliers, setSuppliers] = useState<ReadonlyMap<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<AgentDraft | null>(null);
  // Ikki marta bosishdan himoya: state yangilanishini kutmasdan darhol bloklaydi
  const inflight = useRef(new Set<string>());
  const router = useRouter();
  const [basketKey, setBasketKey] = useState(0);

  useEffect(() => {
    let active = true;
    void listOAuthClientNames(getSupabase()).then((m) => active && setNames(m));
    void listSupplierNames(getSupabase(), shopId).then((m) => active && setSuppliers(m));
    return () => {
      active = false;
    };
  }, [shopId]);

  useEffect(() => {
    if (filter === 'draft') return;
    let active = true;
    setHist({ status: 'loading' });
    listAgentDrafts(getSupabase(), shopId, { status: filter, limit: 100 }).then(
      (list) => active && setHist({ status: 'ok', list }),
      (e: unknown) => active && setHist({ status: 'error', message: errorMessage(e) }),
    );
    return () => {
      active = false;
    };
  }, [filter, shopId, refreshKey]);

  async function afterAction() {
    await reload();
    setRefreshKey((k) => k + 1);
  }

  async function onAccept(d: AgentDraft) {
    if (inflight.current.has(d.id)) return;
    inflight.current.add(d.id);
    setBusyId(d.id);
    setErrors((prev) => ({ ...prev, [d.id]: '' }));
    try {
      const r = await acceptAgentDraft(getSupabase(), shopId, d);
      if (r === 'accepted') {
        toast.success(
          isCatalogDraft(d) ? `Tasdiqlandi: ${draftTitle(d).toLowerCase()}` : d.detail.kind === 'payment' ? `To'lov qabul qilindi: ${formatSom(d.total)}` : `Savdo yozildi: ${formatSom(d.total)}`,
        );
      }
      else toast.info('Bu qoralama allaqachon tasdiqlangan yoki rad etilgan.');
    } catch (e) {
      // Hech narsa saqlanmagan: qoralama ro'yxatda qoladi, sabab kartochkada ko'rinadi
      setErrors((prev) => ({ ...prev, [d.id]: errorMessage(e) }));
    } finally {
      inflight.current.delete(d.id);
      setBusyId(null);
      await afterAction();
    }
  }

  /** B3: qoralamani savatga olib tahrirlash (bitta tranzaksiya: savat yaratiladi, qoralama `converted`) */
  async function onToBasket(d: AgentDraft) {
    if (inflight.current.has(d.id)) return;
    if (d.detail.kind !== 'sale' && d.detail.kind !== 'purchase') return;
    inflight.current.add(d.id);
    setBusyId(d.id);
    setErrors((prev) => ({ ...prev, [d.id]: '' }));
    const basketId = crypto.randomUUID();
    try {
      const lines = d.detail.kind === 'sale' ? serializeSaleLines(draftSaleToBasketLines(d.detail.lines)) : serializePurchaseLines(draftPurchaseToBasketLines(d.detail.lines));
      await draftToBasket(getSupabase(), { shopId, draftId: d.id, basketId, lines });
      toast.success('Qoralama savatga olindi: qatorlarni tekshirib tasdiqlang.');
      const partnerId = d.detail.kind === 'sale' ? (d.detail.walkin ? null : d.customer_id) : d.detail.supplier_id;
      router.push(basketHref({ id: basketId, kind: d.detail.kind, partnerId }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [d.id]: isBasketServerUnavailable(e) ? "Serverda savat hali yoqilmagan (015 migratsiya qo'llanmagan). Qoralamani odatdagidek tasdiqlang yoki rad eting." : errorMessage(e),
      }));
    } finally {
      inflight.current.delete(d.id);
      setBusyId(null);
      setBasketKey((k) => k + 1);
      await afterAction();
    }
  }

  async function onReject(d: AgentDraft, reason: string) {
    if (inflight.current.has(d.id)) return;
    inflight.current.add(d.id);
    setBusyId(d.id);
    try {
      const r = await rejectAgentDraft(getSupabase(), d.id, reason);
      if (r === 'rejected') toast.success(isCatalogDraft(d) ? "So'rov rad etildi. Hech narsa o'zgarmadi." : 'Qoralama rad etildi. Hech narsa yozilmadi.');
      else toast.info('Bu qoralama allaqachon tasdiqlangan yoki rad etilgan.');
      setRejecting(null);
    } finally {
      inflight.current.delete(d.id);
      setBusyId(null);
      await afterAction();
    }
  }

  const pending = data.drafts;
  const rawList: AgentDraft[] | null = filter === 'draft' ? pending : hist.status === 'ok' ? hist.list : null;
  // Qidiruv (PC: tepadagi maydon, telefon: sahifadagi): mijoz/ta'minotchi nomi va qoralama sarlavhasi, Kirill/Lotin farqsiz
  const list = useMemo(() => {
    const k = looseKey(q);
    if (!rawList || !k) return rawList;
    return rawList.filter((d) => {
      const who = d.customer_id ? (customerById.get(d.customer_id)?.name ?? '') : d.detail.kind === 'purchase' ? (suppliers.get(d.detail.supplier_id) ?? '') : '';
      return looseKey(`${who} ${draftTitle(d)}`).includes(k);
    });
  }, [rawList, q, customerById, suppliers]);

  return (
    <>
      <PageHeader
        title="Savat"
        description="Yarim qolgan savdo va kirimlar hamda AI qoralamalari. Siz tasdiqlamaguncha daftarga hech narsa yozilmaydi."
        actions={
          <Segmented
            ariaLabel="Holat"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'draft', label: `Tasdiqlanmagan${pending && pending.length > 0 ? ` (${pending.length})` : ''}` },
              { value: 'accepted', label: 'Tasdiqlangan' },
              { value: 'rejected', label: 'Rad etilgan' },
              { value: 'converted', label: 'Savatga olingan' },
            ]}
          />
        }
      />

      {filter === 'draft' && (
        <div className="mb-6">
          <OpenBaskets supplierNames={suppliers} refreshKey={basketKey} />
        </div>
      )}

      <h2 className="mb-2 text-base font-semibold text-fg">AI qoralamalari</h2>
      <SearchInput value={q} onChange={setQ} placeholder="Qoralama qidirish" className="mb-3 md:hidden" />

      {filter === 'draft' && pending === null && (
        <Card>
          <ErrorState message={`Qoralamalarni yuklab bo'lmadi. ${data.draftsError ?? ''} Ma'lumotlar bazasiga 004 migratsiya qo'llanganini tekshiring.`} onRetry={() => void reload()} />
        </Card>
      )}
      {filter !== 'draft' && hist.status === 'loading' && <Skeleton className="h-40 rounded-xl" />}
      {filter !== 'draft' && hist.status === 'error' && (
        <Card>
          <ErrorState message={hist.message} onRetry={() => setRefreshKey((k) => k + 1)} />
        </Card>
      )}

      {list && list.length === 0 && (
        <Card>
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title={filter === 'draft' ? "Tasdiqlanmagan qoralama yo'q" : filter === 'accepted' ? "Tasdiqlangan qoralama yo'q" : filter === 'converted' ? "Savatga olingan qoralama yo'q" : "Rad etilgan qoralama yo'q"}
            description={filter === 'draft' ? 'AI orqali yaratilgan savdo, to\'lov va kirim qoralamalari shu yerda paydo bo\'ladi.' : undefined}
          />
        </Card>
      )}

      <div className="space-y-4">
        {list?.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            customerName={d.customer_id ? (customerById.get(d.customer_id)?.name ?? "Noma'lum mijoz") : null}
            supplierName={d.detail.kind === 'purchase' ? (suppliers.get(d.detail.supplier_id) ?? null) : null}
            source={clientLabel(d.client_id, names)}
            busy={busyId === d.id}
            anyBusy={busyId !== null}
            error={errors[d.id] || null}
            onAccept={() => void onAccept(d)}
            onReject={() => setRejecting(d)}
            onToBasket={() => void onToBasket(d)}
          />
        ))}
      </div>

      <RejectModal draft={rejecting} onClose={() => setRejecting(null)} onConfirm={onReject} busy={rejecting !== null && busyId === rejecting.id} />
    </>
  );
}

function RejectModal({ draft, onClose, onConfirm, busy }: { draft: AgentDraft | null; onClose: () => void; onConfirm: (d: AgentDraft, reason: string) => Promise<void>; busy: boolean }) {
  if (!draft) return null;
  return <RejectForm key={draft.id} draft={draft} onClose={onClose} onConfirm={onConfirm} busy={busy} />;
}

function RejectForm({ draft, onClose, onConfirm, busy }: { draft: AgentDraft; onClose: () => void; onConfirm: (d: AgentDraft, reason: string) => Promise<void>; busy: boolean }) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    try {
      await onConfirm(draft, reason);
    } catch (e2) {
      setFormError(errorMessage(e2));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Qoralamani rad etish"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Yopish
          </Button>
          <Button type="submit" form="reject-form" variant="danger" loading={busy}>
            Rad etish
          </Button>
        </>
      }
    >
      <form id="reject-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-muted">
          {draftTitle(draft)}
          {isCatalogDraft(draft) ? '' : ` (${formatSom(draft.total)})`} rad etiladi. Hech narsa {isCatalogDraft(draft) ? "o'zgarmaydi" : 'yozilmaydi'}.
        </p>
        {formError && <Alert tone="red">{formError}</Alert>}
        <Textarea label="Sabab (ixtiyoriy)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Masalan: narx noto'g'ri" />
      </form>
    </Modal>
  );
}
