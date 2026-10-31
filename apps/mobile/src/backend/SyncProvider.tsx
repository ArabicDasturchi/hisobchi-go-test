/**
 * Avtomatik bulut sinxronlash (bir tomonlama push) — faqat kirilgan va do'koni bor foydalanuvchi uchun.
 *
 * Qachon ishlaydi: kirish/do'kon yuklanganda, ilova faollashganda, `requestSync()` chaqirilganda
 * (savdo/to'lovdan keyin) va navbatda yozuv bo'lsa — davriy (tarmoq xatosida 30s → 5 daq).
 * Bir vaqtda faqat bitta push. Server idempotent — qayta yuborish dublikat yaratmaydi.
 * Natija (oxirgi vaqt, xato) SQLite'da saqlanadi va ilova qayta ochilganda ko'rsatiladi.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { useSqlDb } from '../data/LedgerProvider';
import { useAuth } from './AuthProvider';
import type { CloudError } from './cloud';
import { pullFromCloud, type PullResult } from './pull';
import { getSupabase, toCloudClient } from './supabase';
import {
  ensureShopBinding,
  loadSyncMeta,
  nextSyncDelay,
  pendingCount,
  pushToCloud,
  saveSyncMeta,
  SYNC_BASE_DELAY_MS,
  type PushResult,
} from './sync';

interface SyncApi {
  /** Bulut sinxronlash mumkinmi (kirilgan + do'kon bor) */
  enabled: boolean;
  running: boolean;
  pending: number | null;
  lastSyncAt: string | null;
  /** Oxirgi urinish xatosi (joriy sessiyada — CloudError; ilova qayta ochilganda — saqlangan matn) */
  lastError: CloudError | null;
  lastErrorText: string | null;
  lastResult: PushResult | null;
  /** Oxirgi bulutdan import (web yoki boshqa qurilmadagi yozuvlar) */
  lastPull: PullResult | null;
  /** Darhol sinxronlash (tugma) */
  syncNow(): Promise<void>;
  /** Yangi yozuvdan keyin — biroz kechikib sinxronlash */
  requestSync(): void;
}

const NOOP: SyncApi = {
  enabled: false,
  running: false,
  pending: null,
  lastSyncAt: null,
  lastError: null,
  lastErrorText: null,
  lastResult: null,
  lastPull: null,
  syncNow: async () => {},
  requestSync: () => {},
};

const SyncContext = createContext<SyncApi>(NOOP);

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const sql = useSqlDb();
  const shopId = auth.status === 'signed-in' ? auth.shopId : null;
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<CloudError | null>(null);
  const [lastErrorText, setLastErrorText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PushResult | null>(null);
  const [lastPull, setLastPull] = useState<PullResult | null>(null);
  const runningRef = useRef(false);
  const delayRef = useRef<number | null>(SYNC_BASE_DELAY_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSyncMeta(sql)
      .then((m) => {
        setLastSyncAt(m.lastSyncAt);
        setLastErrorText(m.lastError);
      })
      .catch(() => {});
  }, [sql]);

  const refreshPending = useCallback(async () => {
    if (!shopId) return setPending(null);
    setPending(await pendingCount(sql, shopId));
  }, [sql, shopId]);

  const run = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !shopId || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const now = () => new Date().toISOString();
      const binding = await ensureShopBinding(sql, shopId, now());
      if (!binding.ok) {
        setLastError(binding.error);
        setLastErrorText(binding.error.message);
        delayRef.current = null; // avtomatik urinmaydi — foydalanuvchi harakati kerak
        return;
      }
      const cloud = toCloudClient(sb);
      // 1) telefondagi o'zgarishlar yuqoriga, 2) web/boshqa qurilmadagi yozuvlar pastga (faqat qo'shish)
      const res = await pushToCloud(sql, cloud, shopId, { now });
      setLastResult(res);
      // Pull push'dagi yozuvga xos xatoda ham bajariladi (web ma'lumoti ko'rinishi uchun);
      // tarmoq yoki sessiya xatosida esa ma'nosiz — o'tkazib yuboriladi.
      const pushBlocked = res.error && (res.error.kind === 'network' || res.error.kind === 'auth');
      const pull = pushBlocked ? null : await pullFromCloud(sql, cloud, shopId, { now, newId: randomUUID });
      if (pull) setLastPull(pull);
      const error = res.error ?? pull?.error ?? null;
      setLastError(error);
      setLastErrorText(error?.message ?? null);
      const at = error ? lastSyncAt : now();
      if (!error) setLastSyncAt(at);
      await saveSyncMeta(sql, { lastSyncAt: at, lastError: error?.message ?? null }, now());
      delayRef.current = nextSyncDelay(delayRef.current, error);
    } finally {
      runningRef.current = false;
      setRunning(false);
      await refreshPending().catch(() => {});
    }
  }, [sql, shopId, lastSyncAt, refreshPending]);

  // Kirish / do'kon yuklanganda — darhol
  useEffect(() => {
    delayRef.current = SYNC_BASE_DELAY_MS;
    void refreshPending();
    if (shopId) void run();
    // run'ni dependency'ga qo'shilmaydi: faqat do'kon o'zgarganda
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Davriy tekshiruv: navbatda yozuv bo'lsa va avtomatik urinish ruxsat etilgan bo'lsa
  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const n = await pendingCount(sql, shopId);
        setPending(n);
        if (n > 0 && delayRef.current !== null) await run();
      } catch {
        // lokal o'qish xatosi — keyingi tick
      }
      if (!cancelled) timer.current = setTimeout(tick, delayRef.current ?? SYNC_BASE_DELAY_MS);
    };
    timer.current = setTimeout(tick, SYNC_BASE_DELAY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        delayRef.current = delayRef.current ?? SYNC_BASE_DELAY_MS;
        void tick();
      }
    });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      sub.remove();
    };
  }, [sql, shopId, run]);

  const api = useMemo<SyncApi>(
    () => ({
      enabled: shopId !== null,
      running,
      pending,
      lastSyncAt,
      lastError,
      lastErrorText,
      lastResult,
      lastPull,
      async syncNow() {
        delayRef.current = SYNC_BASE_DELAY_MS; // qo'lda urinish avtomatik to'xtashni bekor qiladi
        await run();
      },
      requestSync() {
        if (!shopId) return;
        void refreshPending();
        setTimeout(() => {
          if (delayRef.current !== null) void run();
        }, 1500);
      },
    }),
    [shopId, running, pending, lastSyncAt, lastError, lastErrorText, lastResult, lastPull, run, refreshPending],
  );

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  return useContext(SyncContext);
}
