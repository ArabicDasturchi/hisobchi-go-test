/**
 * Tugallanmagan qoralama (ilovadan chiqib ketganda ma'lumot yo'qolmasligi uchun).
 *
 * - `drafts` jadvali ledger'dan butunlay alohida: savdo, ledger va mijoz balansiga ta'sir qilmaydi.
 * - Bitta faol qoralama ('active').
 * - Saqlangan JSON qat'iy tekshiriladi; buzilgan bo'lsa ilova yiqilmaydi — 'corrupt' qaytadi.
 * - Shu client_op_id bilan savdo allaqachon saqlangan bo'lsa, qoralama qayta yozilmaydi
 *   (kechikkan avtomatik saqlash tasdiqlangan savdoni "tiriltirmasligi" uchun).
 */
import { ALLOWED_UNITS, type ValidationIssue } from '@hisobchi/core';
import type { DraftRow } from '../features/draft';
import type { SqlConn, SqlDb } from './db';

export const ACTIVE_DRAFT_ID = 'active';
const PAYLOAD_VERSION = 1;

export interface StoredDraft {
  rawInput: string;
  rows: DraftRow[];
  clientOpId: string;
}

export type LoadDraftResult =
  | { status: 'none' }
  | { status: 'ok'; draft: StoredDraft; updatedAt: string }
  | { status: 'corrupt'; updatedAt: string; reason: string };

const isString = (v: unknown): v is string => typeof v === 'string';

function parseIssue(v: unknown): ValidationIssue | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isString(o.code) || !isString(o.message)) return null;
  if (o.severity !== 'error' && o.severity !== 'warning') return null;
  if (o.field !== undefined && !isString(o.field)) return null;
  return { code: o.code, message: o.message, severity: o.severity, ...(o.field ? { field: o.field } : {}) };
}

function parseRow(v: unknown): DraftRow | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isString(o.key) || !isString(o.rawText) || !isString(o.productName)) return null;
  if (!isString(o.qtyText) || !isString(o.priceText)) return null;
  if (o.source !== 'parsed' && o.source !== 'manual') return null;
  if (o.unit !== null && !(ALLOWED_UNITS as readonly unknown[]).includes(o.unit)) return null;
  if (typeof o.acknowledged !== 'boolean' || !Array.isArray(o.parserIssues)) return null;
  const issues = o.parserIssues.map(parseIssue);
  if (issues.some((i) => i === null)) return null;
  return {
    key: o.key,
    source: o.source,
    rawText: o.rawText,
    productName: o.productName,
    qtyText: o.qtyText,
    unit: o.unit as DraftRow['unit'],
    priceText: o.priceText,
    parserIssues: issues as ValidationIssue[],
    acknowledged: o.acknowledged,
  };
}

/** Saqlangan JSON'ni qat'iy tekshiradi. Noto'g'ri bo'lsa sababini qaytaradi. */
export function parseDraftPayload(payload: string): { ok: true; draft: StoredDraft } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "JSON o'qilmadi" };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: "obyekt emas" };
  const o = data as Record<string, unknown>;
  if (o.version !== PAYLOAD_VERSION) return { ok: false, reason: `noma'lum versiya: ${String(o.version)}` };
  if (!isString(o.rawInput) || !isString(o.clientOpId) || !o.clientOpId) return { ok: false, reason: "maydonlar noto'g'ri" };
  if (!Array.isArray(o.rows)) return { ok: false, reason: "qatorlar ro'yxat emas" };
  const rows = o.rows.map(parseRow);
  if (rows.some((r) => r === null)) return { ok: false, reason: "qator formati noto'g'ri" };
  return { ok: true, draft: { rawInput: o.rawInput, clientOpId: o.clientOpId, rows: rows as DraftRow[] } };
}

export function serializeDraft(draft: StoredDraft): string {
  return JSON.stringify({ version: PAYLOAD_VERSION, ...draft });
}

/** Tasdiqlangan savdo bilan bir tranzaksiyada qoralamani o'chirish uchun */
export async function deleteDraftForOp(tx: SqlConn, clientOpId: string): Promise<void> {
  await tx.run('DELETE FROM drafts WHERE id = ? AND client_op_id = ?', [ACTIVE_DRAFT_ID, clientOpId]);
}

export function createDraftStore(db: SqlDb, deps: { now: () => string }) {
  return {
    async load(): Promise<LoadDraftResult> {
      const row = await db.get<{ payload: string; updated_at: string }>(
        'SELECT payload, updated_at FROM drafts WHERE id = ?',
        [ACTIVE_DRAFT_ID],
      );
      if (!row) return { status: 'none' };
      const parsed = parseDraftPayload(row.payload);
      return parsed.ok
        ? { status: 'ok', draft: parsed.draft, updatedAt: row.updated_at }
        : { status: 'corrupt', updatedAt: row.updated_at, reason: parsed.reason };
    },

    /** Qoralamani yozadi. Shu client_op_id bilan savdo allaqachon saqlangan bo'lsa — hech narsa qilmaydi. */
    async save(draft: StoredDraft): Promise<'saved' | 'skipped'> {
      return db.transaction(async (tx) => {
        const sold = await tx.get<{ id: string }>('SELECT id FROM sales WHERE client_op_id = ?', [draft.clientOpId]);
        if (sold) return 'skipped';
        await tx.run(
          `INSERT INTO drafts (id, client_op_id, payload, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET client_op_id = excluded.client_op_id,
             payload = excluded.payload, updated_at = excluded.updated_at`,
          [ACTIVE_DRAFT_ID, draft.clientOpId, serializeDraft(draft), deps.now()],
        );
        return 'saved';
      });
    },

    async discard(): Promise<void> {
      await db.run('DELETE FROM drafts WHERE id = ?', [ACTIVE_DRAFT_ID]);
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
