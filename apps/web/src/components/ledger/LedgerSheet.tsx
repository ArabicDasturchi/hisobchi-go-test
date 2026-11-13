'use client';
/**
 * LedgerSheet — daftar varag'i (bloknot). Mijoz va ta'minotchi uchun BITTA komponent, ikki xil sozlama (`kind`).
 * Jadval qog'oz daftar ustunlari bilan bir xil: Sana | Eski | Tovar | Jami | Berildi | Ostatka | Izoh.
 * Hisob bu yerda YO'Q: qatorlar `ledgerRows` (core), tez yozuvning Jami/Ostatka'si `quickPreview` (core `settle`).
 * Tuzatish: yozuv o'chirilmaydi, "Bekor qilish" teskari yozuv yaratadi (onCancel) va qator kulrang bo'lib qoladi.
 */
import { Ban, ChevronDown, ChevronRight, ClipboardCopy, MessageSquareText, Phone, Printer, ShieldAlert, ShieldCheck, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { tashkentDate, ledgerBalance } from '@hisobchi/core';
import { uz } from '@/i18n/uz';
import type { SheetEntry, SheetRow, Verification } from '@/lib/data/partnerLedger';
import type { PartnerKind } from '@/lib/data/partnerLedger';
import { ALL_TIME, presetRange, rangeError, reminderText, arrowTarget, rowsInRange, SHEET_CONFIG, sheetText, type DateRange, type RangePreset } from '@/lib/ledgerView';
import { groupDigits, formatSom } from '@/lib/money';
import { ReasonModal } from '../forms/ReasonModal';
import { Money } from '../shared';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, LinkButton, Segmented, cn } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export interface SheetPartner {
  id: string;
  name: string;
  phone: string | null;
  notes?: string | null;
  is_active: boolean;
}

export interface QuickSaveInput {
  /** Toshkent sanasi, YYYY-MM-DD (mijoz yozuvlari uchun doim bugun) */
  date: string;
  goods: bigint;
  paid: bigint;
}

export interface LedgerSheetProps {
  kind: PartnerKind;
  partner: SheetPartner;
  shopName: string;
  rows: readonly SheetRow[];
  verification: Verification | 'checking';
  /** can() natijasi: yozish ruxsati */
  canWrite: boolean;
  /** 018: yozuvni bekor qilish faqat owner/admin (berilmasa canWrite bo'yicha) */
  canReverse?: boolean;
  /** "Panelda yozish" manzili: `/dashboard?amal=daftar&kimga=<id>` (daftar faqat o'qiladi, yozuv panelda) */
  writeHref: string;
  /** Yozuvni bekor qilish (teskari yozuv) */
  onCancel: (entry: SheetEntry, reason: string) => Promise<void>;
  /** Yozuv tafsiloti: tovar qatorlari (nom, miqdor, narx) */
  renderDetail?: (entry: SheetEntry) => ReactNode;
  /** Sarlavha yonidagi qo'shimcha amallar (tahrirlash, arxivlash) */
  headerActions?: ReactNode;
}

const ENTRY_LABEL: Record<SheetEntry['ref'], string> = {
  sale: 'Savdo',
  purchase: 'Kirim',
  opening: "Boshlang'ich qarz",
  debt: 'Qarz yozuvi (tovarsiz)',
  customer_payment: "To'lov",
  supplier_payment: "To'lov",
};

const showDate = (d: string) => d.split('-').reverse().join('.');
const cell = (v: bigint) => (v === 0n ? '—' : groupDigits(v));

function rowNote(r: SheetRow): string {
  if (r.kind === 'opening') return "Boshlang'ich qarz";
  const parts: string[] = [];
  for (const e of r.entries) {
    if (e.cancelled) continue;
    if (e.kind === 'payment' && e.method && e.method !== 'naqd') parts.push(e.method === 'karta' ? 'karta' : "o'tkazma");
    if (e.note) parts.push(e.note);
  }
  return parts.join(' · ');
}

