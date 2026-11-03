'use client';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DraftCard } from '@/components/DraftCard';
import { DataGate } from '@/components/shared';
import { useShop, type ShopData } from '@/components/ShopDataProvider';
import { Modal } from '@/components/ui/Modal';
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { clientLabel, draftTitle, isCatalogDraft } from '@/lib/data/agentDrafts';
import { acceptAgentDraft, listAgentDrafts, listOAuthClientNames, rejectAgentDraft } from '@/lib/data/api';
import type { AgentDraft, AgentDraftStatus } from '@/lib/data/types';
import { errorMessage } from '@/lib/errors';
import { formatSom } from '@/lib/money';
import { getSupabase } from '@/lib/supabase/client';

type Hist = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; list: AgentDraft[] };

export default function DraftsPage() {
  return <DataGate>{(data) => <Drafts data={data} />}</DataGate>;
}

function Drafts({ data }: { data: ShopData }) {
  const { shopId, customerById, reload } = useShop();
  const toast = useToast();
  const [filter, setFilter] = useState<AgentDraftStatus>('draft');
  const [hist, setHist] = useState<Hist>({ status: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<AgentDraft | null>(null);
  // Ikki marta bosishdan himoya: state yangilanishini kutmasdan darhol bloklaydi
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void listOAuthClientNames(getSupabase()).then((m) => active && setNames(m));
    return () => {
      active = false;
    };
  }, []);

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
  const list: AgentDraft[] | null = filter === 'draft' ? pending : hist.status === 'ok' ? hist.list : null;

  return (
    <>
      <PageHeader
        title="Qoralamalar"
        description="Tashqi AI (Claude, ChatGPT) yuborgan qoralamalar va o'zgartirish/arxiv so'rovlari. Siz tasdiqlamaguncha hech narsa yozilmaydi yoki o'zgarmaydi."
        actions={
          <Segmented
            ariaLabel="Holat"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'draft', label: `Tasdiqlanmagan${pending && pending.length > 0 ? ` (${pending.length})` : ''}` },
              { value: 'accepted', label: 'Tasdiqlangan' },
              { value: 'rejected', label: 'Rad etilgan' },
            ]}
          />
        }
      />

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
            title={filter === 'draft' ? "Tasdiqlanmagan qoralama yo'q" : filter === 'accepted' ? "Tasdiqlangan qoralama yo'q" : "Rad etilgan qoralama yo'q"}
            description={filter === 'draft' ? 'AI orqali yaratilgan savdo va to\'lov qoralamalari shu yerda paydo bo\'ladi.' : undefined}
          />
        </Card>
      )}

      <div className="space-y-4">
        {list?.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            customerName={d.customer_id ? (customerById.get(d.customer_id)?.name ?? "Noma'lum mijoz") : null}
            source={clientLabel(d.client_id, names)}
            busy={busyId === d.id}
            anyBusy={busyId !== null}
            error={errors[d.id] || null}
            onAccept={() => void onAccept(d)}
            onReject={() => setRejecting(d)}
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
