/**
 * Supabase klienti — faqat EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY berilganda yaratiladi.
 * Ilovaga faqat "anon" (public) kalit joylanadi; service-role kaliti hech qachon mobil ilovada bo'lmaydi.
 * Sessiya AsyncStorage'da saqlanadi (Expo Go'da mavjud) va ilova qayta ochilganda tiklanadi.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';
import { AUTH_CALLBACK_PATH } from './authLinks';
import type { CloudClient } from './cloud';

// Expo faqat to'g'ridan-to'g'ri yozilgan process.env.EXPO_PUBLIC_* ni bundle'ga joylaydi
const URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const cloudConfigured = URL.startsWith('https://') && ANON_KEY.length > 20;

const REQUEST_TIMEOUT_MS = 20_000;

/** So'rov 20 soniyada javob bermasa — bekor qilinadi (tarmoq xatosi sifatida qayta uriniladi) */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) outer.addEventListener('abort', () => controller.abort());
  return fetch(input, { ...init, signal: controller.signal })
    .catch((e: unknown) => {
      if (controller.signal.aborted && !outer?.aborted) throw new Error('Network request failed: timeout');
      throw e;
    })
    .finally(() => clearTimeout(t));
};

let client: SupabaseClient | null = null;
let appStateHooked = false;

export function getSupabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE: email havolasi ?code=... bilan qaytadi; code_verifier shu qurilmada saqlanadi
        flowType: 'pkce',
      },
      global: { fetch: fetchWithTimeout },
    });
  }
  if (!appStateHooked) {
    appStateHooked = true;
    // Supabase tavsiyasi: ilova faol bo'lganda tokenni yangilash, fonda — to'xtatish
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

/** SupabaseClient → tiplangan CloudClient (ekranlar Supabase API'ga bevosita bog'lanmaydi) */
export function toCloudClient(sb: SupabaseClient): CloudClient {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await sb.rpc(fn, args);
      return { data: (data as T) ?? null, error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null };
    },
    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
      return { data: null, error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null };
    },
    async selectAll<T>(table: string, columns: string, shopId: string, filter?: { column: string; value: string }) {
      const PAGE = 1000; // PostgREST standart maksimal qatorlar soni
      const out: T[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(table).select(columns).eq('shop_id', shopId);
        if (filter) q = q.eq(filter.column, filter.value);
        const { data, error } = await q.order('id').range(from, from + PAGE - 1);
        if (error) return { data: null, error: { message: error.message, code: error.code, details: error.details, hint: error.hint } };
        out.push(...((data ?? []) as T[]));
        if (!data || data.length < PAGE) break;
      }
      return { data: out, error: null };
    },
  };
}

/**
 * Email tasdiqlash havolasi qaytadigan manzil:
 *   development/production build: hisobchigo://auth/callback
 *   Expo Go:                      exp://<kompyuter-IP>:8081/--/auth/callback
 * Ikkalasi ham Supabase → Authentication → URL Configuration → Redirect URLs ro'yxatida bo'lishi shart.
 */
export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}
