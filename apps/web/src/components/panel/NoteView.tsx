'use client';
/**
 * Daftarga yozish: Kimga + erkin matn → oldindan ko'rish kartochkasi (turi, summa, yangi qoldiq).
 * "Tasdiqlash" bosilmaguncha hech narsa saqlanmaydi; "Bekor" matnni tozalaydi.
 */
import { Money } from '@/components/shared';
import { Alert, Button } from '@/components/ui/primitives';
import { uz } from '@/i18n/uz';
import { noteTitle, previewLedgerNote, type NoteKind } from '@/lib/ledgerNote';

export interface NoteViewProps {
  kind: NoteKind | null;
  partnerName: string | null;
  balance: bigint;
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  locked: boolean;
  error: string | null;
}

export function NoteView(p: NoteViewProps) {
  const prev = previewLedgerNote(p.balance, p.text);
  const supplier = p.kind === 'supplier';
  return (
    <section aria-label="Daftarga yozish" className="space-y-3" data-testid="note-view">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">Daftarga yozish</h2>
        <p className="text-sm text-muted">{p.partnerName ? `${p.partnerName} · ${supplier ? "ta'minotchi" : 'mijoz'} daftari` : 'Kimga yozilishini tanlang'}</p>
      </div>
      {p.partnerName && (
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-muted">{supplier ? 'Mening qarzim' : 'Mijoz qarzi'}</span>
          <Money value={p.balance} className="text-lg font-semibold text-fg" />
        </div>
      )}
      {prev.ok && p.kind ? (
        <div className="space-y-3 rounded-2xl border-2 border-emerald-500/60 bg-surface p-4" data-testid="note-preview">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-fg">Yangi yozuv: {noteTitle(prev.goods, prev.paid, p.kind)}</p>
            <span className="rounded-full border border-amber-500/60 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Tasdiqlanmagan</span>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Eski qarz</dt>
              <dd className="text-lg font-semibold text-fg">
                <Money value={prev.settlement.opening} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{prev.goods > 0n ? (supplier ? 'Kirim (tovar)' : 'Savdo (tovar)') : "To'lov"}</dt>
              <dd className="text-lg font-semibold text-fg">
                <Money value={prev.goods > 0n ? prev.goods : prev.paid} />
                {prev.goods > 0n && prev.paid > 0n && (
                  <span className="block text-sm font-normal text-muted">
                    to&apos;lov: <Money value={prev.paid} />
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Yangi ostatka (kod hisoblaydi)</dt>
              <dd className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                <Money value={prev.settlement.balance} />
              </dd>
            </div>
          </dl>
          {supplier && prev.goods > 0n && <p className="text-xs text-muted">Tovarsiz kirim qarz yozuvi bo&apos;ladi: ombor o&apos;zgarmaydi. Tovar bilan kirim uchun «Kirim» amalini tanlang.</p>}
          {p.error && (
            <Alert tone="red">
              {p.error}
              {p.locked && <span className="mt-1 block text-xs">Saqlangan bo&apos;lishi mumkin. Qayta urinish takroriy yozuv yaratmaydi.</span>}
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="lg" className="h-11" onClick={p.onCancel} disabled={p.busy || p.locked}>
              Bekor
            </Button>
            <Button size="lg" className="h-11" onClick={p.onConfirm} loading={p.busy} disabled={!p.partnerName} data-testid="note-confirm">
              {p.locked ? uz.composer.retry : uz.composer.confirm}
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{(!prev.ok ? prev.message : null) ?? "Pastdagi oynaga yozing: masalan «kirim 1 000 000» yoki «to'lov 500 000»."}</p>
      )}
    </section>
  );
}
