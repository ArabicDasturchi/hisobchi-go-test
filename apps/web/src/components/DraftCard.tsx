import { AlertTriangle, Check, X } from 'lucide-react';
import Link from 'next/link';
import { draftTitle, integrityError, isCatalogDraft } from '@/lib/data/agentDrafts';
import type { AgentDraft, Change } from '@/lib/data/types';
import { formatDateTime } from '@/lib/dates';
import { formatQty, formatSom } from '@/lib/money';
import { MethodBadge, Money } from './shared';
import { Alert, Badge, Button, Card } from './ui/primitives';

const somOrDash = (v: bigint | null) => (v === null ? "yo'q" : formatSom(v));

function ChangeRow({ label, change }: { label: string; change: Change<string> | Change<bigint | null> }) {
  const show = (v: string | bigint | null) => (typeof v === 'string' ? v : somOrDash(v));
  return (
    <tr>
      <td className="py-2 pr-3 text-muted">{label}</td>
      <td className="px-3 py-2 text-muted line-through">{show(change.from)}</td>
      <td className="py-2 pl-3 font-medium text-fg">{show(change.to)}</td>
    </tr>
  );
}

/**
 * Agent qoralamasi kartochkasi. Ochiq (tasdiqlanmagan) qoralama sariq; ogohlantirishli qatorlar ajratiladi;
 * yaxlitlik tekshiruvidan o'tmasa "Tasdiqlash" yopiladi (hisob mos kelmasa hech narsa yozilmaydi).
 */
