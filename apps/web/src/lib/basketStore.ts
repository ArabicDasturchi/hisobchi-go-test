/**
 * Savat ombori (F2): bitta interfeys, ikki joy.
 *  - `server`: Supabase (migratsiya 015) — qurilmalar orasida, versiya to'qnashuvi serverda tekshiriladi.
 *  - `local`: shu brauzer (localStorage) — 015 hali qo'llanmagan server yoki demo rejim. Sahifa yangilansa ham,
 *    boshqa bo'limga o'tib qaytsa ham saqlanadi; boshqa qurilmaga o'tmaydi (UI buni aytadi).
 * Ikkalasida ham: versiya (`expectedVersion`), takror yuborish idempotent (`clientOpId`), yopilgan savat o'zgarmaydi.
 * Savat pul yozuvi emas: jurnalga hech narsa yozilmaydi.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BasketConflictError, closeBasket, isBasketServerUnavailable, listOpenBaskets, saveBasket, type BasketKind } from './data/baskets';
import { AppError } from './errors';

export interface StoredBasket {
  id: string;
  kind: BasketKind;
  partnerId: string | null;
  lines: unknown[];
  version: number;
  updatedAt: string;
  sourceDraftId: string | null;
}

export interface SaveInput {
  id: string;
  kind: BasketKind;
  partnerId: string | null;
  lines: unknown[];
  expectedVersion: number | null;
  clientOpId: string;
}

export interface BasketStore {
  mode: 'server' | 'local';
  list: () => Promise<StoredBasket[]>;
  save: (b: SaveInput) => Promise<{ version: number }>;
  close: (id: string, status: 'done' | 'discarded', documentId?: string | null, expectedVersion?: number | null) => Promise<void>;
}

export function createServerStore(sb: SupabaseClient, shopId: string): BasketStore {
  return {
    mode: 'server',
    list: async () =>
      (await listOpenBaskets(sb, shopId)).map((r) => ({
        id: r.id,
        kind: r.kind,
        partnerId: r.kind === 'sale' ? r.customer_id : r.supplier_id,
        lines: Array.isArray(r.lines) ? r.lines : [],
        version: r.version,
        updatedAt: r.updated_at,
        sourceDraftId: r.source_draft_id,
      })),
    save: async (b) => ({ version: (await saveBasket(sb, { shopId, basketId: b.id, kind: b.kind, partnerId: b.partnerId, lines: b.lines, expectedVersion: b.expectedVersion, clientOpId: b.clientOpId })).version }),
    close: (id, status, documentId, expectedVersion) => closeBasket(sb, { shopId, basketId: id, status, documentId, expectedVersion }),
  };
}

/** localStorage'ga o'xshash (testda Map bilan almashtiriladi) */
export interface KeyValueStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
}

interface LocalRecord extends StoredBasket {
  status: 'open' | 'done' | 'discarded';
  lastOpId: string | null;
}

const LOCAL_LIMIT = 100;

export function createLocalStore(storage: KeyValueStorage | null, shopId: string, now: () => string = () => new Date().toISOString()): BasketStore {
  const key = `hisobchi:savat:${shopId}`;
  // Saqlash ishlamasa (yashirin rejim, to'la) — sahifa ichida xotirada qoladi
  let memory: LocalRecord[] = [];
  const read = (): LocalRecord[] => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return memory;
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as LocalRecord[]).filter((r) => r && typeof r.id === 'string') : memory;
    } catch {
      return memory;
    }
  };
  const write = (rows: LocalRecord[]) => {
    // Yopilganlar saqlanmaydi (faqat ochiqlar), ro'yxat o'smasin
    memory = rows.filter((r) => r.status === 'open');
    try {
      storage?.setItem(key, JSON.stringify(memory));
    } catch {
      // xotirada qoladi
    }
  };
  const strip = (r: LocalRecord): StoredBasket => ({ id: r.id, kind: r.kind, partnerId: r.partnerId, lines: r.lines, version: r.version, updatedAt: r.updatedAt, sourceDraftId: r.sourceDraftId });
  return {
    mode: 'local',
    list: async () => read().filter((r) => r.status === 'open').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(strip),
    save: async (b) => {
      const rows = read();
      const at = rows.findIndex((r) => r.id === b.id);
      if (at < 0) {
        if (b.expectedVersion !== null) throw new AppError('not_found', 'Savat topilmadi.');
        if (rows.length >= LOCAL_LIMIT) throw new AppError('validation', "Ochiq savatlar juda ko'p (100 ta). Keraksizlarini tashlang.");
        write([...rows, { id: b.id, kind: b.kind, partnerId: b.partnerId, lines: b.lines, version: 1, updatedAt: now(), sourceDraftId: null, status: 'open', lastOpId: b.clientOpId }]);
        return { version: 1 };
      }
      const cur = rows[at]!;
      if (cur.lastOpId === b.clientOpId) return { version: cur.version };
      if (cur.version !== b.expectedVersion) throw new BasketConflictError(cur.version);
      const next: LocalRecord = { ...cur, partnerId: b.partnerId, lines: b.lines, version: cur.version + 1, updatedAt: now(), lastOpId: b.clientOpId };
      write(rows.map((r, i) => (i === at ? next : r)));
      return { version: next.version };
    },
    close: async (id, status, _documentId, expectedVersion) => {
      const rows = read();
      const cur = rows.find((r) => r.id === id);
      if (!cur) return; // allaqachon yopilgan (ochiqlar ro'yxatida yo'q) — idempotent
      if (status === 'discarded' && expectedVersion != null && expectedVersion !== cur.version) throw new BasketConflictError(cur.version);
      write(rows.map((r) => (r.id === id ? { ...r, status } : r)));
    },
  };
}

/**
 * Server savatni qo'llab-quvvatlasa — server ombori, aks holda (015 yo'q, demo) — mahalliy. Tarmoq xatosi kabi
 * boshqa xatolar yuqoriga uzatiladi (jim mahalliy rejimga o'tilmaydi: ma'lumot ikki joyga bo'linib ketmasin).
 */
export async function resolveBasketStore(sb: SupabaseClient, shopId: string, storage: KeyValueStorage | null): Promise<{ store: BasketStore; baskets: StoredBasket[] }> {
  const server = createServerStore(sb, shopId);
  try {
    return { store: server, baskets: await server.list() };
  } catch (e) {
    if (!isBasketServerUnavailable(e)) throw e;
    const local = createLocalStore(storage, shopId);
    return { store: local, baskets: await local.list() };
  }
}
