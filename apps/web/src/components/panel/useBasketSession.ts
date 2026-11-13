'use client';
/**
 * Savat sessiyasi (F2): paneldagi joriy savdo/kirim qatorlari savatga avtomatik saqlanadi (700 ms kechikish bilan),
 * shuning uchun boshqa bo'limga o'tib qaytganda ham, sahifa yangilansa ham yo'qolmaydi. Bir nechta ochiq savat:
 * tepadagi chiplar bilan biridan ikkinchisiga o'tiladi (har mijozga alohida savdo).
 *
 * - Bo'sh yangi savat saqlanmaydi. Saqlangan savatning hamma qatori o'chirilsa savat tashlanadi (discarded).
 * - Versiya: har saqlashda klient ko'rgan versiya yuboriladi; boshqa qurilma o'zgartirgan bo'lsa `conflict` ochiladi
 *   va avtosaqlash to'xtaydi (jimgina ustiga yozilmaydi): savdogar "serverdagini olish" yoki "meniki qolsin" ni tanlaydi.
 * - Tasdiqlash: savdo/kirim kaliti savat id sidan (`basket:<id>`) — tasdiqlashdan keyin savatni yopish uzilib qolsa ham
 *   qayta tasdiqlash takroriy savdo yaratmaydi (server client_op_id bo'yicha o'sha hujjatni qaytaradi).
 * Pul hisobi yo'q: savat faqat ish holati.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BasketKind } from '@/lib/data/baskets';
import { BasketConflictError } from '@/lib/data/baskets';
import type { BasketStore, StoredBasket } from '@/lib/basketStore';
import { errorMessage } from '@/lib/errors';

const SAVE_DELAY_MS = 700;

export interface BasketConflict {
  server: StoredBasket | null;
}

export interface BasketSessionInput<L> {
  store: BasketStore | null;
  kind: BasketKind;
  /** Shu amal panelda ochiqmi (faqat ochiq amal saqlanadi) */
  active: boolean;
  lines: readonly L[];
  partnerId: string | null;
  serialize: (lines: readonly L[]) => unknown[];
  /** Ochiq savatlar ro'yxati o'zgarganda (chiplar uchun) */
  onListChange: (fn: (list: StoredBasket[]) => StoredBasket[]) => void;
}

const snapshot = (partnerId: string | null, lines: unknown[]) => JSON.stringify({ p: partnerId, l: lines });
const newId = () => crypto.randomUUID();