export function DraftCard({
  draft: d,
  customerName,
  supplierName = null,
  source,
  busy,
  anyBusy,
  error,
  onAccept,
  onReject,
}: {
  draft: AgentDraft;
  customerName: string | null;
  /** kirim qoralamasi uchun ta'minotchi nomi (topilmasa "Ta'minotchi") */
  supplierName?: string | null;
  source: string;
  busy: boolean;
  anyBusy: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const open = d.status === 'draft';
  const problem = integrityError(d);
  const isPayment = d.detail.kind === 'payment';
  const isPurchase = d.detail.kind === 'purchase';
  const catalog = isCatalogDraft(d);
  return (
    <Card className={open ? 'border-amber-300 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {open ? <Badge tone="amber">Tasdiqlanmagan</Badge> : d.status === 'accepted' ? <Badge tone="green">Tasdiqlangan</Badge> : <Badge tone="neutral">Rad etilgan</Badge>}
            <span className="text-sm font-semibold text-fg">{draftTitle(d)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {d.detail.kind === 'purchase' ? (
              <span className="font-medium text-fg">{supplierName ?? "Ta'minotchi"}</span>
            ) : catalog && d.detail.kind !== 'unreadable' && d.detail.kind !== 'sale' && d.detail.kind !== 'payment' ? (
              <span className="font-medium text-fg">{d.detail.target_name}</span>
            ) : d.customer_id ? (
              <Link href={`/customers/${d.customer_id}`} className="font-medium text-fg hover:underline">
                {customerName}
              </Link>
            ) : d.detail.kind === 'sale' && d.detail.walkin ? (
              <span className="font-medium text-fg">Bir martalik mijoz</span>
            ) : (
              'Mijozsiz'
            )}
            {' · '}
            Yaratdi: {source}
            {' · '}
            {formatDateTime(d.created_at)}
          </p>
        </div>
        {!catalog && <Money value={d.total} className="text-lg font-semibold text-fg" />}
      </div>

      <div className="px-4 py-3">
        {d.detail.kind === 'sale' && (
          <>
            {d.detail.raw_input && <p className="mb-2 text-xs text-muted">Asl matn: {d.detail.raw_input}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Mahsulot</th>
                    <th className="px-3 py-1.5 text-right font-medium">Miqdor</th>
                    <th className="px-3 py-1.5 text-right font-medium">Narx</th>
                    <th className="py-1.5 pl-3 text-right font-medium">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.detail.lines.map((l, i) => (
                    <tr key={i} className={l.warnings.length > 0 ? 'bg-amber-100/60 dark:bg-amber-500/10' : undefined}>
                      <td className="py-2 pr-3 align-top">
                        <span className="font-medium text-fg">{l.product_name}</span>
                        {l.warnings.map((w, wi) => (
                          <span key={wi} className="mt-0.5 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                            {w}
                          </span>
                        ))}
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right align-top">
                        {formatQty(l.qty_milli)} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <Money value={l.unit_price} />
                      </td>
                      <td className="py-2 pl-3 text-right align-top font-medium">
                        <Money value={l.line_total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {d.detail.kind === 'sale' && (d.detail.walkin || d.detail.paid !== null) && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {d.detail.method && <MethodBadge method={d.detail.method} />}
            <span>
              {d.detail.walkin ? "Bir martalik mijoz qarzga olmaydi: to'liq to'lanadi" : "Savdo bilan birga to'lanadi"}
              {d.detail.paid !== null && (
                <>
                  {': '}
                  <Money value={d.detail.paid} className="font-medium text-fg" />
                </>
              )}
              {!d.detail.walkin && d.detail.paid !== null && d.detail.paid < d.total && (
                <>
                  {'; qarzga qoladi '}
                  <Money value={d.total - d.detail.paid} className="font-medium text-fg" />
                </>
              )}
            </span>
          </p>
        )}
        {d.detail.kind === 'purchase' && (
          <>
            <p className="mb-2 text-xs text-muted">
              Sana: {d.detail.doc_date.split('-').reverse().join('.')}. Kirim ombor qoldig&apos;ini oshiradi va tan narxni yangilaydi — tasdiqlangunga qadar hech narsa o&apos;zgarmaydi.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Tovar</th>
                    <th className="px-3 py-1.5 text-right font-medium">Miqdor</th>
                    <th className="px-3 py-1.5 text-right font-medium">Tan narx</th>
                    <th className="py-1.5 pl-3 text-right font-medium">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.detail.lines.map((l, i) => (
                    <tr key={i} className={l.warnings.length > 0 ? 'bg-amber-100/60 dark:bg-amber-500/10' : undefined}>
                      <td className="py-2 pr-3 align-top">
                        <span className="font-medium text-fg">{l.product_name}</span>
                        {l.warnings.map((w, wi) => (
                          <span key={wi} className="mt-0.5 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                            {w}
                          </span>
                        ))}
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right align-top">
                        {formatQty(l.qty_milli)} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <Money value={l.unit_cost} />
                      </td>
                      <td className="py-2 pl-3 text-right align-top font-medium">
                        <Money value={l.line_total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.detail.paid !== null && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                {d.detail.method && <MethodBadge method={d.detail.method} />}
                <span>
                  Ta&apos;minotchiga beriladi: <Money value={d.detail.paid} className="font-medium text-fg" />
                </span>
              </p>
            )}
            {d.detail.note && <p className="mt-1 text-xs text-muted">Izoh: {d.detail.note}</p>}
          </>
        )}
        {d.detail.kind === 'payment' && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <MethodBadge method={d.detail.method} />
            {d.detail.note && <span>Izoh: {d.detail.note}</span>}
          </p>
        )}
        {d.detail.kind === 'customer_update' && (
          <table className="w-full text-left text-[13px]">
            <tbody>
              <ChangeRow label="Nomi" change={d.detail.name} />
            </tbody>
          </table>
        )}
        {d.detail.kind === 'product_update' && (
          <table className="w-full text-left text-[13px]">
            <tbody>
              {d.detail.name && <ChangeRow label="Nomi" change={d.detail.name} />}
              {d.detail.unit && <ChangeRow label="Birlik" change={d.detail.unit} />}
              {d.detail.price && <ChangeRow label="Narx" change={d.detail.price} />}
            </tbody>
          </table>
        )}
        {(d.detail.kind === 'customer_archive' || d.detail.kind === 'product_archive') && (
          <div className="space-y-2 text-sm text-muted">
            <p>
              {d.detail.kind === 'customer_archive' ? 'Mijoz' : 'Tovar'} <b className="text-fg">{d.detail.target_name}</b> arxivlanadi: yangi savdo tanlovida ko&apos;rinmaydi.
              {d.detail.kind === 'customer_archive' ? " Savdo tarixi, qarz va to'lovlar saqlanadi." : ' Saqlangan savdolar o&apos;zgarmaydi.'}
            </p>
            {d.detail.kind === 'customer_archive' && d.detail.outstanding !== null && d.detail.outstanding > 0n && (
              <p className="flex items-start gap-1 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                Bu mijozning qarzi bor: {formatSom(d.detail.outstanding)}.
              </p>
            )}
          </div>
        )}
        {d.detail.kind === 'unreadable' && <p className="text-sm text-muted">Qoralama mazmunini o&apos;qib bo&apos;lmadi.</p>}
        {d.status === 'rejected' && d.reject_reason && <p className="mt-2 text-xs text-muted">Rad etish sababi: {d.reject_reason}</p>}
        {d.status !== 'draft' && d.decided_at && <p className="mt-2 text-xs text-muted">Hal qilingan: {formatDateTime(d.decided_at)}</p>}
      </div>

      {open && problem && (
        <div className="px-4 pb-3">
          <Alert tone="red" title="Tasdiqlab bo'lmaydi">
            {problem}. Hisob mos kelmasa hech narsa yozilmaydi; qoralamani rad eting va AI dan qayta so&apos;rang.
          </Alert>
        </div>
      )}
      {error && (
        <div className="px-4 pb-3">
          <Alert tone="red" title="Tasdiqlanmadi, hech narsa yozilmadi">
            {error}
          </Alert>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row-reverse">
          <Button className="w-full sm:w-auto" onClick={onAccept} loading={busy} disabled={anyBusy || problem !== null} icon={!busy ? <Check className="h-4 w-4" /> : undefined}>
            {catalog ? 'Tasdiqlash' : `Tasdiqlash (${formatSom(d.total)})`}
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={onReject} disabled={anyBusy} icon={<X className="h-4 w-4" />}>
            Rad etish
          </Button>
        </div>
      )}
      {d.status === 'accepted' && (
        <div className="border-t border-line px-4 py-2.5 text-sm">
          <Link
            href={isPayment ? '/payments' : isPurchase ? '/books/in' : `/sales/${d.id}`}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {isPayment ? "To'lovlarni ko'rish" : isPurchase ? "Kirim daftarini ko'rish" : "Savdoni ko'rish"}
          </Link>
        </div>
      )}
    </Card>
  );
}
