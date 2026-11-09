'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseApi } from './api';
import { createDemoApi } from './demo';
import { DEMO_MODE } from './env';
import { errorMessage, isForbidden } from './errors';
import { getSupabase } from './supabase/client';
import type { AdminApi } from './types';

let api: AdminApi | null = null;

/** Demo yoki haqiqiy API (brauzerda bitta nusxa) */
export function getApi(): AdminApi {
  if (!api) api = DEMO_MODE ? createDemoApi() : createSupabaseApi(getSupabase());
  return api;
}

export interface AsyncState<T> {
  data: T | null;
  /** Foydalanuvchiga ko'rsatiladigan xabar */
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Yuklash holati: loading → data yoki error ("Qayta urinish" = reload).
 * Admin huquqi yo'qligi aniqlansa, /forbidden ga o'tadi. `deps` o'zgarsa qayta yuklanadi;
 * eski so'rov natijasi yangisini bosib ketmaydi.
 */
export function useAsync<T>(load: (api: AdminApi) => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const router = useRouter();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let stale = false;
    loadRef
      .current(getApi())
      .then((data) => {
        if (!stale) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (stale) return;
        if (isForbidden(err)) {
          router.replace('/forbidden');
          return;
        }
        setState((prev) => ({ data: prev.data, error: errorMessage(err), loading: false }));
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps chaqiruvchi tomonidan beriladi (load ref orqali o'qiladi)
  }, [router, tick, ...deps]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, loading: true }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, reload };
}