export function LedgerSheet(p: LedgerSheetProps) {
  const cfg = SHEET_CONFIG[p.kind];
  const toast = useToast();
  const allRows = p.rows;
  const balance = ledgerBalance(allRows);
  const today = useMemo(() => tashkentDate(new Date()), []);

  const [preset, setPreset] = useState<RangePreset>('all');
  const [custom, setCustom] = useState<DateRange>(ALL_TIME);
  const range: DateRange = preset === 'custom' ? custom : presetRange(preset, today);
  const rErr = rangeError(range);
  const shown = useMemo(() => (rErr ? [] : rowsInRange(allRows, range)), [allRows, range.from, range.to, rErr]); // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<SheetEntry | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const blocked = p.verification !== 'checking' && p.verification.status === 'mismatch';
  const writable = p.canWrite && p.partner.is_active && !blocked;

  const balanceTone = balance > 0n ? 'text-rose-600 dark:text-rose-400' : balance < 0n ? 'text-sky-700 dark:text-sky-300' : 'text-emerald-600 dark:text-emerald-400';

  // --- klaviatura: strelkalar bilan qatorlar orasida yurish ---
  const onGridKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const t = e.target as HTMLElement;
    const root = wrapRef.current;
    if (!root) return;
    const list = [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => el.offsetParent !== null);
    const i = list.indexOf(t);
    if (i < 0) return;
    // tez yozuvdagi matn maydonlarida faqat bo'sh bo'lsa chiqib ketadi
    if (t instanceof HTMLInputElement && t.dataset.nav === 'quick' && t.value !== '' && e.key === 'ArrowUp') return;
    const nextIdx = arrowTarget(i, list.length, e.key);
    const next = nextIdx === null ? undefined : list[nextIdx];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }, []);

  const copy = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error('Nusxalab bo‘lmadi. Brauzer ruxsatini tekshiring.');
    }
  };

  const reminder = p.kind === 'customer' ? reminderText(p.partner.name, balance, p.shopName) : null;

  return (
    <div ref={wrapRef} onKeyDown={onGridKey}>
      {/* Tepa: ism, telefon, qarz */}
      <Card className="print-plain p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar name={p.partner.name} className="h-11 w-11 text-sm" />
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg">
                <span className="truncate">{p.partner.name}</span>
                {!p.partner.is_active && <Badge>Arxiv</Badge>}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                {p.partner.phone && (
                  <a href={`tel:${p.partner.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-fg">
                    <Phone className="h-3.5 w-3.5" /> {p.partner.phone}
                  </a>
                )}
                {p.partner.notes && (
                  <span className="inline-flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" /> {p.partner.notes}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="sm:text-right" data-testid="sheet-balance">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{balance < 0n ? 'Ortiqcha to‘lov' : cfg.kind === 'customer' ? 'Hozirgi qarzi' : 'Hozirgi qarzim'}</p>
            <p className={cn('tabular text-3xl font-bold tracking-tight sm:text-4xl', balanceTone)}>{formatSom(balance < 0n ? -balance : balance)}</p>
          </div>
        </div>

        {/* Tugmalar: tepada va doim ko'rinadi */}
        <div className="no-print mt-4 flex flex-wrap items-center gap-2">
          <LinkButton href={p.writeHref} variant={writable ? 'primary' : 'outline'} className={cn('h-11', !writable && 'pointer-events-none opacity-50')}>
            Panelda yozish
          </LinkButton>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <Button variant="ghost" size="sm" onClick={() => void copy(sheetText({ shopName: p.shopName, partnerName: p.partner.name, kind: p.kind, rows: allRows, balance }), 'Varaq matni nusxalandi — Telegram yoki WhatsApp’ga qo‘ying.')} icon={<ClipboardCopy className="h-4 w-4" />}>
            Varaqni yuborish
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
            Chop etish / PDF
          </Button>
          {reminder && (
            <Button variant="ghost" size="sm" onClick={() => void copy(reminder, 'Eslatma matni nusxalandi.')} icon={<MessageSquareText className="h-4 w-4" />}>
              Eslatma matni
            </Button>
          )}
          {p.headerActions}
        </div>

        <div className="no-print mt-3">
          <VerifyNote v={p.verification} />
        </div>
      </Card>

      {/* Sana oralig'i */}
      <div className="no-print mt-3 flex flex-wrap items-center gap-2">
        <Segmented<RangePreset>
          ariaLabel="Davr"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'all', label: 'Hammasi' },
            { value: 'month', label: 'Shu oy' },
            { value: 'week', label: '7 kun' },
            { value: 'custom', label: 'Sana tanlash' },
          ]}
        />
        {preset === 'custom' && (
          <div className="grid max-w-md grid-cols-2 gap-2">
            <Input aria-label="Dan" type="date" value={custom.from ?? ''} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))} />
            <Input aria-label="Gacha" type="date" value={custom.to ?? ''} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))} error={rErr} />
          </div>
        )}
        {preset !== 'all' && !rErr && (
          <span className="text-xs text-muted">
            Davr: {range.from ? showDate(range.from) : 'boshidan'} — {range.to ? showDate(range.to) : 'hozirgacha'}. Eski va Ostatka butun tarixdan hisoblangan.
          </span>
        )}
      </div>

      {/* Jadval */}
      <Card className="print-plain mt-3">
        {allRows.length === 0 ? (
          <EmptyState title="Birinchi yozuvni kiriting" description="Daftar bo‘sh. Pastdagi qatorga savdo yoki to‘lov summasini yozing — Enter bosing." />
        ) : shown.length === 0 ? (
          <EmptyState title="Bu davrda yozuv yo‘q" description="Davrni o‘zgartiring." />
        ) : (
          <>
            {/* Telefon: har qator — ixcham kartochka */}
            <ul className="divide-y divide-line lg:hidden" aria-label="Daftar qatorlari">
              {shown.map((r) => (
                <li key={r.key} className={cn(r.allCancelled && 'bg-subtle/60 text-muted')}>
                  <button
                    type="button"
                    data-nav="row"
                    onClick={() => setOpen(open === r.key ? null : r.key)}
                    aria-expanded={open === r.key}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left focus:bg-surface-2 focus:outline-none"
                  >
                    {open === r.key ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{showDate(r.date)}</span>
                        {r.allCancelled ? <Badge tone="red">bekor qilingan</Badge> : <span className={cn('tabular text-sm font-semibold', r.balance > 0n ? 'text-rose-600 dark:text-rose-400' : '')}>{groupDigits(r.balance)}</span>}
                      </span>
                      {r.kind === 'opening' ? (
                        <span className="mt-0.5 block text-xs">Boshlang‘ich qarz: {groupDigits(r.opening)}</span>
                      ) : (
                        <span className="mt-0.5 block text-xs tabular">
                          Eski {groupDigits(r.old)} + {cfg.goodsHeader} {groupDigits(r.goods)} = {groupDigits(r.total)} · {cfg.paidHeader} {groupDigits(r.paid)}
                        </span>
                      )}
                      {rowNote(r) && <span className="mt-0.5 block truncate text-xs">{rowNote(r)}</span>}
                    </span>
                  </button>
                  {open === r.key && <RowDetail row={r} writable={writable && p.canWrite && (p.canReverse ?? true)} onCancel={setCancelling} renderDetail={p.renderDetail} />}
                </li>
              ))}
            </ul>

            {/* Kompyuter: qog'oz daftar ustunlari */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-surface-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Sana</th>
                    <th className="px-4 py-2.5 text-right font-medium">Eski</th>
                    <th className="px-4 py-2.5 text-right font-medium">{cfg.goodsHeader}</th>
                    <th className="px-4 py-2.5 text-right font-medium">Jami</th>
                    <th className="px-4 py-2.5 text-right font-medium">{cfg.paidHeader}</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ostatka</th>
                    <th className="px-4 py-2.5 font-medium">Izoh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((r) => (
                    <SheetTableRow key={r.key} row={r} isOpen={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)} writable={writable && p.canWrite && (p.canReverse ?? true)} onCancel={setCancelling} renderDetail={p.renderDetail} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <p className="no-print mt-3 text-xs text-muted">
        Yangi yozuv Boshqaruv panelida kiritiladi («Panelda yozish»). Hisob ikki yo‘l bilan tekshirilgan: mos. Yozuv o‘zgartirilmaydi: faqat «Bekor qilish» (teskari yozuv, sabab bilan).
      </p>

      <ReasonModal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Yozuvni bekor qilish"
        confirmLabel="Bekor qilish"
        summary={
          cancelling && (
            <>
              {ENTRY_LABEL[cancelling.ref]} <Money value={cancelling.amount} className="font-semibold" /> ({showDate(cancelling.date)}) bekor qilinadi. Yozuv o‘chirilmaydi: teskari yozuv qo‘shiladi va qatorda «bekor qilingan» belgisi turadi.
            </>
          )
        }
        onConfirm={async (reason) => {
          if (!cancelling) return;
          await p.onCancel(cancelling, reason);
          toast.success('Yozuv bekor qilindi.');
          setCancelling(null);
        }}
      />
    </div>
  );
}

function VerifyNote({ v }: { v: Verification | 'checking' }) {
  if (v === 'checking') return <p className="text-xs text-muted">Hisob tekshirilmoqda…</p>;
  if (v.status === 'mismatch') {
    return (
      <Alert tone="red" title="Hisob mos kelmadi — yozish to‘xtatildi">
        <span className="flex items-start gap-1.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Daftar qoldig‘i {formatSom(v.ledger)}, {v.source === 'sql' ? 'server hisobi' : 'ikkinchi hisob'} {formatSom(v.independent)}. Sahifani yangilang; takrorlansa, yozuvlarni tekshirib, bizga xabar bering.
          </span>
        </span>
      </Alert>
    );
  }
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-muted">
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
      Hisob ikki yo‘l bilan tekshirildi ({v.source === 'sql' ? 'server bilan mos' : 'mahalliy tekshiruv; server hisobiga yetib bo‘lmadi'}).
    </p>
  );
}

function SheetTableRow({
  row,
  isOpen,
  onToggle,
  writable,
  onCancel,
  renderDetail,
}: {
  row: SheetRow;
  isOpen: boolean;
  onToggle: () => void;
  writable: boolean;
  onCancel: (e: SheetEntry) => void;
  renderDetail?: (e: SheetEntry) => ReactNode;
}) {
  const grey = row.allCancelled;
  return (
    <>
      <tr className={cn('transition-colors hover:bg-surface-2', grey && 'bg-subtle/60 text-muted')}>
        <td className="px-4 py-2.5">
          <button type="button" data-nav="row" onClick={onToggle} aria-expanded={isOpen} className="inline-flex items-center gap-1.5 rounded font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showDate(row.date)}
          </button>
        </td>
        <td className="tabular px-4 py-2.5 text-right">{row.kind === 'opening' && !grey ? '—' : cell(row.old)}</td>
        <td className="tabular px-4 py-2.5 text-right">{row.kind === 'opening' ? '—' : cell(row.goods)}</td>
        <td className="tabular px-4 py-2.5 text-right">{row.kind === 'opening' ? cell(row.opening) : cell(row.total)}</td>
        <td className="tabular px-4 py-2.5 text-right">{cell(row.paid)}</td>
        <td className={cn('tabular px-4 py-2.5 text-right font-semibold', !grey && row.balance > 0n && 'text-rose-600 dark:text-rose-400')}>{groupDigits(row.balance)}</td>
        <td className="max-w-[240px] truncate px-4 py-2.5">
          {grey ? <Badge tone="red">bekor qilingan</Badge> : rowNote(row)}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-surface-2/60">
          <td colSpan={7} className="p-0">
            <RowDetail row={row} writable={writable} onCancel={onCancel} renderDetail={renderDetail} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Qator ochilganda: yozuvlar (tovar qatorlari, to'lov usuli, izoh, hujjatga havola, bekor qilish) */
function RowDetail({ row, writable, onCancel, renderDetail }: { row: SheetRow; writable: boolean; onCancel: (e: SheetEntry) => void; renderDetail?: (e: SheetEntry) => ReactNode }) {
  return (
    <ul className="divide-y divide-line border-t border-line px-4 py-1 text-[13px]" aria-label="Qator tafsiloti">
      {row.entries.map((e) => (
        <li key={e.id} className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn('font-medium', e.cancelled && 'text-muted line-through')}>
              {e.ref === 'sale' ? (
                <Link href={`/sales/${e.id}`} className="hover:underline">
                  {ENTRY_LABEL[e.ref]}
                </Link>
              ) : (
                ENTRY_LABEL[e.ref]
              )}
            </span>
            <Money value={e.amount} className={cn('font-semibold', e.cancelled ? 'text-muted line-through' : e.kind === 'payment' ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg')} />
            {e.kind === 'payment' && e.method && <Badge>{uz.methods[e.method as 'naqd' | 'karta' | 'otkazma'] ?? e.method}</Badge>}
            {e.cancelled && <Badge tone="red">bekor qilingan</Badge>}
            {e.note && <span className="text-muted">Izoh: {e.note}</span>}
            {e.cancelReason && <span className="text-muted">Sabab: {e.cancelReason}</span>}
            {!e.cancelled && writable && (
              <Button variant="ghost" size="sm" className="no-print ml-auto" onClick={() => onCancel(e)} icon={<Ban className="h-3.5 w-3.5" />} aria-label={`${ENTRY_LABEL[e.ref]}ni bekor qilish`}>
                Bekor qilish
              </Button>
            )}
          </div>
          {renderDetail && <div className="mt-1.5 text-xs text-muted">{renderDetail(e)}</div>}
        </li>
      ))}
    </ul>
  );
}