export function useBasketSession<L>(input: BasketSessionInput<L>) {
  const { store, kind, active, onListChange } = input;
  const [currentId, setCurrentId] = useState<string>(newId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<BasketConflict | null>(null);
  /** Savat saqlangan (yoki ochilgan) hamkor: amal almashib qaytganda tiklanadi */
  const [partnerId, setPartnerId] = useState<string | null>(null);

  /** Saqlangan versiya (UI uchun; mantiq `versionRef` da) */
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const { serialize, lines: inputLines } = input;
  const stored = useMemo(() => serialize(inputLines), [serialize, inputLines]);
  const idRef = useRef(currentId);
  const versionRef = useRef<number | null>(null);
  const lastSavedRef = useRef(snapshot(null, []));
  const latestRef = useRef({ partnerId: input.partnerId, lines: stored });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const conflictRef = useRef(false);
  /** Yakunlanmagan (javobi kelmagan) saqlashning op id si: o'sha holat qayta yuborilsa ishlatiladi */
  const pendingOpRef = useRef<{ id: string; snap: string; op: string } | null>(null);

  useEffect(() => {
    latestRef.current = { partnerId: input.partnerId, lines: stored };
  }, [input.partnerId, stored]);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inflightRef.current) await inflightRef.current;
    if (!store || conflictRef.current) return;
    const { partnerId: p, lines } = latestRef.current;
    const snap = snapshot(p, lines);
    if (snap === lastSavedRef.current) return;
    const id = idRef.current;
    const run = (async () => {
      setSaving(true);
      try {
        if (lines.length === 0) {
          // Hamma qator o'chirildi: saqlangan savat tashlanadi, yangisi bo'sh boshlanadi
          if (versionRef.current !== null) {
            await store.close(id, 'discarded', null, versionRef.current);
            onListChange((list) => list.filter((b) => b.id !== id));
          }
          if (idRef.current !== id) return;
          versionRef.current = null;
          setSavedVersion(null);
          lastSavedRef.current = snap;
          setPartnerId(p);
          setError(null);
          return;
        }
        // O'sha holatni qayta yuborishda o'sha op id: javob yo'qolgan bo'lsa server takrorni taniydi (idempotent),
        // soxta version_conflict chiqmaydi
        const op = pendingOpRef.current?.id === id && pendingOpRef.current.snap === snap ? pendingOpRef.current.op : newId();
        pendingOpRef.current = { id, snap, op };
        const res = await store.save({ id, kind, partnerId: p, lines, expectedVersion: versionRef.current, clientOpId: op });
        pendingOpRef.current = null;
        // Javob kelguncha boshqa savatga o'tilgan bo'lsa (finish/discard/open), yangi savat holatiga tegilmaydi
        if (idRef.current !== id) return;
        versionRef.current = res.version;
        setSavedVersion(res.version);
        lastSavedRef.current = snap;
        setPartnerId(p);
        setError(null);
        const row: StoredBasket = { id, kind, partnerId: p, lines, version: res.version, updatedAt: new Date().toISOString(), sourceDraftId: null };
        onListChange((list) => {
          const prev = list.find((b) => b.id === id);
          return [{ ...row, sourceDraftId: prev?.sourceDraftId ?? null }, ...list.filter((b) => b.id !== id)];
        });
      } catch (e) {
        // Javob kelguncha boshqa savatga o'tilgan bo'lsa, eski savat xatosi yangisida ko'rsatilmaydi
        if (idRef.current !== id) return;
        if (e instanceof BasketConflictError) {
          conflictRef.current = true;
          let server: StoredBasket | null = null;
          try {
            server = (await store.list()).find((b) => b.id === id) ?? null;
          } catch {
            server = null;
          }
          setConflict({ server });
          setError(errorMessage(e));
        } else {
          setError(errorMessage(e));
        }
      } finally {
        setSaving(false);
      }
    })();
    inflightRef.current = run;
    await run;
    inflightRef.current = null;
  }, [store, kind, onListChange]);

  // Avtosaqlash: faqat ochiq amalda, o'zgarish bo'lsa, kechikish bilan
  const latestSnap = snapshot(input.partnerId, stored);
  const empty = stored.length === 0;
  useEffect(() => {
    if (!store || !active || conflictRef.current) return;
    if (latestSnap === lastSavedRef.current) return;
    if (versionRef.current === null && empty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [latestSnap, empty, store, active, flush]);

  // Sahifadan chiqishda kechikib qolgan saqlash yuborilsin
  useEffect(() => () => void flush(), [flush]);

  function adopt(id: string, version: number | null, p: string | null, lines: unknown[]) {
    idRef.current = id;
    versionRef.current = version;
    setSavedVersion(version);
    lastSavedRef.current = snapshot(p, lines);
    conflictRef.current = false;
    setConflict(null);
    setError(null);
    setPartnerId(p);
    setCurrentId(id);
  }

  /** Boshqa savatni ochish: joriysi avval saqlanadi */
  async function open(b: StoredBasket): Promise<StoredBasket> {
    await flush();
    adopt(b.id, b.version, b.partnerId, b.lines);
    return b;
  }

  /** Yangi bo'sh savat (joriysi saqlanib qoladi) */
  async function startNew(): Promise<void> {
    await flush();
    adopt(newId(), null, null, []);
  }

  /** Tasdiqlandi: savat `done` (hujjat bilan), keyingi savdo yangi savatda. Yopish xatosi tasdiqni bekor qilmaydi */
  async function finish(documentId: string): Promise<string | null> {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Uchib turgan saqlash avval tugasin (aks holda u yangi savatga eski versiyani yozib qo'yishi mumkin edi)
    if (inflightRef.current) await inflightRef.current;
    const id = idRef.current;
    let warn: string | null = null;
    if (store && versionRef.current !== null) {
      try {
        await store.close(id, 'done', documentId);
      } catch (e) {
        warn = `Savdo saqlandi, lekin savat yopilmadi: ${errorMessage(e)} Savatni «Savat» bo'limidan tashlang (qayta tasdiqlash takroriy yozuv yaratmaydi).`;
      }
    }
    onListChange((list) => list.filter((b) => b.id !== id));
    adopt(newId(), null, null, []);
    return warn;
  }

  /** Joriy savatni tashlash (qatorlar ham tozalanadi chaqiruvchida) */
  async function discard(): Promise<void> {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (inflightRef.current) await inflightRef.current;
    const id = idRef.current;
    if (store && versionRef.current !== null) {
      await store.close(id, 'discarded', null, versionRef.current);
      onListChange((list) => list.filter((b) => b.id !== id));
    }
    adopt(newId(), null, null, []);
  }

  /** To'qnashuv: serverdagi holatni olish */
  function takeServer(): StoredBasket | null {
    const s = conflict?.server ?? null;
    if (s) {
      adopt(s.id, s.version, s.partnerId, s.lines);
      onListChange((list) => list.map((b) => (b.id === s.id ? s : b)));
    } else {
      // Serverda yo'q (boshqa qurilmada yopilgan): joriy qatorlar yangi savatga
      adopt(newId(), null, null, []);
    }
    return s;
  }

  /** To'qnashuv: mening holatim serverdagi versiya ustiga yoziladi (ongli tanlov) */
  async function keepMine(): Promise<void> {
    const s = conflict?.server ?? null;
    conflictRef.current = false;
    setConflict(null);
    if (s) versionRef.current = s.version;
    else {
      idRef.current = newId();
      versionRef.current = null;
      setCurrentId(idRef.current);
    }
    lastSavedRef.current = '';
    await flush();
  }

  return {
    currentId,
    /** Savdo/kirim kalitlari: savat id sidan (qayta tasdiqlash idempotent) */
    keys: { documentId: currentId, clientOpId: `basket:${currentId}` },
    saved: savedVersion !== null,
    partnerId,
    saving,
    error,
    conflict,
    flush,
    open,
    startNew,
    finish,
    discard,
    takeServer,
    keepMine,
  };
}
