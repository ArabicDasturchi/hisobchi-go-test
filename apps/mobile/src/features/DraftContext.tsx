/**
 * Joriy qoralama (kiritilgan matn → tekshirilayotgan qatorlar).
 *
 * - clientOpId har bir yangi tahlilda bir marta yaratiladi — takroriy saqlashdan himoya.
 * - Qoralama SQLite `drafts` jadvaliga avtomatik saqlanadi (400 ms kechikish bilan,
 *   ilova fonga o'tganda darhol) va ilova qayta ochilganda tiklanadi.
 * - Savdo saqlanganda qoralama ledger tranzaksiyasi ichida o'chiriladi (ledger.postSale).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { parseProductList } from '@hisobchi/core';
import { useDraftStore } from '../data/LedgerProvider';
import { editRow, emptyRow, rowsFromParsed, type DraftRow } from './draft';

export interface Draft {
  rawInput: string;
  rows: DraftRow[];
  clientOpId: string;
}

interface DraftApi {
  draft: Draft | null;
  /** Saqlangan qoralama yuklab bo'lindimi */
  ready: boolean;
  /** Oxirgi muvaffaqiyatli avtomatik saqlash vaqti (ISO) */
  savedAt: string | null;
  /** Avtomatik saqlash xatosi (matn) */
  persistError: string | null;
  /** Bazadagi qoralama buzilgan bo'lsa (tiklab bo'lmadi) */
  corrupt: { updatedAt: string; reason: string } | null;
  /** Matnni tahlil qiladi; qatorlar soni qaytariladi */
  startFromText(text: string): number;
  /** Matnsiz, bitta bo'sh qator bilan qo'lda kiritishni boshlaydi */
  startManual(): void;
  updateRow(key: string, patch: Parameters<typeof editRow>[1]): void;
  acknowledgeRow(key: string): void;
  removeRow(key: string): void;
  addRow(): void;
  /** Savdo saqlangandan keyin (bazadagi qoralama postSale ichida o'chirilgan) */
  clear(): void;
  /** Foydalanuvchi qoralamani o'chiradi */
  discard(): Promise<void>;
}

const DraftContext = createContext<DraftApi | null>(null);
const SAVE_DELAY_MS = 400;

export function DraftProvider({ children }: { children: ReactNode }) {
  const store = useDraftStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [corrupt, setCorrupt] = useState<DraftApi['corrupt']>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Draft | null>(null);

  // Ilova ochilganda saqlangan qoralamani tiklash
  useEffect(() => {
    let active = true;
    store
      .load()
      .then((r) => {
        if (!active) return;
        if (r.status === 'ok') {
          setDraft(r.draft);
          setSavedAt(r.updatedAt);
        } else if (r.status === 'corrupt') {
          setCorrupt({ updatedAt: r.updatedAt, reason: r.reason });
        }
      })
      .catch((e: unknown) => active && setPersistError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [store]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const toSave = pending.current;
    pending.current = null;
    if (!toSave) return;
    try {
      const result = await store.save(toSave);
      if (result === 'saved') setSavedAt(new Date().toISOString());
      setPersistError(null);
    } catch (e) {
      setPersistError(e instanceof Error ? e.message : String(e));
    }
  }, [store]);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  // O'zgarishdan keyin avtomatik saqlash
  useEffect(() => {
    if (!ready || !draft) return;
    pending.current = draft;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [draft, ready, flush]);

  // Ilova fonga o'tsa — kutmasdan saqlash
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
    return () => sub.remove();
  }, [flush]);

  const mapRows = useCallback((fn: (rows: DraftRow[]) => DraftRow[]) => {
    setDraft((d) => (d ? { ...d, rows: fn(d.rows) } : d));
  }, []);

  const api = useMemo<DraftApi>(
    () => ({
      draft,
      ready,
      savedAt,
      persistError,
      corrupt,
      startFromText(text) {
        const rows = rowsFromParsed(parseProductList(text), randomUUID);
        if (rows.length === 0) return 0; // mavjud qoralama bo'sh natija bilan almashtirilmaydi
        setCorrupt(null);
        setDraft({ rawInput: text, rows, clientOpId: randomUUID() });
        return rows.length;
      },
      startManual() {
        setCorrupt(null);
        setDraft({ rawInput: '', rows: [emptyRow(randomUUID())], clientOpId: randomUUID() });
      },
      updateRow: (key, patch) => mapRows((rows) => rows.map((r) => (r.key === key ? editRow(r, patch) : r))),
      acknowledgeRow: (key) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, acknowledged: true } : r))),
      removeRow: (key) => mapRows((rows) => rows.filter((r) => r.key !== key)),
      addRow: () => mapRows((rows) => [...rows, emptyRow(randomUUID())]),
      clear() {
        cancelPending();
        setDraft(null);
        setSavedAt(null);
      },
      async discard() {
        cancelPending();
        setDraft(null);
        setSavedAt(null);
        setCorrupt(null);
        await store.discard();
      },
    }),
    [draft, ready, savedAt, persistError, corrupt, mapRows, cancelPending, store],
  );

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftApi {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('DraftProvider topilmadi');
  return ctx;
}
